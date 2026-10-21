const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class JailCommand {
    constructor() {
        this.name = 'jail';
        this.aliases = ['j'];
        this.description = 'isolate a member to the jail channel and strip their roles.';
        this.syntax = ',jail <@user> [reason]';
        this.example = ',jail @user disruptive in chat';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.cooldown = 3;
        this.subcommands = ['jail <@user> [reason]'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
            !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need moderate members or manage roles permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,jail <@user> [reason]')] });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.member) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
        }

        const targetMember = resolved.member;
        const targetUser = targetMember.user;

        // Hierarchy check
        const check = canModerate(message.member, targetMember, botMember);
        if (!check.can) {
            return message.reply({ embeds: [build.deny(message.author, check.reason)] });
        }

        // Fetch jail config
        const jailConfig = await client.db?.getJailConfig(message.guild.id);
        const jailRoleId = jailConfig?.roleId;
        const jailRole = jailRoleId ? message.guild.roles.cache.get(jailRoleId) : message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');

        if (!jailRole) {
            return message.reply({
                embeds: [build.warn(message.author, 'jail system is not configured yet. please run `,setjail setup` first.')]
            });
        }

        // Check if already jailed
        const alreadyJailed = await client.db?.getJailedUser(message.guild.id, targetUser.id);
        if (alreadyJailed || targetMember.roles.cache.has(jailRole.id)) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already jailed.`)] });
        }

        const reason = args.slice(1).join(' ').trim() || 'no reason provided';

        // Collect member's removable roles (exclude @everyone and bot managed roles)
        const memberRoles = targetMember.roles.cache.filter(r =>
            r.id !== message.guild.roles.everyone.id &&
            !r.managed &&
            r.position < botMember.roles.highest.position
        );
        const savedRoleIds = memberRoles.map(r => r.id);

        // Strip roles & assign jail role
        try {
            if (savedRoleIds.length > 0) {
                await targetMember.roles.remove(savedRoleIds, `${message.author.tag} (${message.author.id}) [jailed]: stripping roles`);
            }
            await targetMember.roles.add(jailRole, `${message.author.tag} (${message.author.id}) [jailed]: isolated`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to isolate member: ${err.message}`)] });
        }

        // Save to Database
        if (client.db) {
            await client.db.saveJailedUser(message.guild.id, targetUser.id, savedRoleIds, reason, message.author.id);
        }

        // Create DB Case
        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetUser.id,
                userTag: targetUser.tag || targetUser.username,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'jail',
                reason,
                duration: 0
            });
        }

        // Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: 'jailed',
            reason,
            moderator: message.author,
            caseId
        });

        // Send Harm Response
        await sendModResponse(message, {
            action: 'jailed (roles stripped & quarantined)',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'jail',
            target: targetUser,
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = JailCommand;
