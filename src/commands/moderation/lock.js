const {
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class LockCommand {
    constructor() {
        this.name = 'lock';
        this.aliases = ['l'];
        this.description = 'lock a channel, lockdown the server, or enforce speech locks on members.';
        this.syntax = ',lock [#channel] [reason] or ,lock <all|uwu|mock|nerd|clown|reset|list> [@user]';
        this.example = ',lock #general raid protection\n,lock all server raid\n,lock uwu @user\n,lock reset @user';
        this.category = 'moderation';
        this.cooldown = 2;
        this.subcommands = [
            'lock [#channel] [reason]',
            'lock all [reason]',
            'lock uwu <@user>',
            'lock mock <@user>',
            'lock nerd <@user>',
            'lock clown <@user>',
            'lock reset <@user>',
            'lock list'
        ];
        this.subcommandDetails = {
            channel: {
                description: 'lock a specific channel to prevent @everyone from sending messages.',
                syntax: ',lock [#channel] [reason]',
                example: ',lock #general raid protection'
            },
            all: {
                description: 'emergency lock all public text channels in the server.',
                syntax: ',lock all [reason] or ,lock down [reason]',
                example: ',lock all server under raid attack'
            },
            uwu: {
                description: 'force a member to speak exclusively in anime uwu speech.',
                syntax: ',lock uwu <@user>',
                example: ',lock uwu @user'
            },
            mock: {
                description: 'force a member to speak in alternating sarcastic mocking case.',
                syntax: ',lock mock <@user>',
                example: ',lock mock @user'
            },
            nerd: {
                description: 'force a member to speak in pedantic nerd dialect with citations.',
                syntax: ',lock nerd <@user>',
                example: ',lock nerd @user'
            },
            clown: {
                description: 'force a member to speak with clown honks and circus sounds.',
                syntax: ',lock clown <@user>',
                example: ',lock clown @user'
            },
            reset: {
                description: 'lift all active speech locks from a member.',
                syntax: ',lock reset <@user> or ,lock lift <@user>',
                example: ',lock reset @user'
            },
            list: {
                description: 'view all members currently under speech locks in this server.',
                syntax: ',lock list',
                example: ',lock list'
            }
        };
    }

    async execute(client, message, args) {
        const sub = (args[0] || '').toLowerCase();

        // ──────────────────────── 1. LIST SPEECH LOCKS ────────────────────────
        if (sub === 'list' || sub === 'show' || sub === 'users') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
                !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need moderate members or manage channels permission.')] });
            }

            const locks = await client.db?.getSpeechLocks(message.guild.id) || [];
            if (locks.length === 0) {
                return message.reply({
                    embeds: [build.warn(message.author, 'no members are currently speech locked in this server.')]
                });
            }

            const lines = locks.map((l, idx) => {
                const relTime = `<t:${Math.floor(l.timestamp / 1000)}:R>`;
                return `\`${idx + 1}.\` <@${l.user_id}> ─ **${l.type}lock** (by <@${l.locked_by}> ${relTime})`;
            });

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### active speech locks\n` +
                    `-# ${locks.length} active lock(s) in this server\n\n` +
                    lines.join('\n') +
                    `\n\n-# use \`,lock reset <@user>\` to release a member.`
                );

            return message.reply({ embeds: [embed] });
        }

        // ──────────────────────── 2. RESET SPEECH LOCKS ────────────────────────
        if (sub === 'reset' || sub === 'lift' || sub === 'clear' || sub === 'remove') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need moderate members permission.')] });
            }

            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,lock reset <@user>')] });
            }

            const resolved = await resolveUserOrMember(message, args[1]);
            if (!resolved || !resolved.user) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
            }

            const targetUser = resolved.user;
            const removed = await client.db?.removeAllSpeechLocks(message.guild.id, targetUser.id);
            if (!removed) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** does not have any active speech locks.`)] });
            }

            return message.reply({
                embeds: [build.approved(message.author, `lifted all speech locks from **${targetUser.tag || targetUser.username}**.`)]
            });
        }

        // ──────────────────────── 3. SPEECH LOCK ENFORCEMENT ────────────────────────
        const SPEECH_TYPES = {
            uwu: { type: 'uwu', label: 'anime uwu speech', action: 'uwulock' },
            weeb: { type: 'uwu', label: 'anime uwu speech', action: 'uwulock' },
            mock: { type: 'mock', label: 'sarcastic mocking case', action: 'mocklock' },
            sponge: { type: 'mock', label: 'sarcastic mocking case', action: 'mocklock' },
            nerd: { type: 'nerd', label: 'pedantic nerd dialect', action: 'nerdlock' },
            erm: { type: 'nerd', label: 'pedantic nerd dialect', action: 'nerdlock' },
            clown: { type: 'clown', label: 'clown honks and circus sounds', action: 'clownlock' },
            honk: { type: 'clown', label: 'clown honks and circus sounds', action: 'clownlock' },
            circus: { type: 'clown', label: 'clown honks and circus sounds', action: 'clownlock' }
        };

        if (SPEECH_TYPES[sub]) {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need moderate members permission.')] });
            }

            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need manage messages permission to enforce speech locks.')] });
            }

            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: ,lock ${sub} <@user>`)] });
            }

            // Check if lift subcommand: ,lock uwu lift @user
            if (args[1].toLowerCase() === 'lift' || args[1].toLowerCase() === 'remove') {
                if (!args[2]) {
                    return message.reply({ embeds: [build.warn(message.author, `syntax: ,lock ${sub} lift <@user>`)] });
                }
                const resolved = await resolveUserOrMember(message, args[2]);
                if (!resolved || !resolved.user) {
                    return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
                }
                const cfg = SPEECH_TYPES[sub];
                if (cfg.type === 'uwu') await client.db?.removeUwuLock(message.guild.id, resolved.user.id);
                else if (cfg.type === 'mock') await client.db?.removeMockLock(message.guild.id, resolved.user.id);
                else if (cfg.type === 'nerd') await client.db?.removeNerdLock(message.guild.id, resolved.user.id);
                else if (cfg.type === 'clown') await client.db?.removeClownLock(message.guild.id, resolved.user.id);

                return message.reply({
                    embeds: [build.approved(message.author, `released **${resolved.user.tag || resolved.user.username}** from ${cfg.type} lock.`)]
                });
            }

            const resolved = await resolveUserOrMember(message, args[1]);
            if (!resolved || !resolved.user) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
            }

            const targetMember = resolved.member;
            const targetUser = resolved.user;

            if (targetMember) {
                const check = canModerate(message.member, targetMember, botMember);
                if (!check.can) {
                    return message.reply({ embeds: [build.deny(message.author, check.reason)] });
                }
            }

            const cfg = SPEECH_TYPES[sub];
            let alreadyLocked = false;
            if (cfg.type === 'uwu') alreadyLocked = await client.db?.isUwuLocked(message.guild.id, targetUser.id);
            else if (cfg.type === 'mock') alreadyLocked = await client.db?.isMockLocked(message.guild.id, targetUser.id);
            else if (cfg.type === 'nerd') alreadyLocked = await client.db?.isNerdLocked(message.guild.id, targetUser.id);
            else if (cfg.type === 'clown') alreadyLocked = await client.db?.isClownLocked(message.guild.id, targetUser.id);

            if (alreadyLocked) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already locked in ${cfg.type} mode.`)] });
            }

            // Remove any other active speech locks first
            await client.db?.removeAllSpeechLocks(message.guild.id, targetUser.id);

            // Set specific lock
            if (cfg.type === 'uwu') await client.db?.setUwuLock(message.guild.id, targetUser.id, message.author.id);
            else if (cfg.type === 'mock') await client.db?.setMockLock(message.guild.id, targetUser.id, message.author.id);
            else if (cfg.type === 'nerd') await client.db?.setNerdLock(message.guild.id, targetUser.id, message.author.id);
            else if (cfg.type === 'clown') await client.db?.setClownLock(message.guild.id, targetUser.id, message.author.id);

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: cfg.action,
                    reason: `locked in ${cfg.label}`,
                    duration: 0
                });
            }

            await sendInfractionDM(targetUser, message.guild, {
                action: `${cfg.type}locked`,
                reason: `forced to speak in ${cfg.label}`,
                moderator: message.author,
                caseId
            });

            await sendModResponse(message, {
                action: `${cfg.type}locked (messages will be converted to ${cfg.label})`,
                target: targetUser,
                reason: `forced ${cfg.type} speech`,
                caseId
            });

            await logToModLogs(message.guild, client, {
                action: cfg.action,
                target: targetUser,
                moderator: message.author,
                reason: `forced ${cfg.label}`,
                caseId
            });

            return;
        }

        // ──────────────────────── 4. SERVER LOCKDOWN (ALL CHANNELS) ────────────────────────
        if (sub === 'all' || sub === 'server' || sub === 'down' || sub === 'lockdown') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
                !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need manage server or manage channels permission.')] });
            }

            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need manage channels permission to execute server lockdown.')] });
            }

            const reason = args.slice(1).join(' ').trim() || 'server emergency lockdown';
            const everyoneRole = message.guild.roles.everyone;

            const textChannels = message.guild.channels.cache.filter(c =>
                c.type === ChannelType.GuildText &&
                c.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)
            );

            if (!textChannels.size) {
                return message.reply({ embeds: [build.warn(message.author, 'no manageable text channels found in this server.')] });
            }

            let lockedCount = 0;
            const lockPromises = textChannels.map(async ch => {
                const current = ch.permissionOverwrites.cache.get(everyoneRole.id);
                if (!current || !current.deny.has(PermissionFlagsBits.SendMessages)) {
                    try {
                        await ch.permissionOverwrites.edit(everyoneRole, {
                            SendMessages: false
                        }, {
                            reason: `${message.author.tag} (${message.author.id}) [server lockdown]: ${reason}`
                        });
                        lockedCount++;
                    } catch (_) {}
                }
            });

            await Promise.all(lockPromises);

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: message.guild.id,
                    userTag: message.guild.name,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'lockdown',
                    reason,
                    duration: 0
                });
            }

            await message.reply({
                embeds: [build.approved(message.author, `locked down **${lockedCount}** channels for **@everyone** · \`${reason}\``)]
            });

            await logToModLogs(message.guild, client, {
                action: 'lockdown',
                target: { id: message.guild.id, tag: message.guild.name },
                moderator: message.author,
                reason: `${reason} (${lockedCount} channels locked)`,
                caseId
            });

            return;
        }

        // ──────────────────────── 5. SINGLE CHANNEL LOCK (DEFAULT) ────────────────────────
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need manage channels permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage channels permission to execute this.')] });
        }

        let targetChannel = message.mentions.channels.first();
        let reasonArgs = args;

        if (targetChannel) {
            reasonArgs = args.filter(a => !a.startsWith('<#'));
        } else {
            targetChannel = message.channel;
        }

        const reason = reasonArgs.join(' ').trim() || 'no reason provided';

        if (!targetChannel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, `i cannot manage permissions in <#${targetChannel.id}>.`)] });
        }

        const everyoneRole = message.guild.roles.everyone;
        const currentOverwrite = targetChannel.permissionOverwrites.cache.get(everyoneRole.id);

        if (currentOverwrite && currentOverwrite.deny.has(PermissionFlagsBits.SendMessages)) {
            return message.reply({ embeds: [build.warn(message.author, `<#${targetChannel.id}> is already locked.`)] });
        }

        try {
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false
            }, {
                reason: `${message.author.tag} (${message.author.id}): ${reason}`
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to lock channel: ${err.message}`)] });
        }

        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetChannel.id,
                userTag: `#${targetChannel.name}`,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'lock',
                reason,
                duration: 0
            });
        }

        await message.reply({
            embeds: [build.approved(message.author, `locked <#${targetChannel.id}> for **@everyone** · \`${reason}\``)]
        });

        await logToModLogs(message.guild, client, {
            action: 'lock',
            target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = LockCommand;
