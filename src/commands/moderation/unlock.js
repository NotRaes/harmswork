const {
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const { logToModLogs, resolveUserOrMember } = require('../../structures/utils/helpers/modhelper.js');

class UnlockCommand {
    constructor() {
        this.name = 'unlock';
        this.aliases = ['ul'];
        this.description = 'unlock a channel, lift server lockdown, or release speech locks on members.';
        this.syntax = ',unlock [#channel] [reason] or ,unlock <all|uwu|mock|nerd|clown|reset> [@user]';
        this.example = ',unlock #general raid over\n,unlock all raid over\n,unlock uwu @user\n,unlock reset @user';
        this.category = 'moderation';
        this.cooldown = 2;
        this.subcommands = [
            'unlock [#channel] [reason]',
            'unlock all [reason]',
            'unlock uwu <@user>',
            'unlock mock <@user>',
            'unlock nerd <@user>',
            'unlock clown <@user>',
            'unlock reset <@user>'
        ];
        this.subcommandDetails = {
            channel: {
                description: 'unlock a specific channel for @everyone.',
                syntax: ',unlock [#channel] [reason]',
                example: ',unlock #general raid over'
            },
            all: {
                description: 'lift server-wide lockdown and unlock all public text channels.',
                syntax: ',unlock all [reason] or ,unlock down [reason]',
                example: ',unlock all incident resolved'
            },
            uwu: {
                description: 'release a member from anime uwu speech lock.',
                syntax: ',unlock uwu <@user>',
                example: ',unlock uwu @user'
            },
            mock: {
                description: 'release a member from sarcastic mocking speech lock.',
                syntax: ',unlock mock <@user>',
                example: ',unlock mock @user'
            },
            nerd: {
                description: 'release a member from pedantic nerd dialect lock.',
                syntax: ',unlock nerd <@user>',
                example: ',unlock nerd @user'
            },
            clown: {
                description: 'release a member from clown honks speech lock.',
                syntax: ',unlock clown <@user>',
                example: ',unlock clown @user'
            },
            reset: {
                description: 'lift all active speech locks from a member.',
                syntax: ',unlock reset <@user> or ,unlock <@user>',
                example: ',unlock reset @user'
            }
        };
    }

    async execute(client, message, args) {
        const sub = (args[0] || '').toLowerCase();

        // ──────────────────────── 1. SERVER-WIDE UNLOCKDOWN ────────────────────────
        if (sub === 'all' || sub === 'server' || sub === 'down' || sub === 'lockdown') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
                !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need manage server or manage channels permission.')] });
            }

            const botMember = message.guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return message.reply({ embeds: [build.deny(message.author, 'i need manage channels permission to execute this.')] });
            }

            const reason = args.slice(1).join(' ').trim() || 'server lockdown lifted';
            const everyoneRole = message.guild.roles.everyone;

            const textChannels = message.guild.channels.cache.filter(c =>
                c.type === ChannelType.GuildText &&
                c.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)
            );

            if (!textChannels.size) {
                return message.reply({ embeds: [build.warn(message.author, 'no manageable text channels found in this server.')] });
            }

            let unlockedCount = 0;
            const unlockPromises = textChannels.map(async ch => {
                const current = ch.permissionOverwrites.cache.get(everyoneRole.id);
                if (current && current.deny.has(PermissionFlagsBits.SendMessages)) {
                    try {
                        await ch.permissionOverwrites.edit(everyoneRole, {
                            SendMessages: null
                        }, {
                            reason: `${message.author.tag} (${message.author.id}) [server lockdown lifted]: ${reason}`
                        });
                        unlockedCount++;
                    } catch (_) {}
                }
            });

            await Promise.all(unlockPromises);

            let caseId = 0;
            if (client.db) {
                caseId = await client.db.createModCase({
                    guildId: message.guild.id,
                    userId: message.guild.id,
                    userTag: message.guild.name,
                    moderatorId: message.author.id,
                    moderatorTag: message.author.tag || message.author.username,
                    action: 'unlockdown',
                    reason: `${reason} (${unlockedCount} channels unlocked)`,
                    duration: 0
                });
            }

            await message.reply({
                embeds: [build.approved(message.author, `unlocked **${unlockedCount}** text channel${unlockedCount === 1 ? '' : 's'} for **@everyone** · \`${reason}\``)]
            });

            await logToModLogs(message.guild, client, {
                action: 'unlockdown',
                target: { id: message.guild.id, tag: message.guild.name },
                moderator: message.author,
                reason: `${reason} (${unlockedCount} channels)`,
                caseId
            });

            return;
        }

        // ──────────────────────── 2. SPECIFIC SPEECH LOCK REMOVAL ────────────────────────
        const SPEECH_TYPES = {
            uwu: { type: 'uwu', label: 'uwu lock' },
            weeb: { type: 'uwu', label: 'uwu lock' },
            mock: { type: 'mock', label: 'mock lock' },
            sponge: { type: 'mock', label: 'mock lock' },
            nerd: { type: 'nerd', label: 'nerd lock' },
            erm: { type: 'nerd', label: 'nerd lock' },
            clown: { type: 'clown', label: 'clown lock' },
            honk: { type: 'clown', label: 'clown lock' },
            circus: { type: 'clown', label: 'clown lock' }
        };

        if (SPEECH_TYPES[sub]) {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need moderate members permission.')] });
            }

            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: ,unlock ${sub} <@user>`)] });
            }

            const resolved = await resolveUserOrMember(message, args[1]);
            if (!resolved || !resolved.user) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
            }

            const targetUser = resolved.user;
            const cfg = SPEECH_TYPES[sub];

            let isLocked = false;
            if (cfg.type === 'uwu') isLocked = await client.db?.isUwuLocked(message.guild.id, targetUser.id);
            else if (cfg.type === 'mock') isLocked = await client.db?.isMockLocked(message.guild.id, targetUser.id);
            else if (cfg.type === 'nerd') isLocked = await client.db?.isNerdLocked(message.guild.id, targetUser.id);
            else if (cfg.type === 'clown') isLocked = await client.db?.isClownLocked(message.guild.id, targetUser.id);

            if (!isLocked) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not currently ${cfg.label}ed.`)] });
            }

            if (cfg.type === 'uwu') await client.db?.removeUwuLock(message.guild.id, targetUser.id);
            else if (cfg.type === 'mock') await client.db?.removeMockLock(message.guild.id, targetUser.id);
            else if (cfg.type === 'nerd') await client.db?.removeNerdLock(message.guild.id, targetUser.id);
            else if (cfg.type === 'clown') await client.db?.removeClownLock(message.guild.id, targetUser.id);

            await logToModLogs(message.guild, client, {
                action: `un${cfg.type}lock`,
                target: targetUser,
                moderator: message.author,
                reason: `released from ${cfg.label}`
            });

            return message.reply({
                embeds: [build.approved(message.author, `released **${targetUser.tag || targetUser.username}** from ${cfg.label}.`)]
            });
        }

        // ──────────────────────── 3. RESET ALL SPEECH LOCKS ────────────────────────
        if (sub === 'reset' || sub === 'lift' || sub === 'clear' || sub === 'remove') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return message.reply({ embeds: [build.deny(message.author, 'you need moderate members permission.')] });
            }

            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,unlock reset <@user>')] });
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

            await logToModLogs(message.guild, client, {
                action: 'unlock speech',
                target: targetUser,
                moderator: message.author,
                reason: 'lifted all speech locks'
            });

            return message.reply({
                embeds: [build.approved(message.author, `lifted all speech locks from **${targetUser.tag || targetUser.username}**.`)]
            });
        }

        // ──────────────────────── 4. DIRECT USER SPEECH UNLOCK (,unlock @user) ────────────────────────
        if (args[0] && !message.mentions.channels.first() && !args[0].startsWith('<#')) {
            const resolved = await resolveUserOrMember(message, args[0]);
            if (resolved && resolved.user) {
                if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                    return message.reply({ embeds: [build.deny(message.author, 'you need moderate members permission.')] });
                }

                const targetUser = resolved.user;
                const removed = await client.db?.removeAllSpeechLocks(message.guild.id, targetUser.id);
                if (!removed) {
                    return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** does not have any active speech locks.`)] });
                }

                await logToModLogs(message.guild, client, {
                    action: 'unlock speech',
                    target: targetUser,
                    moderator: message.author,
                    reason: 'lifted all speech locks'
                });

                return message.reply({
                    embeds: [build.approved(message.author, `lifted all speech locks from **${targetUser.tag || targetUser.username}**.`)]
                });
            }
        }

        // ──────────────────────── 5. SINGLE CHANNEL UNLOCK (DEFAULT) ────────────────────────
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

        if (!currentOverwrite || !currentOverwrite.deny.has(PermissionFlagsBits.SendMessages)) {
            return message.reply({ embeds: [build.warn(message.author, `<#${targetChannel.id}> is not currently locked.`)] });
        }

        try {
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: null
            }, {
                reason: `${message.author.tag} (${message.author.id}): ${reason}`
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to unlock channel: ${err.message}`)] });
        }

        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetChannel.id,
                userTag: `#${targetChannel.name}`,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'unlock',
                reason,
                duration: 0
            });
        }

        await message.reply({
            embeds: [build.approved(message.author, `unlocked <#${targetChannel.id}> for **@everyone** · \`${reason}\``)]
        });

        await logToModLogs(message.guild, client, {
            action: 'unlock',
            target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = UnlockCommand;
