const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType
} = require('@discordjs/voice');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags,
    EmbedBuilder,
    AttachmentBuilder
} = require('discord.js');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const build = require('../builder.js');
const config = require('../../../config.js');

// Binary paths
const ytdlpPath = path.resolve(__dirname, '../bin/yt-dlp.exe');
const ffmpegPath = path.resolve(__dirname, '../bin/ffmpeg.exe');

let playDl = null;
try { playDl = require('play-dl'); } catch (_) {}

function formatDuration(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '0:00';
    const s = Math.floor(sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function getMusicBannerAttachment() {
    const candidates = [
        path.resolve(__dirname, '../assets/banners/music.png'),
        path.resolve(__dirname, '../../structures/utils/assets/banners/music.png'),
        path.resolve(__dirname, '../../../assets/banners/music.png')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return new AttachmentBuilder(p, { name: 'music.png' });
        }
    }
    return null;
}

/**
 * Smart thumbnail cache with TTL and fallback resolution
 * Keeps RAM usage lightweight (512MB+ VPS friendly)
 */
class SmartThumbnailCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(url) {
        if (!url) return null;
        const entry = this.cache.get(url);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(url);
            return null;
        }
        return entry.value;
    }

    set(url, value, ttlMs = 1000 * 60 * 60) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(url, { value, expiresAt: Date.now() + ttlMs });
    }

    resolveThumbnail(track, guild, client) {
        if (track && track.thumbnail) {
            const cached = this.get(track.thumbnail);
            if (cached) return cached;
            this.set(track.thumbnail, track.thumbnail);
            return track.thumbnail;
        }
        // Graceful fallbacks
        if (track && track.requester && typeof track.requester.displayAvatarURL === 'function') {
            return track.requester.displayAvatarURL({ dynamic: true, size: 256 });
        }
        if (guild && typeof guild.iconURL === 'function') {
            const icon = guild.iconURL({ dynamic: true, size: 256 });
            if (icon) return icon;
        }
        if (client && client.user && typeof client.user.displayAvatarURL === 'function') {
            return client.user.displayAvatarURL({ dynamic: true, size: 256 });
        }
        return null;
    }

    sweep() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }
}

class GuildQueue {
    constructor(manager, guild, voiceChannel, textChannel) {
        this.manager = manager;
        this.client = manager.client;
        this.guild = guild;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;

        this.connection = null;
        this.player = createAudioPlayer();
        this.resource = null;

        this.tracks = [];
        this.history = []; // Capped at 15 for low-memory environments
        this.current = null;

        // Default playback volume: 70% as requested
        this.volume = 70;
        this.loop = 'off'; // 'off' | 'track' | 'queue'
        this.autoplay = false;
        this.paused = false;

        // Digital Signal Processing / Audio Filters state
        this.filters = {
            bassboost: null, // null | 'soft' | 'medium' | 'hard'
            nightcore: false,
            vaporwave: false,
            eightD: false,
            karaoke: false
        };

        this.currentProcess = null;
        this.fallbackProcess = null;
        this.isFallbackStream = false;
        this.manuallySkipped = false;
        this.playbackStartedAt = 0;
        this.pausedAt = 0;
        this.totalPausedDuration = 0;
        this.seekOffset = 0;

        this.disconnectTimer = null;
        this.emptyChannelTimer = null;
        this.updateDebounceTimer = null;
        this.nowPlayingMessage = null;

        this._setupPlayerListeners();
    }

    _setupPlayerListeners() {
        this.player.on(AudioPlayerStatus.Playing, () => {
            this.clearDisconnectTimer();
            this.paused = false;
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            this._cleanupProcess();
            this._handleTrackEnd();
        });

        this.player.on('error', (err) => {
            console.error(`[music player error in guild ${this.guild.id}]:`, err.message);
            this._cleanupProcess();
            this._handleTrackEnd(true);
        });
    }

