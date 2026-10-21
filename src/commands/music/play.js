const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class PlayCommand {
    constructor() {
        this.name = 'play';
        this.aliases = ['pl', 'np', 'nowplaying', 'song', 'current'];
        this.description = 'play a song or display now playing controls.';
        this.category = 'music';
        this.cooldown = 2;
    }

    async execute(message, args, commandName) {
        const invoked = (commandName || '').toLowerCase();
        const isNp = ['np', 'nowplaying', 'song', 'current'].includes(invoked);
        const music = message.client.music;
        let queue = music?.getQueue(message.guild.id);

        // If invoked as nowplaying or no query provided with active track
        const query = args.join(' ').trim();
        if (isNp || (!query && queue && queue.current)) {
            if (!queue || !queue.current) {
                return message.reply({
                    embeds: [build.warn(message.author, 'there is nothing currently playing.')]
                });
            }

            const payload = queue.buildCardPayload();
            if (payload) {
                try {
                    return await message.reply(payload);
                } catch (_) {}
            }

            // Fallback Embed
            const track = queue.current;
            const elapsed = queue.getPlaybackDuration();
            const formatSec = (s) => {
                if (!s || isNaN(s) || s <= 0) return '0:00';
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60);
                return `${m}:${sec < 10 ? '0' : ''}${sec}`;
            };
            const banner = build.getAssetAttachment('music.png');
            const files = banner ? [banner] : [];
            const embed = build.say(
                message.author,
                `### [${track.title.toLowerCase()}](${track.url})\n` +
                `-# **artist** \`${(track.author || 'unknown').toLowerCase()}\` · **duration** \`${formatSec(elapsed)} / ${formatSec(track.duration)}\`\n` +
                `-# **volume** \`${queue.volume}%\` · **loop** \`${queue.loop}\` · **queue** \`${queue.tracks.length} track(s)\` · **requested by** <@${track.requester.id}>`
            );
            if (banner) embed.setImage('attachment://music.png');
            return await message.reply({
                embeds: [embed],
                components: [queue.buildControlsRow()],
                files
            });
        }

        const memberVoice = message.member?.voice?.channel;
        if (!memberVoice) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in a voice channel to use this command.')]
            });
        }

        const permissions = memberVoice.permissionsFor(message.client.user);
        if (!permissions?.has('Connect') || !permissions?.has('Speak')) {
            return message.reply({
                embeds: [build.deny(message.author, 'harm needs `connect` and `speak` permissions in your voice channel.')]
            });
        }

        if (queue && queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        // If no query is provided, check if we can resume paused playback
        if (!query) {
            if (queue && queue.paused) {
                queue.resume();
                return message.reply({
                    embeds: [build.approved(message.author, 'resumed playback.')]
                });
            }
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: ,play <song name or url>')]
            });
        }

        const searchMsg = await message.reply({
            embeds: [build.say(message.author, `searching for \`${query.slice(0, 80)}\`...`)]
        }).catch(() => null);

        try {
            const result = await music.search(query, message.author);
            if (!result || (!result.track && (!result.tracks || result.tracks.length === 0))) {
                const failEmbed = [build.warn(message.author, `no results found for \`${query.slice(0, 80)}\`.`)];
                if (searchMsg) return searchMsg.edit({ embeds: failEmbed }).catch(() => {});
                return message.reply({ embeds: failEmbed });
            }

            queue = music.getOrCreateQueue(message.guild, memberVoice, message.channel);

            if (result.isPlaylist) {
                for (const t of result.tracks) {
                    queue.enqueue(t);
                }
                const count = result.tracks.length;
                const confirmEmbed = [build.approved(message.author, `added **${count}** tracks from **${result.title}** to the queue.`)];
                if (searchMsg) await searchMsg.edit({ embeds: confirmEmbed }).catch(() => {});

                if (!queue.current) {
                    await queue.play();
                }
            } else {
                const track = result.track;
                if (!queue.current) {
                    queue.enqueue(track);
                    if (searchMsg) await searchMsg.delete().catch(() => {});
                    await queue.play();
                } else {
                    queue.enqueue(track);
                    const position = queue.tracks.length;
                    const confirmEmbed = [build.approved(
                        message.author,
                        `added [${track.title.toLowerCase()}](${track.url}) to position **#${position}** in queue.`
                    )];
                    if (searchMsg) await searchMsg.edit({ embeds: confirmEmbed }).catch(() => {});
                }
            }
        } catch (err) {
            console.error('[play command error]:', err);
            const errEmbed = [build.deny(message.author, 'failed to fetch or stream the requested audio.')];
            if (searchMsg) return searchMsg.edit({ embeds: errEmbed }).catch(() => {});
            return message.reply({ embeds: errEmbed });
        }
    }
}

module.exports = PlayCommand;
