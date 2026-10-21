const config = require('../../../config.js');
const build = require('../builder.js');

class LevelingWorker {
    /**
     * Starts the passive voice XP tracking worker.
     * Sweeps every 60 seconds for active members in non-AFK voice channels.
     */
    static start(client) {
        if (!client) return null;

        const interval = setInterval(async () => {
            try {
                await LevelingWorker.sweepVoiceXp(client);
            } catch (err) {
                console.error('[levelingworker sweep]', err.message);
            }
        }, 60_000);

        if (interval.unref) interval.unref();
        return interval;
    }

    /**
     * Awards passive voice XP to active voice members across all guilds.
     */
    static async sweepVoiceXp(client) {
        if (!client?.isReady() || !client.db) return;

        for (const guild of client.guilds.cache.values()) {
            if (!guild.available) continue;

            try {
                const settings = await client.db.getLevelingSettings(guild.id);
                if (!settings || !settings.enabled) continue;

                const ignoredChannels = new Set(settings.ignored_channels || []);
                const ignoredRoles = new Set(settings.ignored_roles || []);
                const afkChannelId = guild.afkChannelId;

                // Group members by voice channel
                const channelsMap = new Map();
                for (const vs of guild.voiceStates.cache.values()) {
                    if (!vs.channelId || vs.member?.user?.bot) continue;
                    if (afkChannelId && vs.channelId === afkChannelId) continue;
                    if (ignoredChannels.has(vs.channelId)) continue;

                    // Exclude deafened users from gaining passive XP
                    if (vs.deaf || vs.selfDeaf) continue;

                    if (!channelsMap.has(vs.channelId)) {
                        channelsMap.set(vs.channelId, []);
                    }
                    channelsMap.get(vs.channelId).push(vs);
                }

                const multiplier = Math.max(0.1, settings.multiplier || 1.0);

                for (const [channelId, voiceStates] of channelsMap.entries()) {
                    // Prevent 24/7 solo idle farming: require at least 2 active members in the channel
                    if (voiceStates.length < 2) continue;

                    for (const vs of voiceStates) {
                        const member = vs.member;
                        if (!member || member.user.bot) continue;

                        // Check ignored roles
                        if (ignoredRoles.size > 0 && member.roles.cache.some(r => ignoredRoles.has(r.id))) {
                            continue;
                        }

                        // Award 10-20 base XP * multiplier for 60s of active voice
                        const baseXp = Math.floor(Math.random() * 11) + 10;
                        const xpToAdd = Math.round(baseXp * multiplier);

                        const result = await client.db.addVoiceXp(guild.id, member.id, xpToAdd, 60);

                        if (result.leveledUp) {
                            await LevelingWorker.handleLevelUp(guild, member, result.newLevel, settings, client);
                        }
                    }
                }
            } catch (_) {}
        }
    }

    /**
     * Handles role rewards assignment and level-up announcements.
     */
    static async handleLevelUp(guild, member, newLevel, settings, client, currentChannel = null) {
        if (!guild || !member || !newLevel) return;

        try {
            // 1. Role Rewards Handling
            const rewards = await client.db.getLevelRewards(guild.id);
            const botMember = guild.members.me;
            const canManageRoles = botMember?.permissions?.has('ManageRoles');

            const unlockedRoles = [];

            if (canManageRoles && rewards.length > 0) {
                const highestBotRolePos = botMember.roles.highest.position;

                if (settings.stack_roles === 1) {
                    // Stack roles: grant all rewards for levels <= newLevel
                    for (const reward of rewards) {
                        if (reward.level <= newLevel) {
                            const role = guild.roles.cache.get(reward.role_id);
                            if (role && role.position < highestBotRolePos && !member.roles.cache.has(role.id)) {
                                await member.roles.add(role.id, `harm leveling: reached level ${reward.level}`).catch(() => {});
                                if (reward.level === newLevel) unlockedRoles.push(role);
                            }
                        }
                    }
                } else {
                    // Non-stacking: grant only the highest reward and remove lower ones
                    const eligible = rewards.filter(r => r.level <= newLevel).sort((a, b) => b.level - a.level);
                    if (eligible.length > 0) {
                        const topReward = eligible[0];
                        const topRole = guild.roles.cache.get(topReward.role_id);

                        if (topRole && topRole.position < highestBotRolePos && !member.roles.cache.has(topRole.id)) {
                            await member.roles.add(topRole.id, `harm leveling: reached level ${topReward.level}`).catch(() => {});
                            unlockedRoles.push(topRole);
                        }

                        // Remove lower rewards
                        for (let i = 1; i < eligible.length; i++) {
                            const lowerRole = guild.roles.cache.get(eligible[i].role_id);
                            if (lowerRole && lowerRole.position < highestBotRolePos && member.roles.cache.has(lowerRole.id)) {
                                await member.roles.remove(lowerRole.id, 'harm leveling: replaced with higher level role').catch(() => {});
                            }
                        }
                    }
                }
            }

            // 2. Celebration Dispatch
            if (settings.channel_id === 'off') return;

            const starEmoji = config.emojis?.star || config.emojis?.badge || '<:star:1558818788483530863>';
            let msgText = `${starEmoji} <@${member.id}>**:** congratulations, you advanced to **level ${newLevel}**!`;
            if (unlockedRoles.length > 0) {
                const roleMentions = unlockedRoles.map(r => `<@&${r.id}>`).join(', ');
                msgText += ` · unlocked ${roleMentions}`;
            }

            if (settings.channel_id === 'dm') {
                await member.send({ embeds: [build.approved(member.user, msgText)] }).catch(() => {});
            } else if (settings.channel_id && settings.channel_id !== 'current') {
                const targetChannel = guild.channels.cache.get(settings.channel_id);
                if (targetChannel && targetChannel.isTextBased()) {
                    await targetChannel.send({ embeds: [build.approved(member.user, msgText)] }).catch(() => {});
                }
            } else if (currentChannel && currentChannel.isTextBased()) {
                await currentChannel.send({ embeds: [build.approved(member.user, msgText)] }).catch(() => {});
            }
        } catch (_) {}
    }
}

module.exports = LevelingWorker;
