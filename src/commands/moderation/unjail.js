const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class UnjailCommand {
    constructor() {
        this.name = 'unjail';
        this.aliases = ['uj'];
        this.description = 'release a member from jail and restore their original roles.';
        this.syntax = ',unjail <@user> [reason]';
        this.example = ',unjail @user quarantine concluded';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.cooldown = 3;
        this.noHelp = true;
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
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,unjail <@user> [reason]')] });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.member) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
        }

        const targetMember = resolved.member;
        const targetUser = targetMember.user;

        // Fetch jail config & record
        const jailConfig = await client.db?.getJailConfig(message.guild.id);
        const jailRoleId = jailConfig?.roleId;
        const jailRole = jailRoleId ? message.guild.roles.cache.get(jailRoleId) : message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');

        const jailedRecord = await client.db?.getJailedUser(message.guild.id, targetUser.id);
        const hasJailRole = jailRole && targetMember.roles.cache.has(jailRole.id);

        if (!jailedRecord && !hasJailRole) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not currently jailed.`)] });
        }

        const reason = args.slice(1).join(' ').trim() || 'quarantine served';

        // Remove jail role
        if (jailRole && targetMember.roles.cache.has(jailRole.id)) {
            await targetMember.roles.remove(jailRole, `${message.author.tag} (${message.author.id}) [unjail]: released`).catch(() => {});
        }

        // Restore saved roles
        const restoredRoles = [];
        if (jailedRecord && Array.isArray(jailedRecord.roles)) {
            for (const rId of jailedRecord.roles) {
                const role = message.guild.roles.cache.get(rId);
                if (role && role.position < botMember.roles.highest.position && !role.managed) {
                    restoredRoles.push(role.id);
                }
            }
            if (restoredRoles.length > 0) {
                await targetMember.roles.add(restoredRoles, `${message.author.tag} (${message.author.id}) [unjail]: restoring roles`).catch(() => {});
            }
        }

        // Remove from DB
        if (client.db) {
            await client.db.removeJailedUser(message.guild.id, targetUser.id);
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
                action: 'unjail',
                reason,
                duration: 0
            });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: `unjailed (restored ${restoredRoles.length} roles)`,
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'unjail',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (${restoredRoles.length} roles restored)`,
            caseId
        });
    }
}

module.exports = UnjailCommand;