    getPlaybackDuration() {
        if (!this.playbackStartedAt) return 0;
        let now = Date.now();
        if (this.paused && this.pausedAt) {
            now = this.pausedAt;
        }
        const elapsedMs = now - this.playbackStartedAt - this.totalPausedDuration;
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000)) + this.seekOffset;
        if (this.current && this.current.duration) {
            return Math.min(elapsedSec, this.current.duration);
        }
        return elapsedSec;
    }

    _cleanupProcess() {
        if (this.currentProcess) {
            const proc = this.currentProcess;
            this.currentProcess = null;
            try {
                if (proc.stdout) proc.stdout.destroy();
                if (proc.stderr) proc.stderr.destroy();
                if (proc.stdin) proc.stdin.destroy();
                proc.kill();
            } catch (_) {}
            this.manager.unregisterProcess(proc);
        }
        if (this.fallbackProcess) {
            const fProc = this.fallbackProcess;
            this.fallbackProcess = null;
            try {
                if (fProc.stdout) fProc.stdout.destroy();
                if (fProc.stderr) fProc.stderr.destroy();
                if (fProc.stdin) fProc.stdin.destroy();
                fProc.kill();
            } catch (_) {}
            this.manager.unregisterProcess(fProc);
        }
    }

    clearDisconnectTimer() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
        }
    }

    startDisconnectTimer(seconds = 180, reason = 'inactivity') {
        if (this.current && this.player.state.status === AudioPlayerStatus.Playing) {
            return;
        }
        this.clearDisconnectTimer();
        this.disconnectTimer = setTimeout(() => {
            this.destroy(reason);
        }, seconds * 1000);
    }

    clearEmptyChannelTimer() {
        if (this.emptyChannelTimer) {
            clearTimeout(this.emptyChannelTimer);
            this.emptyChannelTimer = null;
        }
    }

    startEmptyChannelTimer(seconds = 15) {
        this.clearEmptyChannelTimer();
        this.emptyChannelTimer = setTimeout(() => {
            // Re-verify that listeners are STILL 0 before leaving
            const listeners = this.countHumanListeners();
            if (listeners === 0) {
                if (this.textChannel) {
                    this.textChannel.send({
                        embeds: [build.say(this.guild.client.user, 'left voice channel because no one was listening.')]
                    }).catch(() => {});
                }
                this.destroy('channel empty');
            } else {
                this.emptyChannelTimer = null;
            }
        }, seconds * 1000);
    }

    getConnectedVoiceChannel() {
        const me = this.guild.members.me;
        if (me?.voice?.channel) return me.voice.channel;
        if (this.voiceChannel) return this.voiceChannel;
        return null;
    }

    countHumanListeners() {
        const channel = this.getConnectedVoiceChannel();
        if (!channel) return 0;

        const botId = this.client.user?.id;
        let count = 0;

        for (const [memberId, voiceState] of this.guild.voiceStates.cache) {
            if (voiceState.channelId !== channel.id) continue;
            if (memberId === botId) continue;

            const member = voiceState.member || this.guild.members.cache.get(memberId);
            if (member?.user?.bot) continue;

            count++;
        }

        return count;
    }

    async connect() {
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            return this.connection;
        }

        this.connection = joinVoiceChannel({
            channelId: this.voiceChannel.id,
            guildId: this.guild.id,
            adapterCreator: this.guild.voiceAdapterCreator,
            selfDeaf: true
        });

        this.connection.subscribe(this.player);

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000)
                ]);
            } catch (_) {
                this.destroy('disconnected from voice channel');
            }
        });

        this.connection.on(VoiceConnectionStatus.Destroyed, () => {
            this.destroy('voice connection closed');
        });

        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
            return this.connection;
        } catch (err) {
            this.destroy('failed to join voice channel');
            throw err;
        }
    }

    enqueue(track, position = null) {
        if (position !== null && position >= 0) {
            this.tracks.splice(position, 0, track);
        } else {
            this.tracks.push(track);
        }

        // Background pre-fetch stream URL for smooth playback transition
        if (this.current && this.tracks.length <= 2 && !track.streamUrl) {
            this._resolveStreamUrl(track.url).then(url => {
                track.streamUrl = url;
            }).catch(() => {});
        }
    }

    buildFilterChain(volValue) {
        const chain = ['aresample=48000:resample_cutoff=1.0:precision=28:filter_type=kaiser'];

        if (this.filters.bassboost === 'soft') {
            chain.push('equalizer=f=60:width_type=h:width=50:g=6,equalizer=f=120:width_type=h:width=100:g=4');
        } else if (this.filters.bassboost === 'medium') {
            chain.push('equalizer=f=60:width_type=h:width=50:g=11,equalizer=f=120:width_type=h:width=100:g=7');
        } else if (this.filters.bassboost === 'hard') {
            chain.push('equalizer=f=60:width_type=h:width=50:g=16,equalizer=f=120:width_type=h:width=100:g=10,bass=g=8');
        }

        if (this.filters.nightcore) {
            chain.push('asetrate=48000*1.25,aresample=48000,atempo=1.05');
        } else if (this.filters.vaporwave) {
            chain.push('asetrate=48000*0.82,aresample=48000,atempo=1.0');
        }

        if (this.filters.eightD) {
            chain.push('apulsator=hz=0.125');
        }

        if (this.filters.karaoke) {
            chain.push('stereotools=mlev=0.03:slev=1.3');
        }

        chain.push(`volume=eval=frame:precision=double:volume=${volValue}`);
        chain.push('alimiter=limit=0.98:attack=5:release=50:asc=1');

        return chain.join(',');
    }

    async applyFilters(newFilters = {}) {
        this.filters = { ...this.filters, ...newFilters };
        if (this.current) {
            const currentSec = this.getPlaybackDuration();
            this.tracks.unshift(this.current);
            this.current = null;
            await this.play(currentSec);
        }
    }

    async resetFilters() {
        this.filters = {
            bassboost: null,
            nightcore: false,
            vaporwave: false,
            eightD: false,
            karaoke: false
        };
        if (this.current) {
            const currentSec = this.getPlaybackDuration();
            this.tracks.unshift(this.current);
            this.current = null;
            await this.play(currentSec);
        }
    }

    async play(seekSeconds = 0, isRetryFallback = false) {
        if (!this.current && this.tracks.length === 0) {
            this.startDisconnectTimer(180, 'queue finished');
            return;
        }

        if (!this.current) {
            this.current = this.tracks.shift();
        }

        await this.connect();

        // Check if humans are currently present
        const listeners = this.countHumanListeners();
        if (listeners === 0) {
            this.startEmptyChannelTimer(15);
        } else {
            this.clearEmptyChannelTimer();
        }

        this._cleanupProcess();
        this.seekOffset = seekSeconds;
        this.playbackStartedAt = Date.now();
        this.pausedAt = 0;
        this.totalPausedDuration = 0;
        this.paused = false;
        this.manuallySkipped = false;
        this.isFallbackStream = isRetryFallback;

        const track = this.current;

        // Background pre-fetch next track in queue
        if (this.tracks.length > 0 && !this.tracks[0].streamUrl) {
            this._resolveStreamUrl(this.tracks[0].url).then(url => {
                if (this.tracks[0]) this.tracks[0].streamUrl = url;
            }).catch(() => {});
        }

        try {
            const volValue = (this.volume / 100).toFixed(2);

            if (!isRetryFallback) {
                // Method 1: Resolve stream URL and transcode with ffmpeg + headers
                let streamUrl = track.streamUrl;
                if (!streamUrl) {
                    streamUrl = await this._resolveStreamUrl(track.url);
                    track.streamUrl = streamUrl;
                }

                const ffmpegArgs = [
                    '-reconnect', '1',
                    '-reconnect_streamed', '1',
                    '-reconnect_delay_max', '5',
                    '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n',
                    '-probesize', '1000000',
                    '-analyzeduration', '1000000'
                ];

                if (seekSeconds > 0) {
                    ffmpegArgs.push('-ss', String(seekSeconds));
                }

                ffmpegArgs.push(
                    '-i', streamUrl,
                    '-af', this.buildFilterChain(volValue),
                    '-c:a', 'libopus',
                    '-b:a', '320k',
                    '-vbr', 'on',
                    '-compression_level', '10',
                    '-frame_duration', '20',
                    '-application', 'audio',
                    '-ar', '48000',
                    '-ac', '2',
                    '-f', 'ogg',
                    'pipe:1'
                );

                this.currentProcess = spawn(ffmpegPath, ffmpegArgs, {
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                });

                this.manager.registerProcess(this.currentProcess);

                this.currentProcess.on('error', (err) => {
                    console.error(`[ffmpeg spawn error]:`, err.message);
                    this._retryWithFallback(track, seekSeconds);
                });

                this.resource = createAudioResource(this.currentProcess.stdout, {
                    inputType: StreamType.OggOpus
                });

                this.player.play(this.resource);
            } else {
                // Method 2 (Fallback): Direct yt-dlp pipe into ffmpeg
                const ytdlArgs = [
                    '-f', 'bestaudio/best',
                    '-o', '-',
                    '--no-warnings',
                    '--no-check-certificates',
                    track.url
                ];

                this.fallbackProcess = spawn(ytdlpPath, ytdlArgs, {
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                this.manager.registerProcess(this.fallbackProcess);

                const ffmpegArgs = [
                    '-i', 'pipe:0',
                    '-af', this.buildFilterChain(volValue),
                    '-c:a', 'libopus',
                    '-b:a', '320k',
                    '-vbr', 'on',
                    '-compression_level', '10',
                    '-frame_duration', '20',
                    '-application', 'audio',
                    '-ar', '48000',
                    '-ac', '2',
                    '-f', 'ogg',
                    'pipe:1'
                ];

                this.currentProcess = spawn(ffmpegPath, ffmpegArgs, {
                    windowsHide: true,
                    stdio: ['pipe', 'pipe', 'ignore']
                });
                this.manager.registerProcess(this.currentProcess);

                this.fallbackProcess.stdout.pipe(this.currentProcess.stdin);
                this.fallbackProcess.stdout.on('error', () => {});
                this.currentProcess.stdin.on('error', () => {});

                this.currentProcess.on('error', (err) => {
                    console.error(`[fallback ffmpeg error]:`, err.message);
                    this._cleanupProcess();
                    this._handleTrackEnd(true);
                });

                this.resource = createAudioResource(this.currentProcess.stdout, {
                    inputType: StreamType.OggOpus
                });

                this.player.play(this.resource);
            }

            // Record track into persistent SQLite playback history
            if (this.client.db && typeof this.client.db.addMusicHistory === 'function') {
                this.client.db.addMusicHistory(this.guild.id, track);
            }

            // Send or update Now Playing card
            if (seekSeconds === 0 && !isRetryFallback) {
                await this.sendNowPlayingCard();
            }
        } catch (err) {
            console.error(`[music playback error in ${this.guild.id}]:`, err.message);
            if (!isRetryFallback) {
                return this._retryWithFallback(track, seekSeconds);
            }
            if (this.textChannel) {
                this.textChannel.send({
                    embeds: [build.warn(this.guild.client.user, `unable to stream \`${track.title}\`, skipping...`)]
                }).catch(() => {});
            }
            this._handleTrackEnd(true);
        }
    }

    _retryWithFallback(track, seekSeconds = 0) {
        this._cleanupProcess();
        return this.play(seekSeconds, true);
    }

    _resolveStreamUrl(url) {
        return new Promise((resolve, reject) => {
            execFile(ytdlpPath, [
                '-g',
                '-f', 'bestaudio/best',
                '--no-warnings',
                '--no-check-certificates',
                url
            ], { timeout: 30000 }, (err, stdout, stderr) => {
                if (err) return reject(new Error(`yt-dlp stream resolution failed: ${stderr || err.message}`));
                const streamUrl = stdout.trim().split('\n')[0].trim();
                if (!streamUrl) return reject(new Error('no stream url found'));
                resolve(streamUrl);
            });
        });
    }

    _handleTrackEnd(isFailure = false) {
        if (!this.current) return;

        const durationPlayed = (Date.now() - this.playbackStartedAt) / 1000;
        // If stream exited under 2.5s without manual skip and without fallback yet, retry with fallback pipe
        if (!isFailure && !this.manuallySkipped && !this.isFallbackStream && durationPlayed < 2.5) {
            return this._retryWithFallback(this.current, this.seekOffset);
        }

        const wasStreamFailure = isFailure || (!this.manuallySkipped && durationPlayed < 2.5);

        // Loop handling
        if (this.loop === 'track' && !wasStreamFailure) {
            return this.play();
        }

        // Low-memory optimization: strip heavy stream URL before pushing to history
        const finishedTrack = { ...this.current, streamUrl: null };
        if (!wasStreamFailure) {
            this.history.push(finishedTrack);
            if (this.history.length > 15) this.history.shift();
        }

        if (this.loop === 'queue' && !wasStreamFailure) {
            this.tracks.push(finishedTrack);
        }

        this.current = null;
        this.isFallbackStream = false;

        if (this.tracks.length > 0) {
            if (wasStreamFailure && this.textChannel) {
                this.textChannel.send({
                    embeds: [build.warn(this.guild.client.user, `unable to stream \`${finishedTrack.title.toLowerCase()}\`, moving to next track.`)]
                }).catch(() => {});
            }
            this.play();
        } else if (this.autoplay && !wasStreamFailure) {
            // Intelligent Autoplay: continuously queue matching recommended songs
            this.manager.getAutoplayTrack(finishedTrack, this.history).then(nextTrack => {
                if (nextTrack) {
                    this.enqueue(nextTrack);
                    if (this.textChannel) {
                        this.textChannel.send({
                            embeds: [build.say(this.guild.client.user, `autoplay queued [${nextTrack.title.toLowerCase()}](${nextTrack.url}) by \`${nextTrack.author.toLowerCase()}\`.`)]
                        }).catch(() => {});
                    }
                    this.play();
                } else {
                    this.startDisconnectTimer(180, 'queue finished');
                }
            }).catch(() => {
                this.startDisconnectTimer(180, 'queue finished');
            });
        } else {
            this.startDisconnectTimer(180, 'queue finished');
            if (this.textChannel) {
                if (wasStreamFailure) {
                    this.textChannel.send({
                        embeds: [build.warn(this.guild.client.user, `unable to stream \`${finishedTrack.title.toLowerCase()}\`. harm will leave in 3 minutes if no new songs are added.`)]
                    }).catch(() => {});
                } else {
                    this.textChannel.send({
                        embeds: [build.say(this.guild.client.user, 'queue finished. harm will leave in 3 minutes if no new songs are added.')]
                    }).catch(() => {});
                }
            }
        }
    }

    skip() {
        this.manuallySkipped = true;
        this.clearDisconnectTimer();
        if (this.loop === 'track') {
            this.loop = 'off';
        }
        this._cleanupProcess();
        this.player.stop(true);
    }

    previous() {
        if (this.history.length === 0) return false;
        const prevTrack = this.history.pop();
        if (this.current) {
            this.tracks.unshift(this.current);
        }
        this.current = prevTrack;
        this.play();
        return true;
    }

    pause() {
        if (this.paused) return false;
        this.paused = true;
        this.pausedAt = Date.now();
        this.player.pause();
        return true;
    }

    resume() {
        if (!this.paused) return false;
        this.paused = false;
        if (this.pausedAt) {
            this.totalPausedDuration += Date.now() - this.pausedAt;
            this.pausedAt = 0;
        }
        this.player.unpause();
        return true;
    }

    stop() {
        this.tracks = [];
        this.history = [];
        this.current = null;
        this._cleanupProcess();
        this.player.stop(true);
        this.destroy('stopped by user');
    }

    setVolume(vol) {
        this.volume = Math.max(1, Math.min(200, vol));
        // Lossless dynamic filter reload from current position
        if (this.current && this.player.state.status === AudioPlayerStatus.Playing) {
            const currentOffset = this.getPlaybackDuration();
            this.play(currentOffset);
        }
        return this.volume;
    }

    cycleLoop() {
        if (this.loop === 'off') this.loop = 'track';
        else if (this.loop === 'track') this.loop = 'queue';
        else this.loop = 'off';
        return this.loop;
    }

    toggleAutoplay() {
        this.autoplay = !this.autoplay;
        return this.autoplay;
    }

    shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
        return this.tracks.length;
    }

    seek(seconds) {
        if (!this.current) return false;
        const sec = Math.max(0, Math.min(this.current.duration || 3600, seconds));
        this.play(sec);
        return sec;
    }

    destroy(reason = 'queue destroyed') {
        this.clearDisconnectTimer();
        this.clearEmptyChannelTimer();
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
            this.updateDebounceTimer = null;
        }
        this._cleanupProcess();
        try { this.player.stop(true); } catch (_) {}
        if (this.connection) {
            try { this.connection.destroy(); } catch (_) {}
            this.connection = null;
        }
        // Aggressive memory cleanup
        this.tracks = [];
        this.history = [];
        this.current = null;
        this.nowPlayingMessage = null;
        this.manager.queues.delete(this.guild.id);
    }

    buildControlsRow() {
        const e = config.emojis || {};
        const btnPrev = new ButtonBuilder()
            .setCustomId('music_prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(this.history.length === 0);
        if (e.harm_prev) btnPrev.setEmoji(e.harm_prev);
        else btnPrev.setLabel('prev');

        const btnPlay = new ButtonBuilder()
            .setCustomId('music_playpause')
            .setStyle(this.paused ? ButtonStyle.Primary : ButtonStyle.Secondary);
        if (this.paused) {
            if (e.harm_play) btnPlay.setEmoji(e.harm_play);
            else btnPlay.setLabel('play');
        } else {
            if (e.harm_pause) btnPlay.setEmoji(e.harm_pause);
            else btnPlay.setLabel('pause');
        }

        const btnSkip = new ButtonBuilder()
            .setCustomId('music_skip')
            .setStyle(ButtonStyle.Secondary);
        if (e.harm_skip) btnSkip.setEmoji(e.harm_skip);
        else btnSkip.setLabel('skip');

        const btnLoop = new ButtonBuilder()
            .setCustomId('music_loop')
            .setStyle(this.loop !== 'off' ? ButtonStyle.Primary : ButtonStyle.Secondary);
        if (e.harm_loop) btnLoop.setEmoji(e.harm_loop);
        else btnLoop.setLabel('loop');

        const btnStop = new ButtonBuilder()
            .setCustomId('music_stop')
            .setStyle(ButtonStyle.Danger);
        if (e.harm_stop) btnStop.setEmoji(e.harm_stop);
        else btnStop.setLabel('stop');

        return new ActionRowBuilder().addComponents(btnPrev, btnPlay, btnSkip, btnLoop, btnStop);
    }

    buildCardPayload() {
        const track = this.current;
        if (!track) return null;

        const bannerAttachment = getMusicBannerAttachment();
        const files = bannerAttachment ? [bannerAttachment] : [];
        const elapsed = this.getPlaybackDuration();
        const durationFormatted = track.duration ? formatDuration(track.duration) : 'live';
        const elapsedFormatted = formatDuration(elapsed);

        const row = this.buildControlsRow();
        const thumbnail = this.manager.thumbnailCache.resolveThumbnail(track, this.guild, this.client);

        try {
            // Harm Components V2 Layout with Dark Theme Immersion (#0A0A0C)
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const descText = `### [${track.title.toLowerCase()}](${track.url})\n` +
                `-# **artist** \`${(track.author || 'unknown').toLowerCase()}\` · **duration** \`${elapsedFormatted} / ${durationFormatted}\`\n` +
                `-# **volume** \`${this.volume}%\` · **loop** \`${this.loop}\` · **autoplay** \`${this.autoplay ? 'on' : 'off'}\` · **queue** \`${this.tracks.length} track(s)\` · **requested by** <@${track.requester.id}>`;

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(descText)
            );

            if (thumbnail) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
            }
            container.addSectionComponents(section);

            // Mandatory Bottom Anchor Placement for All Command Banners
            if (bannerAttachment) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL('attachment://music.png')
                    )
                );
            }

            // Exactly 1 divider before action buttons
            container.addSeparatorComponents(
                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(SeparatorSpacingSize.Small)
            );

            container.addActionRowComponents(row);

            return {
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            };
        } catch (_) {
            // Fallback Embed
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors?.c || '#0A0A0C')
                .setDescription(
                    `### [${track.title.toLowerCase()}](${track.url})\n` +
                    `-# **artist** \`${(track.author || 'unknown').toLowerCase()}\` · **duration** \`${elapsedFormatted} / ${durationFormatted}\`\n` +
                    `-# **volume** \`${this.volume}%\` · **loop** \`${this.loop}\` · **autoplay** \`${this.autoplay ? 'on' : 'off'}\` · **queue** \`${this.tracks.length} track(s)\` · **requested by** <@${track.requester.id}>`
                );
            if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
            if (thumbnail) fallbackEmbed.setThumbnail(thumbnail);

            return {
                embeds: [fallbackEmbed],
                components: [row],
                files
            };
        }
    }

    async sendNowPlayingCard() {
        if (!this.textChannel) return;
        const payload = this.buildCardPayload();
        if (!payload) return;

        try {
            this.nowPlayingMessage = await this.textChannel.send(payload);
        } catch (_) {
            try {
                const bannerAttachment = getMusicBannerAttachment();
                const files = bannerAttachment ? [bannerAttachment] : [];
                const track = this.current;
                const elapsed = this.getPlaybackDuration();
                const durationFormatted = track.duration ? formatDuration(track.duration) : 'live';
                const elapsedFormatted = formatDuration(elapsed);
                const thumbnail = this.manager.thumbnailCache.resolveThumbnail(track, this.guild, this.client);

                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(
                        `### [${track.title.toLowerCase()}](${track.url})\n` +
                        `-# **artist** \`${(track.author || 'unknown').toLowerCase()}\` · **duration** \`${elapsedFormatted} / ${durationFormatted}\`\n` +
                        `-# **volume** \`${this.volume}%\` · **loop** \`${this.loop}\` · **queue** \`${this.tracks.length} track(s)\` · **requested by** <@${track.requester.id}>`
                    );
                if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
                if (thumbnail) fallbackEmbed.setThumbnail(thumbnail);

                this.nowPlayingMessage = await this.textChannel.send({
                    embeds: [fallbackEmbed],
                    components: [this.buildControlsRow()],
                    files
                });
            } catch (_) {}
        }
    }
}

