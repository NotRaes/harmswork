const { ChannelType } = require('discord.js');
const VoiceMasterHelper = require('../helpers/voicemasterhelper.js');

class VoiceCleanerWorker {
    /**
     * Determines whether a voice channel is genuinely empty.
     * Uses the raw Discord gateway voiceStates cache as the primary authority,
     * ensuring users are not falsely declared disconnected when GuildMember objects
     * are uncached or swept.
     */
    static isChannelEmpty(guild, channelId) {
        if (!guild || !channelId) return true;

        // 1. Direct gateway voice state check (unaffected by member sweepers)
        if (guild.voiceStates?.cache) {
            if (typeof guild.voiceStates.cache.some === 'function') {
                if (guild.voiceStates.cache.some(vs => vs.channelId === channelId)) return false;
            } else {
                for (const vs of guild.voiceStates.cache.values()) {
                    if (vs.channelId === channelId) return false;
                }
            }
        }

        // 2. Fallback check against channel.members if channel exists in cache
        const ch = guild.channels?.cache?.get?.(channelId);
        if (ch && ch.members && (ch.members.size > 0 || ch.members.length > 0)) return false;

        return true;
    }

    /**
     * Prevents recently created voice channels from being purged prematurely
     * during member move operations or Discord voice-server handshakes.
     */
    static hasGracePeriod(channel, gracePeriodMs = 45_000) {
        if (!channel || !channel.createdTimestamp) return false;
        return (Date.now() - channel.createdTimestamp) < gracePeriodMs;
    }

    /**
     * Sweeps a specific guild for empty or orphaned VoiceMaster channels
     * and synchronizes the active VCs counter.
     */
    static async sweepGuild(guild, db) {
        if (!guild || !db) return;
        try {
            const setup = await db.getVoiceMasterSetup(guild.id);
            if (!setup) return;

            const categoryId = setup.category_id;
            const j2cId = setup.vc_id;
            const counterId = setup.counter_channel_id;
            const waitingRoomId = setup.waiting_room_id;

            const activeVCs = await db.getAllActiveVCs(guild.id);
            const activeMap = new Map();
            for (const avc of activeVCs) {
                activeMap.set(avc.channel_id, avc);
            }

            // 1. Check all tracked active VCs in database
            for (const [channelId] of activeMap) {
                let ch = guild.channels.cache.get(channelId);
                if (!ch) {
                    ch = await guild.channels.fetch(channelId).catch(() => null);
                }

                if (!ch) {
                    // Channel was manually deleted or no longer exists in Discord
                    await db.removeActiveVC(channelId);
                    continue;
                }

                // If channel was created within the grace period, do not delete it
                if (VoiceCleanerWorker.hasGracePeriod(ch)) {
                    continue;
                }

                if (VoiceCleanerWorker.isChannelEmpty(guild, channelId)) {
                    // Channel is genuinely empty, delete channel and remove from DB
                    await db.removeActiveVC(channelId);
                    await ch.delete('VoiceMaster cleaner: channel empty').catch(() => {});
                }
            }

            // 2. Check all voice channels in the VoiceMaster category for orphan channels
            if (categoryId) {
                let category = guild.channels.cache.get(categoryId);
                if (!category) {
                    category = await guild.channels.fetch(categoryId).catch(() => null);
                }

                if (category) {
                    // Fetch all channels in the guild to ensure full cache for this category
                    const categoryChannels = guild.channels.cache.filter(
                        c => c.parentId === categoryId && c.type === ChannelType.GuildVoice
                    );

                    for (const [, ch] of categoryChannels) {
                        // Skip system channels (j2c, counter channel, waiting room)
                        if (ch.id === j2cId || ch.id === counterId || ch.id === waitingRoomId) {
                            continue;
                        }

                        // Protect newly created channels with grace period
                        if (VoiceCleanerWorker.hasGracePeriod(ch)) {
                            continue;
                        }

                        // Check if genuinely empty
                        if (VoiceCleanerWorker.isChannelEmpty(guild, ch.id)) {
                            await db.removeActiveVC(ch.id);
                            await ch.delete('VoiceMaster cleaner: orphan empty channel').catch(() => {});
                        } else {
                            // Non-empty channel: ensure it is tracked in DB
                            const tracked = await db.getActiveVC(ch.id);
                            if (!tracked) {
                                const vs = guild.voiceStates.cache.find(s => s.channelId === ch.id);
                                const ownerId = vs?.id || ch.members?.first()?.id;
                                if (ownerId) {
                                    await db.addActiveVC(ch.id, ownerId, guild.id);
                                }
                            }
                        }
                    }
                }
            }

            // 3. Synchronize counter channel to the true active voice channel count
            await VoiceMasterHelper.updateCounter(guild, db);
        } catch (err) {
            console.error(`[voicecleaner error in guild ${guild.id}]:`, err.message);
        }
    }

    /**
     * Sweeps all guilds where the bot is currently joined
     */
    static async sweepAll(client) {
        if (!client || !client.isReady() || !client.db) return;
        const db = client.db;
        for (const guild of client.guilds.cache.values()) {
            await VoiceCleanerWorker.sweepGuild(guild, db).catch(() => {});
        }
    }

    /**
     * Starts the periodic background voice cleaner worker and executes an immediate startup sweep
     */
    static start(client, intervalMs = 30_000) {
        // Run an immediate sweep on startup to purge any channels left while offline
        VoiceCleanerWorker.sweepAll(client).catch(err => {
            console.error('[voicecleaner initial sweep error]:', err.message);
        });

        // Setup recurring background safety net interval
        const timer = setInterval(() => {
            VoiceCleanerWorker.sweepAll(client).catch(() => {});
        }, intervalMs);

        return timer;
    }
}

module.exports = VoiceCleanerWorker;
