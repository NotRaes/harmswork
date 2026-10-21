const EmbedParser = require('../structures/utils/helpers/embedparser.js');

class GuildMemberAddEvent {
    constructor(client) {
        this.name = 'guildMemberAdd';
        this.once = false;
        this.client = client;
    }

    async execute(member) {
        if (!member || !member.guild) return;
        const guild = member.guild;
        const db = this.client.db;
        const isBot = Boolean(member.user?.bot);

        // 0. Hardban enforcement
        if (db) {
            try {
                const isHardbanned = await db.isHardbanned(guild.id, member.id);
                if (isHardbanned && guild.members?.me?.permissions?.has('BanMembers')) {
                    await guild.bans.create(member.id, { reason: 'harm hardban: unauthorized rejoin prevented' }).catch(() => {});
                    return;
                }
            } catch (_) {}
        }

        // 0.1 Persistent Active Mute / Timeout
        if (db) {
            try {
                const activeMute = await db.getActiveMute(guild.id, member.id);
                if (activeMute && activeMute.expires_at > Date.now()) {
                    const remainingMs = activeMute.expires_at - Date.now();
                    if (remainingMs > 5000 && guild.members?.me?.permissions?.has('ModerateMembers')) {
                        await member.timeout(remainingMs, 'harm persistent timeout enforcement').catch(() => {});
                    }
                    const muteRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
                    if (muteRole && guild.members?.me?.permissions?.has('ManageRoles') && muteRole.position < guild.members.me.roles.highest.position) {
                        await member.roles.add(muteRole, 'harm persistent mute role').catch(() => {});
                    }
                } else if (activeMute) {
                    await db.removeActiveMute(guild.id, member.id).catch(() => {});
                }
            } catch (_) {}
        }

        // 0.2 Jail persistence
        if (db) {
            try {
                const jailed = await db.getJailedUser(guild.id, member.id);
                if (jailed && guild.members?.me?.permissions?.has('ManageRoles')) {
                    const jailConfig = await db.getJailConfig(guild.id);
                    const jailRole = jailConfig?.roleId
                        ? guild.roles.cache.get(jailConfig.roleId)
                        : guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
                    if (jailRole && jailRole.position < guild.members.me.roles.highest.position) {
                        await member.roles.set([jailRole.id], 'harm jail persistence').catch(() => {});
                    }
                }
            } catch (_) {}
        }

        // 0.3 Blind persistence (no channels appear for target)
        if (db) {
            try {
                const blinded = await db.getBlindedUser(guild.id, member.id);
                if (blinded && guild.members?.me?.permissions?.has('ManageRoles')) {
                    const blindRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'blinded');
                    if (blindRole && blindRole.position < guild.members.me.roles.highest.position) {
                        await member.roles.set([blindRole.id], 'harm blind persistence').catch(() => {});
                    }
                }
            } catch (_) {}
        }

        // 0.4 Forcenick persistence
        if (db) {
            try {
                const fn = await db.getForcenick(guild.id, member.id);
                if (fn?.nickname && guild.members?.me?.permissions?.has('ManageNicknames') && member.manageable) {
                    await member.setNickname(fn.nickname, 'harm forcenick persistence').catch(() => {});
                }
            } catch (_) {}
        }

        // 1. Autorole assignment
        if (db) {
            try {
                const autoroles = db.getAutoroles(guild.id);
                if (autoroles && autoroles.length > 0 && guild.members?.me?.permissions?.has('ManageRoles')) {
                    const botHighest = guild.members.me.roles.highest.position;
                    const rolesToAdd = autoroles
                        .filter(ar => {
                            if (ar.targetType === 'all') return true;
                            if (ar.targetType === 'bots') return isBot;
                            return !isBot;
                        })
                        .map(ar => ar.roleId)
                        .filter(rId => {
                            const r = guild.roles.cache.get(rId);
                            return r && r.position < botHighest && !r.managed;
                        });

                    if (rolesToAdd.length > 0) {
                        await member.roles.add(rolesToAdd, 'harm autorole').catch(() => {});
                    }
                }
            } catch (_) {}
        }

        if (isBot) return;

        if (db) {
            await db.recordGuildMovement(guild.id, 'join').catch(() => {});
        }

        if (!guild.members?.me?.permissions?.has('ManageGuild')) return;

        try {
            const currentInvites = await guild.invites.fetch().catch(() => null);
            if (!currentInvites) return;

            const cached = this.client.invites?.get(guild.id) || new Map();
            let usedInvite = null;
            let inviter = null;

            for (const [code, inv] of currentInvites) {
                const prev = cached.get(code) || 0;
                if (inv.uses > prev) {
                    usedInvite = inv;
                    inviter = inv.inviter;
                    break;
                }
            }

            const updatedMap = new Map();
            for (const [code, inv] of currentInvites) {
                updatedMap.set(code, inv.uses || 0);
            }
            if (!this.client.invites) this.client.invites = new Map();
            this.client.invites.set(guild.id, updatedMap);

            if (inviter && inviter.id !== member.id && db) {
                const isFake = (Date.now() - member.user.createdTimestamp) < (24 * 60 * 60 * 1000);
                await db.recordInviteJoin(guild.id, member.id, inviter.id, usedInvite?.code, isFake);
            }
        } catch (_) {}