class MusicManager {
    constructor(client) {
        this.client = client;
        this.queues = new Map();
        this.activeProcesses = new Set();
        this.thumbnailCache = new SmartThumbnailCache(120);

        // Periodic low-memory garbage collection sweep (every 3 minutes)
        this.gcInterval = setInterval(() => {
            this.runMemoryCleanup();
        }, 180_000);

        // Emergency shutdown hook: ensure all spawned child processes terminate
        const cleanupProcesses = () => {
            for (const proc of this.activeProcesses) {
                try { proc.kill(); } catch (_) {}
            }
            this.activeProcesses.clear();
        };
        process.once('exit', cleanupProcesses);
        process.once('SIGINT', cleanupProcesses);
        process.once('SIGTERM', cleanupProcesses);
    }

    registerProcess(proc) {
        if (!proc) return;
        this.activeProcesses.add(proc);
        proc.once('close', () => this.activeProcesses.delete(proc));
        proc.once('exit', () => this.activeProcesses.delete(proc));
        proc.once('error', () => this.activeProcesses.delete(proc));
    }

    unregisterProcess(proc) {
        if (!proc) return;
        this.activeProcesses.delete(proc);
    }

    runMemoryCleanup() {
        // Sweep expired thumbnail entries
        this.thumbnailCache.sweep();

        // Check active queues: if connection was lost, destroy queue
        for (const [guildId, queue] of this.queues) {
            if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
                queue.destroy('stale connection');
            }
        }

