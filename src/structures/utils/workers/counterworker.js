const { PermissionFlagsBits } = require('discord.js');

class CounterWorker {
    /**
     * Resolves the count for a given counter type in a guild.
     */
    static getCountForType(guild, type) {
        if (!guild) return 0;
        const t = (type || '').toLowerCase();

        switch (t) {
            case 'members':
            case 'member':
            case 'all':
                return guild.memberCount || 0;

            case 'humans':
            case 'human':
            case 'users': {
                const total = guild.memberCount || 0;
                const cachedBots = guild.members.cache.filter(m => m.user?.bot).size;
                return Math.max(0, total - cachedBots);
            }

            case 'bots':
            case 'bot':
                return guild.members.cache.filter(m => m.user?.bot).size;

            case 'boosts':
            case 'boost':
            case 'tier':
                return guild.premiumSubscriptionCount || 0;

            case 'roles':
            case 'role':
                return guild.roles.cache.size;

            case 'channels':
            case 'channel':
                return guild.channels.cache.size;

            case 'online': {
                let online = 0;
                for (const m of guild.members.cache.values()) {
                    if (m.presence?.status && m.presence.status !== 'offline') {
                        online++;
                    }
                }
                return online;
            }

            default:
                return guild.memberCount || 0;
        }
    }

    /**
     * Generates the target channel name from the format string and current count.
     */
    static formatChannelName(formatStr, count) {
        const countStr = Number(count).toLocaleString();
        if (!formatStr) return `count: ${countStr}`;
        return formatStr
            .replace(/{count}/gi, countStr)
            .replace(/{number}/gi, countStr)
            .replace(/{total}/gi, countStr)
            .trim();
    }

    /**
     * Updates all configured counters for a specific guild.
     */
    static async updateGuildCounters(guild, db) {
        if (!guild || !db) return;
        const botMember = guild.members?.me;
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return;
        }

        try {
            const counters = await db.getGuildCounters(guild.id);
            if (!counters || counters.length === 0) return;

            for (const c of counters) {
                const channel = guild.channels.cache.get(c.channel_id);
                if (!channel) {
                    // Channel was deleted in Discord; clean up database
                    await db.removeGuildCounter(c.channel_id).catch(() => {});
                    continue;
                }

                const currentCount = this.getCountForType(guild, c.counter_type);
                const targetName = this.formatChannelName(c.channel_name_format, currentCount);

                if (channel.name !== targetName) {
                    try {
                        await channel.setName(targetName, 'automated harm counter update');
                    } catch (err) {
                        // Ignore rate limits or permission errors gracefully
                        if (err.code !== 50035 && err.code !== 50013) {
                            console.warn(`[counter worker] failed to rename ${channel.id}:`, err.message);
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`[counter worker] error updating guild ${guild.id}:`, err.message);
        }
    }

    /**
     * Periodic sweep for all guilds.
     * Runs on a 10-minute cadence to respect Discord's 2-rename/10min rate limit.
     */
    static start(client) {
        if (!client) return null;

        const runSweep = async () => {
            if (!client.isReady() || !client.db) return;
            for (const guild of client.guilds.cache.values()) {
                await this.updateGuildCounters(guild, client.db);
            }
        };

        // Initial run 15s after startup
        setTimeout(runSweep, 15_000);

        // 10-minute interval
        const TEN_MINUTES = 10 * 60 * 1000;
        return setInterval(runSweep, TEN_MINUTES);
    }
}

module.exports = CounterWorker;
