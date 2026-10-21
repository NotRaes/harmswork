const {
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const VoiceMasterHelper = require('../../structures/utils/helpers/voicemasterhelper.js');
const {
    canModerate,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class VoiceMasterCommand {
    constructor() {
        this.name = 'voicemaster';
        this.aliases = ['vm', 'voice', 'vmmute', 'vmunmute', 'vmkick', 'vmmove', 'vmdeafen', 'vmundeafen'];
        this.description = 'dynamic join-to-create temporary voice channels and voice controls.';
        this.syntax = ',voicemaster <setup|reset|defaultname|mute|unmute|kick|move|deafen|undeafen> [arguments]';
        this.example = ',voicemaster setup';
        this.category = 'voicemaster';
        this.cooldown = 2;

        this.subcommands = [
            'voicemaster setup',
            'voicemaster reset',
            'voicemaster defaultname [name]',
            'voicemaster mute <@user> [reason]',
            'voicemaster unmute <@user> [reason]',
            'voicemaster kick <@user> [reason]',
            'voicemaster move <@user|all> <#channel>',
            'voicemaster deafen <@user> [reason]',
            'voicemaster undeafen <@user> [reason]'
        ];

        this.subcommandDetails = {
            setup: {
                description: 'create the join-to-create channel and control panel.',
                syntax: ',voicemaster setup',
                example: ',vm setup'
            },
            reset: {
                description: 'delete the setup and every active temporary channel.',
                syntax: ',voicemaster reset',
                example: ',vm reset'
            },
            defaultname: {
                description: 'set the naming template for new channels.',
                syntax: ',voicemaster defaultname [template]',
                example: ',vm defaultname {user} lounge'
            },
            mute: {
                description: 'server mute a member in voice.',
                syntax: ',voicemaster mute <@user> [reason]',
                example: ',vm mute @user mic spam'
            },
            unmute: {
                description: 'server unmute a member in voice.',
                syntax: ',voicemaster unmute <@user> [reason]',
                example: ',vm unmute @user'
            },
            kick: {
                description: 'disconnect a member from their voice channel.',
                syntax: ',voicemaster kick <@user> [reason]',
                example: ',vm kick @user afk'
            },
            move: {
                description: 'move a member or all members to another voice channel.',
                syntax: ',voicemaster move <@user|all> <#channel>',
                example: ',vm move @user #lounge'
            },
            deafen: {
                description: 'server deafen a member in voice.',
                syntax: ',voicemaster deafen <@user> [reason]',
                example: ',vm deafen @user'
            },
            undeafen: {
                description: 'server undeafen a member in voice.',
                syntax: ',voicemaster undeafen <@user> [reason]',
                example: ',vm undeafen @user'
            }
        };
    }

    async execute(message, args, commandName) {
        if (!message.guild) {
            return message.reply(build.warnBox('nothing found', 'voicemaster can only be used in servers.'));
        }

        const client = message.client;
        const db = client.db;
        if (!db) {
            return message.reply(build.denyBox('offline', 'database subsystem is currently offline.'));
        }

        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();
        let remainingArgs = args ? [...args] : [];

        // Support shorthand aliases like ,vmmute @user -> sub = mute
        if (['vmmute', 'vmunmute', 'vmkick', 'vmmove', 'vmdeafen', 'vmundeafen'].includes(invoked)) {
            sub = invoked.replace(/^vm/, '');
            remainingArgs = args ? [...args] : [];
        } else if (this.subcommandDetails[sub]) {
            remainingArgs.shift();
        }

        // If no subcommands or arguments specified, display interactive help menu
        if (!sub && (!args || args.length === 0)) {
            return await build.help(message, this);
        }

        const isOwner = config.owners?.includes(message.author.id);
        const hasModPerms = isOwner || message.member.permissions.has(PermissionFlagsBits.ManageGuild);

        // ──────────────────────── 1. SETUP ────────────────────────
        if (sub === 'setup') {
            if (!hasModPerms) {
                return message.reply(build.denyBox('permission denied', 'you need manage server permissions to run voicemaster setup.'));
            }

            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply(build.denyBox('missing permissions', 'harm requires `manage_channels` permission to create voicemaster channels.'));
            }

            const existingSetup = await db.getVoiceMasterSetup(message.guild.id);
            if (existingSetup) {
                const j2cExists = message.guild.channels.cache.has(existingSetup.vc_id);
                const icExists = message.guild.channels.cache.has(existingSetup.interface_channel_id);
                const counterExists = existingSetup.counter_channel_id && message.guild.channels.cache.has(existingSetup.counter_channel_id);
                if (j2cExists || icExists || counterExists) {
                    return message.reply(build.warnBox('check the usage', 'voicemaster is already set up here.\nrun `,voicemaster reset` first if you want to rebuild it.'));
                }
            }

            try {
                // A. Create VoiceMaster Category
                const category = await message.guild.channels.create({
                    name: 'voice',
                    type: ChannelType.GuildCategory
                });

                // B. 1. Create Interface Text Channel
                const textChannel = await message.guild.channels.create({
                    name: 'interface',
                    type: ChannelType.GuildText,
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            id: message.guild.roles.everyone.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [PermissionFlagsBits.SendMessages]
                        },
                        {
                            id: botMember.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.ManageMessages
                            ]
                        }
                    ]
                });

                // C. 2. Create Join to Create (j2c) Voice Channel
                const j2cChannel = await message.guild.channels.create({
                    name: 'j2c',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    userLimit: 0,
                    permissionOverwrites: [
                        {
                            id: message.guild.roles.everyone.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.Connect,
                                PermissionFlagsBits.Speak
                            ]
                        }
                    ]
                });

                // D. 3. Create Active VCs Counter Channel (Unjoinable)
                const counterChannel = await message.guild.channels.create({
                    name: 'active vcs: 0',
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    userLimit: 0,
                    permissionOverwrites: [
                        {
                            id: message.guild.roles.everyone.id,
                            allow: [PermissionFlagsBits.ViewChannel],
                            deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                        },
                        {
                            id: botMember.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.ManageChannels
                            ],
                            deny: [PermissionFlagsBits.Connect]
                        }
                    ]
                });

                // E. Post the Persistent Interface into voice-controls
                const payload = VoiceMasterHelper.buildInterfacePayload(message.guild);
                const interfaceMsg = await textChannel.send(payload.embedFallback);

                // F. Save Setup in Database
                await db.setVoiceMasterSetup(
                    message.guild.id,
                    j2cChannel.id,
                    category.id,
                    textChannel.id,
                    interfaceMsg.id,
                    null,
                    null,
                    counterChannel.id
                );
                if (db.setAddonState) {
                    await db.setAddonState(message.guild.id, 'voicemaster', true);
                }

                return message.reply(build.approvedBox(`join <#${j2cChannel.id}> to get your own channel. controls are in <#${textChannel.id}>.`));
            } catch (err) {
                console.error('[voicemaster setup error]:', err);
                return message.reply(build.denyBox('setup failed', `failed to create channels: ${err.message}`));
            }
        }

        // ──────────────────────── 2. RESET ────────────────────────
        if (sub === 'reset') {
            if (!hasModPerms) {
                return message.reply(build.denyBox('permission denied', 'you need manage server permissions to reset voicemaster.'));
            }

            const setup = await db.getVoiceMasterSetup(message.guild.id);
            const activeVCs = await db.getAllActiveVCs(message.guild.id);

            let removedCount = 0;

            // Delete active temporary channels
            for (const avc of activeVCs) {
                const ch = message.guild.channels.cache.get(avc.channel_id);
                if (ch) {
                    await ch.delete('voicemaster reset').catch(() => {});
                    removedCount++;
                }
            }

            // Delete setup channels
            if (setup) {
                if (setup.interface_channel_id) {
                    const ic = message.guild.channels.cache.get(setup.interface_channel_id);
                    if (ic) await ic.delete('voicemaster reset').catch(() => {});
                }
                if (setup.vc_id) {
                    const vc = message.guild.channels.cache.get(setup.vc_id);
                    if (vc) await vc.delete('voicemaster reset').catch(() => {});
                }
                if (setup.counter_channel_id) {
                    const cc = message.guild.channels.cache.get(setup.counter_channel_id);
                    if (cc) await cc.delete('voicemaster reset').catch(() => {});
                }
                if (setup.category_id) {
                    const cat = message.guild.channels.cache.get(setup.category_id);
                    if (cat) await cat.delete('voicemaster reset').catch(() => {});
                }
            }

            await db.resetVoiceMaster(message.guild.id);

            return message.reply(build.approvedBox(`voicemaster reset. ${removedCount} temporary channels removed.`));
        }

        // ──────────────────────── 3. DEFAULTNAME ────────────────────────
        if (sub === 'defaultname' || sub === 'name') {
            const template = remainingArgs.join(' ').trim();

            if (!template) {
                await db.removeVCDefaultName(message.guild.id, message.author.id);
                return message.reply(build.approvedBox('reset your channel name template back to default.'));
            }

            if (template.length > 50) {
                return message.reply(build.warnBox('invalid template', 'channel name template must be 50 characters or less.'));
            }

            await db.setVCDefaultName(message.guild.id, message.author.id, template);
            return message.reply(build.approvedBox(`set your voice channel template to **${template}**.\n-# variables: \`{user}\`, \`{username}\``));
        }

        // ──────────────────────── 4. MUTE ────────────────────────
        if (sub === 'mute') {
            if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need the mute members permission.')] });
            }
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.MuteMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need the mute members permission to execute this.')] });
            }
            if (!remainingArgs.length) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,vm mute <@user> [reason]`')] });
            }

            const resolved = await resolveUserOrMember(message, remainingArgs[0]);
            if (!resolved || !resolved.member) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = targetMember.user;
            const check = canModerate(message.member, targetMember, botMember);
            if (!check.can) return message.reply({ embeds: [build.deny(message.author, check.reason)] });

            if (!targetMember.voice.channel) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not in a voice channel.`)] });
            }
            if (targetMember.voice.serverMute) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already server muted.`)] });
            }

            const reason = remainingArgs.slice(1).join(' ').trim() || 'no reason provided';
            try {
                await targetMember.voice.setMute(true, `${message.author.tag} (${message.author.id}): ${reason}`);
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to voice mute member: ${err.message}`)] });
            }

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'vmute',
                    reason,
                    duration: 0
                });
            }

            await sendModResponse(message, { action: 'voice muted', target: targetUser, reason, caseId });
            await logToModLogs(message.guild, client, { action: 'vmute', target: targetUser, moderator: message.author, reason, caseId });
            return;
        }

        // ──────────────────────── 5. UNMUTE ────────────────────────
        if (sub === 'unmute') {
            if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need the mute members permission.')] });
            }
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.MuteMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need the mute members permission to execute this.')] });
            }
            if (!remainingArgs.length) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,vm unmute <@user> [reason]`')] });
            }

            const resolved = await resolveUserOrMember(message, remainingArgs[0]);
            if (!resolved || !resolved.member) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = targetMember.user;
            if (!targetMember.voice.channel) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not in a voice channel.`)] });
            }
            if (!targetMember.voice.serverMute) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not server muted.`)] });
            }

            const reason = remainingArgs.slice(1).join(' ').trim() || 'no reason provided';
            try {
                await targetMember.voice.setMute(false, `${message.author.tag} (${message.author.id}): ${reason}`);
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to voice unmute member: ${err.message}`)] });
            }

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'vunmute',
                    reason,
                    duration: 0
                });
            }

            await sendModResponse(message, { action: 'voice unmuted', target: targetUser, reason, caseId });
            await logToModLogs(message.guild, client, { action: 'vunmute', target: targetUser, moderator: message.author, reason, caseId });
            return;
        }

        // ──────────────────────── 6. KICK ────────────────────────
        if (sub === 'kick') {
            if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need the move members permission.')] });
            }
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need the move members permission to execute this.')] });
            }
            if (!remainingArgs.length) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,vm kick <@user> [reason]`')] });
            }

            const resolved = await resolveUserOrMember(message, remainingArgs[0]);
            if (!resolved || !resolved.member) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = targetMember.user;
            const check = canModerate(message.member, targetMember, botMember);
            if (!check.can) return message.reply({ embeds: [build.deny(message.author, check.reason)] });

            if (!targetMember.voice.channel) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not in a voice channel.`)] });
            }

            const reason = remainingArgs.slice(1).join(' ').trim() || 'no reason provided';
            try {
                await targetMember.voice.disconnect(`${message.author.tag} (${message.author.id}): ${reason}`);
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to disconnect member: ${err.message}`)] });
            }

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'vkick',
                    reason,
                    duration: 0
                });
            }

            await sendModResponse(message, { action: 'disconnected from voice', target: targetUser, reason, caseId });
            await logToModLogs(message.guild, client, { action: 'vkick', target: targetUser, moderator: message.author, reason, caseId });
            return;
        }

        // ──────────────────────── 7. MOVE ────────────────────────
        if (sub === 'move') {
            if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need the move members permission.')] });
            }
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need the move members permission to execute this.')] });
            }
            if (remainingArgs.length < 2) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,vm move <@user | all> <#channel>`')] });
            }

            const destArg = remainingArgs[1];
            const destChannelId = destArg.replace(/[<#>]/g, '').trim();
            const destChannel = message.guild.channels.cache.get(destChannelId) ||
                message.guild.channels.cache.find(c =>
                    (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) &&
                    c.name.toLowerCase() === destArg.toLowerCase()
                );

            if (!destChannel || (destChannel.type !== ChannelType.GuildVoice && destChannel.type !== ChannelType.GuildStageVoice)) {
                return message.reply({ embeds: [build.warn(message.author, 'please specify a valid destination voice channel.')] });
            }
            if (!destChannel.permissionsFor(botMember).has(PermissionFlagsBits.Connect)) {
                return message.reply({ embeds: [build.deny(message.author, `i cannot connect to <#${destChannel.id}>.`)] });
            }

            // Move all
            if (remainingArgs[0].toLowerCase() === 'all') {
                if (!message.member.voice.channel) {
                    return message.reply({ embeds: [build.warn(message.author, 'you must be in a voice channel to move all members.')] });
                }
                const sourceChannel = message.member.voice.channel;
                if (sourceChannel.id === destChannel.id) {
                    return message.reply({ embeds: [build.warn(message.author, 'the members are already in that channel.')] });
                }

                const membersToMove = sourceChannel.members.filter(m => m.id !== botMember.id);
                let movedCount = 0;
                for (const member of membersToMove.values()) {
                    try {
                        await member.voice.setChannel(destChannel.id, `${message.author.tag} (${message.author.id}): bulk move all`);
                        movedCount++;
                    } catch (_) {}
                }

                return message.reply({
                    embeds: [build.approved(message.author, `moved **${movedCount}** members from <#${sourceChannel.id}> to <#${destChannel.id}>.`)]
                });
            }

            // Single user move
            const resolved = await resolveUserOrMember(message, remainingArgs[0]);
            if (!resolved || !resolved.member) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = targetMember.user;
            const check = canModerate(message.member, targetMember, botMember);
            if (!check.can) return message.reply({ embeds: [build.deny(message.author, check.reason)] });

            if (!targetMember.voice.channel) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not in a voice channel.`)] });
            }
            if (targetMember.voice.channel.id === destChannel.id) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already in <#${destChannel.id}>.`)] });
            }

            try {
                await targetMember.voice.setChannel(destChannel.id, `${message.author.tag} (${message.author.id}): moved voice channel`);
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to move member: ${err.message}`)] });
            }

            await message.reply({
                embeds: [build.approved(message.author, `moved **${targetUser.tag || targetUser.username}** to <#${destChannel.id}>.`)]
            });

            await logToModLogs(message.guild, client, {
                action: 'vmove',
                target: targetUser,
                moderator: message.author,
                reason: `moved to #${destChannel.name}`,
                caseId: 0
            });
            return;
        }

        // ──────────────────────── 8. DEAFEN ────────────────────────
        if (sub === 'deafen') {
            if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need the deafen members permission.')] });
            }
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.DeafenMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need the deafen members permission to execute this.')] });
            }
            if (!remainingArgs.length) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,vm deafen <@user> [reason]`')] });
            }

            const resolved = await resolveUserOrMember(message, remainingArgs[0]);
            if (!resolved || !resolved.member) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = targetMember.user;
            const check = canModerate(message.member, targetMember, botMember);
            if (!check.can) return message.reply({ embeds: [build.deny(message.author, check.reason)] });

            if (!targetMember.voice.channel) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not in a voice channel.`)] });
            }
            if (targetMember.voice.serverDeaf) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already server deafened.`)] });
            }

            const reason = remainingArgs.slice(1).join(' ').trim() || 'no reason provided';
            try {
                await targetMember.voice.setDeaf(true, `${message.author.tag} (${message.author.id}): ${reason}`);
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to voice deafen member: ${err.message}`)] });
            }

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'vdeafen',
                    reason,
                    duration: 0
                });
            }

            await sendModResponse(message, { action: 'server deafened in voice', target: targetUser, reason, caseId });
            await logToModLogs(message.guild, client, { action: 'vdeafen', target: targetUser, moderator: message.author, reason, caseId });
            return;
        }

        // ──────────────────────── 9. UNDEAFEN ────────────────────────
        if (sub === 'undeafen') {
            if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need the deafen members permission.')] });
            }
            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.DeafenMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need the deafen members permission to execute this.')] });
            }
            if (!remainingArgs.length) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,vm undeafen <@user> [reason]`')] });
            }

            const resolved = await resolveUserOrMember(message, remainingArgs[0]);
            if (!resolved || !resolved.member) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = targetMember.user;
            if (!targetMember.voice.channel) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not in a voice channel.`)] });
            }
            if (!targetMember.voice.serverDeaf) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not server deafened.`)] });
            }

            const reason = remainingArgs.slice(1).join(' ').trim() || 'no reason provided';
            try {
                await targetMember.voice.setDeaf(false, `${message.author.tag} (${message.author.id}): ${reason}`);
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to voice undeafen member: ${err.message}`)] });
            }

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'vundeafen',
                    reason,
                    duration: 0
                });
            }

            await sendModResponse(message, { action: 'voice undeafened', target: targetUser, reason, caseId });
            await logToModLogs(message.guild, client, { action: 'vundeafen', target: targetUser, moderator: message.author, reason, caseId });
            return;
        }

        if (sub) {
            const valid = ['setup', 'reset', 'defaultname', 'mute', 'unmute', 'kick', 'move', 'deafen', 'undeafen'];
            let best = null;
            let bestDist = Infinity;
            for (const v of valid) {
                const a = sub, b = v;
                const matrix = [];
                for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                for (let i = 1; i <= b.length; i++) {
                    for (let j = 1; j <= a.length; j++) {
                        if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                        else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                    }
                }
                const d = matrix[b.length][a.length];
                if (d < bestDist) { bestDist = d; best = v; }
            }

            if (best && bestDist <= 3) {
                return message.reply({
                    embeds: [build.say(message.author, `did you mean \`,voicemaster ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,voicemaster <setup|reset|defaultname>\`\n-# type \`,voicemaster\` for the interactive help guide.`)]
            });
        }

        return await build.help(message, this);
    }
}

module.exports = VoiceMasterCommand;