        // Low-Memory Mode (512MB+ VPS): run gentle garbage collection if available
        if (typeof global.gc === 'function') {
            try {
                const mem = process.memoryUsage();
                // Trigger GC if RSS exceeds 200MB
                if (mem.rss > 200 * 1024 * 1024) {
                    global.gc();
                }
            } catch (_) {}
        }
    }

    getQueue(guildId) {
        return this.queues.get(guildId) || null;
    }

    getOrCreateQueue(guild, voiceChannel, textChannel) {
        let q = this.queues.get(guild.id);
        if (!q) {
            q = new GuildQueue(this, guild, voiceChannel, textChannel);
            this.queues.set(guild.id, q);
        } else {
            if (voiceChannel) q.voiceChannel = voiceChannel;
            if (textChannel) q.textChannel = textChannel;
        }
        return q;
    }

    destroyAll() {
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
        }
        for (const [id, q] of this.queues) {
            q.destroy('bot shutdown');
        }
        this.queues.clear();
        for (const proc of this.activeProcesses) {
            try { proc.kill(); } catch (_) {}
        }
        this.activeProcesses.clear();
    }

    handleVoiceStateUpdate(oldState, newState) {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const queue = this.queues.get(guild.id);
        if (!queue) return;

        const botId = this.client.user?.id;

        // 1. If bot was forcibly disconnected from voice
        if (oldState.id === botId && !newState.channelId) {
            queue.destroy('bot disconnected by user');
            return;
        }

        // 2. If bot itself changed channels
        if (newState.id === botId && newState.channel) {
            queue.voiceChannel = newState.channel;
        }

        // 3. Check live human listener count in the bot's connected channel
        const humanListeners = queue.countHumanListeners();
        if (humanListeners === 0) {
            // No humans in VC - start 15-second timer before leaving
            if (!queue.emptyChannelTimer) {
                queue.startEmptyChannelTimer(15);
            }
        } else {
            // Someone is in the channel - cancel auto-leave
            queue.clearEmptyChannelTimer();
        }
    }

    async search(query, requester) {
        return new Promise(async (resolve, reject) => {
            const cleanQuery = query.trim();
            const isUrl = /^https?:\/\//i.test(cleanQuery);
            const isPlaylist = isUrl && (cleanQuery.includes('list=') || cleanQuery.includes('/playlist'));

            // Lightning Fast Search: Use play-dl InnerTube search API (~600ms vs ~12s with yt-dlp)
            if (!isUrl && playDl) {
                try {
                    const fastList = await playDl.search(cleanQuery, { limit: 5 });
                    if (Array.isArray(fastList) && fastList.length > 0) {
                        const scored = fastList.map((item, idx) => {
                            let score = 50;
                            const t = (item.title || '').toLowerCase();
                            const u = (item.channel?.name || '').toLowerCase();
                            const q = cleanQuery.toLowerCase();

                            if (!q.includes('lyric') && (t.includes('lyrics') || t.includes('lyric'))) score -= 100;
                            if (!q.includes('slow') && (t.includes('slowed') || t.includes('reverb'))) score -= 120;
                            if (!q.includes('sped') && !q.includes('speed') && (t.includes('sped up') || t.includes('speed up') || t.includes('nightcore') || t.includes('daycore'))) score -= 120;
                            if (!q.includes('edit') && (t.includes('edit') || t.includes('audio edit') || t.includes('tiktok'))) score -= 100;
                            if (!q.includes('cover') && (t.includes('cover') || t.includes('tribute'))) score -= 80;
                            if (!q.includes('remix') && t.includes('remix')) score -= 70;
                            if (!q.includes('live') && (t.includes('live') || t.includes('concert') || t.includes('snl') || t.includes('performance') || t.includes('acoustic'))) score -= 50;
                            if (t.includes('dance') && (t.includes('choreography') || t.includes('fitness') || t.includes('routine') || t.includes('studio') || t.includes('tutorial') || t.includes('workout'))) score -= 150;
                            if (t.includes('reaction') || t.includes('reacting') || t.includes('how to')) score -= 200;

                            if (item.durationInSec && item.durationInSec < 80 && !q.includes('snippet') && !q.includes('short')) score -= 80;

                            if (u.includes(' - topic')) score += 160;
                            if (u.includes('vevo')) score += 110;
                            if (t.includes('official audio')) score += 120;
                            else if (t.includes('official music video') || t.includes('official video')) score += 95;
                            else if (t.includes('official') || t.includes('audio')) score += 40;

                            const words = q.split(/\s+/).filter(w => w.length > 2);
                            for (const w of words) {
                                if (u.includes(w)) score += 35;
                            }
                            if (u.includes('media') || u.includes('records') || u.includes('music') || u.includes('entertainment')) score += 20;

                            return { item, score, idx };
                        });

                        scored.sort((a, b) => b.score - a.score);
                        const best = scored[0].item;

                        const track = {
                            title: best.title || 'unknown track',
                            url: best.url || (best.id ? `https://www.youtube.com/watch?v=${best.id}` : cleanQuery),
                            streamUrl: null,
                            duration: best.durationInSec || 0,
                            durationFormatted: best.durationRaw || formatDuration(best.durationInSec),
                            author: best.channel?.name || 'youtube',
                            thumbnail: best.thumbnail?.url || null,
                            requester
                        };

                        return resolve({ isPlaylist: false, track });
                    }
                } catch (_) {
                    // Fall back to yt-dlp below if play-dl throws
                }
            }

            const args = [
                '--dump-single-json',
                '--no-warnings',
                '--no-check-certificates'
            ];

            if (isPlaylist) {
                args.push('--flat-playlist');
                args.push(cleanQuery);
            } else if (isUrl) {
                args.push('-f', '251/bestaudio[ext=webm]/bestaudio/best');
                args.push(cleanQuery);
            } else {
                // Fetch top 10 results to apply smart studio-master ranking
                args.push('--flat-playlist');
                args.push(`ytsearch10:${cleanQuery}`);
            }

            const proc = spawn(ytdlpPath, args, { windowsHide: true });
            this.registerProcess(proc);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', d => stdout += d);
            proc.stderr.on('data', d => stderr += d);

            proc.on('close', code => {
                this.unregisterProcess(proc);
                if (code !== 0) {
                    return reject(new Error(`search failed: ${stderr || code}`));
                }
                try {
                    const data = JSON.parse(stdout);

                    // Playlist handling
                    if (isPlaylist && Array.isArray(data.entries)) {
                        const tracks = data.entries.slice(0, 100).map(item => ({
                            title: item.title || 'unknown track',
                            url: item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : data.webpage_url),
                            streamUrl: null,
                            duration: item.duration || 0,
                            durationFormatted: formatDuration(item.duration),
                            author: item.uploader || item.channel || 'youtube',
                            thumbnail: Array.isArray(item.thumbnails) && item.thumbnails.length ? item.thumbnails[item.thumbnails.length - 1].url : null,
                            requester
                        }));
                        return resolve({ isPlaylist: true, title: data.title || 'playlist', tracks });
                    }

                    // Direct single URL
                    if (isUrl) {
                        const item = data.entries ? data.entries[0] : data;
                        if (!item) return resolve(null);
                        const track = {
                            title: item.title || 'unknown track',
                            url: item.webpage_url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : cleanQuery),
                            streamUrl: item.url || null,
                            duration: item.duration || 0,
                            durationFormatted: formatDuration(item.duration),
                            author: item.uploader || item.channel || 'youtube',
                            thumbnail: Array.isArray(item.thumbnails) && item.thumbnails.length ? item.thumbnails[item.thumbnails.length - 1].url : (item.thumbnail || null),
                            requester
                        };
                        return resolve({ isPlaylist: false, track });
                    }

                    // Smart studio-grade scoring to eliminate low-effort re-uploads / lyrics / slowed / edits
                    if (!data.entries || data.entries.length === 0) {
                        return resolve(null);
                    }

                    const scored = data.entries.map((item, idx) => {
                        let score = 50;
                        const t = (item.title || '').toLowerCase();
                        const u = (item.uploader || item.channel || '').toLowerCase();
                        const q = cleanQuery.toLowerCase();

                        // Penalize non-authentic fan uploads unless explicitly requested
                        if (!q.includes('lyric') && (t.includes('lyrics') || t.includes('lyric'))) score -= 100;
                        if (!q.includes('slow') && (t.includes('slowed') || t.includes('reverb'))) score -= 120;
                        if (!q.includes('sped') && !q.includes('speed') && (t.includes('sped up') || t.includes('speed up') || t.includes('nightcore') || t.includes('daycore'))) score -= 120;
                        if (!q.includes('edit') && (t.includes('edit') || t.includes('audio edit') || t.includes('tiktok'))) score -= 100;
                        if (!q.includes('cover') && (t.includes('cover') || t.includes('tribute'))) score -= 80;
                        if (!q.includes('remix') && t.includes('remix')) score -= 70;
                        if (!q.includes('live') && (t.includes('live') || t.includes('concert') || t.includes('snl') || t.includes('performance') || t.includes('acoustic'))) score -= 50;
                        if (t.includes('dance') && (t.includes('choreography') || t.includes('fitness') || t.includes('routine') || t.includes('studio') || t.includes('tutorial') || t.includes('workout'))) score -= 150;
                        if (t.includes('reaction') || t.includes('reacting') || t.includes('how to')) score -= 200;

                        // Short snippet / meme video penalty
                        if (item.duration && item.duration < 80 && !q.includes('snippet') && !q.includes('short')) score -= 80;

                        // Reward authentic studio master releases
                        if (u.includes(' - topic')) score += 160; // Auto-generated by YouTube record labels (studio CD master)
                        if (u.includes('vevo')) score += 110;
                        if (t.includes('official audio')) score += 120;
                        else if (t.includes('official music video') || t.includes('official video')) score += 95;
                        else if (t.includes('official') || t.includes('audio')) score += 40;

                        // Reward artist relevance match in uploader name
                        const words = q.split(/\s+/).filter(w => w.length > 2);
                        for (const w of words) {
                            if (u.includes(w)) score += 35;
                        }
                        if (u.includes('media') || u.includes('records') || u.includes('music') || u.includes('entertainment')) score += 20;

                        return { item, score, idx };
                    });

                    scored.sort((a, b) => b.score - a.score);
                    const best = scored[0].item;

                    const track = {
                        title: best.title || 'unknown track',
                        url: best.webpage_url || (best.id ? `https://www.youtube.com/watch?v=${best.id}` : (best.url || cleanQuery)),
                        streamUrl: null,
                        duration: best.duration || 0,
                        durationFormatted: formatDuration(best.duration),
                        author: best.uploader || best.channel || 'youtube',
                        thumbnail: Array.isArray(best.thumbnails) && best.thumbnails.length ? best.thumbnails[best.thumbnails.length - 1].url : (best.thumbnail || null),
                        requester
                    };

                    resolve({ isPlaylist: false, track });
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    async getAutoplayTrack(currentTrack, history = []) {
        if (!currentTrack || !currentTrack.url) return null;

        let videoId = null;
        const match = currentTrack.url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (match) videoId = match[1];

        const historyUrls = new Set(history.map(t => t.url));
        if (currentTrack.url) historyUrls.add(currentTrack.url);

        return new Promise((resolve) => {
            const radioUrl = videoId
                ? `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`
                : `ytsearch10:${currentTrack.author} ${currentTrack.title} audio`;

            const args = [
                '--dump-single-json',
                '--flat-playlist',
                '--no-warnings',
                '--no-check-certificates',
                radioUrl
            ];

            const proc = spawn(ytdlpPath, args, { windowsHide: true });
            this.registerProcess(proc);

            let stdout = '';
            proc.stdout.on('data', d => stdout += d);

            proc.on('close', code => {
                this.unregisterProcess(proc);
                if (code !== 0) return resolve(null);
                try {
                    const data = JSON.parse(stdout);
                    if (!data.entries || !Array.isArray(data.entries)) return resolve(null);

                    // Filter out already played tracks
                    const candidates = data.entries.filter(e => {
                        const trackUrl = e.webpage_url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : e.url);
                        return trackUrl && !historyUrls.has(trackUrl);
                    });

                    if (candidates.length === 0) return resolve(null);

                    // Score candidates to prefer official studio quality
                    const scored = candidates.slice(0, 15).map((item, idx) => {
                        let score = 50;
                        const t = (item.title || '').toLowerCase();
                        const u = (item.uploader || item.channel || '').toLowerCase();

                        if (t.includes('lyrics') || t.includes('lyric')) score -= 100;
                        if (t.includes('slowed') || t.includes('reverb')) score -= 120;
                        if (t.includes('sped up') || t.includes('speed up') || t.includes('nightcore')) score -= 120;
                        if (t.includes('cover') || t.includes('edit')) score -= 80;

                        if (u.includes(' - topic')) score += 160;
                        if (u.includes('vevo')) score += 110;
                        if (t.includes('official audio')) score += 120;
                        else if (t.includes('official video') || t.includes('official music video')) score += 95;

                        // Slight index decay to avoid getting stuck on the same top slot
                        score -= idx * 2;

                        return { item, score };
                    });

                    scored.sort((a, b) => b.score - a.score);
                    const best = scored[0].item;

                    const track = {
                        title: best.title || 'unknown track',
                        url: best.webpage_url || (best.id ? `https://www.youtube.com/watch?v=${best.id}` : best.url),
                        streamUrl: null,
                        duration: best.duration || 0,
                        durationFormatted: formatDuration(best.duration),
                        author: best.uploader || best.channel || 'youtube',
                        thumbnail: Array.isArray(best.thumbnails) && best.thumbnails.length ? best.thumbnails[best.thumbnails.length - 1].url : (best.thumbnail || null),
                        requester: { id: this.client.user?.id, username: 'autoplay', bot: true }
                    };

                    resolve(track);
                } catch (_) {
                    resolve(null);
                }
            });
        });
    }

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;
        const guild = interaction.guild;
        if (!guild) return;

        const queue = this.queues.get(guild.id);
        if (!queue) {
            return interaction.reply({
                embeds: [build.warn(interaction.user, 'there is no active music session.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        // Voice channel guard
        const member = interaction.member;
        if (!member.voice?.channelId || member.voice.channelId !== queue.voiceChannel?.id) {
            return interaction.reply({
                embeds: [build.warn(interaction.user, 'you must be in the same voice channel as harm to control music.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        switch (customId) {
            case 'music_playpause': {
                if (queue.paused) {
                    queue.resume();
                    await interaction.reply({
                        embeds: [build.approved(interaction.user, 'resumed playback.')],
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                } else {
                    queue.pause();
                    await interaction.reply({
                        embeds: [build.approved(interaction.user, 'paused playback.')],
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                // Efficient debounced UI update to minimize CPU and Discord API rate limits
                if (queue.updateDebounceTimer) clearTimeout(queue.updateDebounceTimer);
                queue.updateDebounceTimer = setTimeout(async () => {
                    const payload = queue.buildCardPayload();
                    if (payload) await interaction.message.edit(payload).catch(() => {});
                }, 300);
                break;
            }
            case 'music_skip': {
                queue.skip();
                await interaction.reply({
                    embeds: [build.approved(interaction.user, 'skipped track.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
                break;
            }
            case 'music_prev': {
                const ok = queue.previous();
                if (ok) {
                    await interaction.reply({
                        embeds: [build.approved(interaction.user, 'playing previous track.')],
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                } else {
                    await interaction.reply({
                        embeds: [build.warn(interaction.user, 'no previous tracks in history.')],
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                break;
            }
            case 'music_loop': {
                const mode = queue.cycleLoop();
                await interaction.reply({
                    embeds: [build.approved(interaction.user, `loop mode set to \`${mode}\`.`)],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
                if (queue.updateDebounceTimer) clearTimeout(queue.updateDebounceTimer);
                queue.updateDebounceTimer = setTimeout(async () => {
                    const payload = queue.buildCardPayload();
                    if (payload) await interaction.message.edit(payload).catch(() => {});
                }, 300);
                break;
            }
            case 'music_stop': {
                queue.stop();
                await interaction.reply({
                    embeds: [build.approved(interaction.user, 'stopped music and cleared queue.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
                break;
            }
            default:
                break;
        }
    }
}

module.exports = MusicManager;