        // 2. On-Join Pings Dispatch
        const pingedChannels = [];
        if (db && !isBot) {
            try {
                const pings = db.getOnjoinPings(guild.id);
                if (Array.isArray(pings) && pings.length > 0) {
                    const pingSettings = db.getOnjoinPingSettings(guild.id);
                    const channelText = pingSettings.channel_text || `<@${member.id}>`;
                    const me = guild.members?.me || await guild.members.fetchMe().catch(() => null);

                    for (const { channel_id, delete_after } of pings) {
                        const targetCh = guild.channels.cache.get(channel_id);
                        if (!targetCh || !targetCh.isTextBased()) continue;
                        if (!targetCh.permissionsFor(me)?.has(['ViewChannel', 'SendMessages'])) continue;

                        pingedChannels.push(targetCh);

                        const formattedPing = channelText.replace(/\{user\}/gi, `<@${member.id}>`);
                        targetCh.send(formattedPing).then(async sentMsg => {
                            if (delete_after !== null && delete_after !== undefined) {
                                if (delete_after === 0) {
                                    await sentMsg.delete().catch(() => {});
                                } else {
                                    setTimeout(() => {
                                        sentMsg.delete().catch(() => {});
                                    }, delete_after * 1000);
                                }
                            }
                        }).catch(() => {});
                    }

                    // Dispatch AutoPing Notification DM to the new member (Harm Style)
                    if (pingSettings.dm_enabled !== false && pingedChannels.length > 0) {
                        const channelListStr = pingedChannels
                            .map(c => `-# • <#${c.id}> (\`#${c.name}\`)`)
                            .join('\n');

                        if (pingSettings.dm_message) {
                            const customPayload = await EmbedParser.parse(
                                pingSettings.dm_message,
                                { member, guild, inviter, channels: channelListStr },
                                db,
                                guild.id
                            );
                            if (customPayload && (customPayload.content || customPayload.embeds?.length > 0)) {
                                await member.send(customPayload).catch(() => {});
                            }
                        } else {
                            const cardPayload = EmbedParser.buildHarmStyleWelcomeDM({
                                guild,
                                user: member.user,
                                channels: channelListStr
                            });
                            try {
                                await member.send(cardPayload.componentsV2);
                            } catch (_) {
                                await member.send(cardPayload.embedFallback).catch(() => {});
                            }
                        }
                    }
                }
            } catch (_) {}
        }

        // 3. On-Join Direct Message Dispatch (Supports JSON, {embed:name}, tags, text)
        if (db && !isBot) {
            try {
                const dmConfig = db.getOnjoinDM(guild.id);
                if (dmConfig && dmConfig.enabled && dmConfig.message) {
                    const payload = await EmbedParser.parse(
                        dmConfig.message,
                        { member, guild, inviter },
                        db,
                        guild.id
                    );
                    if (payload && (payload.content || payload.embeds?.length > 0)) {
                        await member.send(payload).catch(() => {});
                    }
                }
            } catch (_) {}
        }

        // 4. On-Join Channel Welcome Message Dispatch
        if (db && !isBot) {
            try {
                const welcomeConfig = db.getOnjoinWelcome(guild.id);
                if (welcomeConfig && welcomeConfig.enabled && welcomeConfig.channel_id) {
                    const welcomeCh = guild.channels.cache.get(welcomeConfig.channel_id);
                    if (welcomeCh && welcomeCh.isTextBased() && welcomeCh.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages'])) {
                        let payload;
                        if (welcomeConfig.message) {
                            payload = await EmbedParser.parse(
                                welcomeConfig.message,
                                { member, guild, inviter },
                                db,
                                guild.id
                            );
                        } else {
                            const embed = new EmbedBuilder()
                                .setColor(config.colors.c || '#0A0A0C')
                                .setDescription(
                                    `### welcome <@${member.id}>\n` +
                                    `-# thanks for joining **${guild.name}**! we are now at \`${guild.memberCount}\` members.`
                                );
                            payload = { embeds: [embed] };
                        }
                        if (payload && (payload.content || payload.embeds?.length > 0)) {
                            const sent = await welcomeCh.send(payload).catch(() => null);
                            if (sent && welcomeConfig.autodelete > 0) {
                                setTimeout(() => sent.delete().catch(() => {}), welcomeConfig.autodelete * 1000);
                            }
                        }
                    }
                }
            } catch (_) {}
        }
    }
}

module.exports = GuildMemberAddEvent;
