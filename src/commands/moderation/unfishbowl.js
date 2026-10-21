const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class UnfishbowlCommand {
    constructor() {
        this.name = 'unfishbowl';
        this.aliases = ['uncage', 'unfb'];
        this.description = 'release a member from the public fishbowl and restore their original roles.';
        this.syntax = ',unfishbowl <@user> [reason]';
        this.example = ',unfishbowl @user exhibition ended';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.cooldown = 3;
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
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,unfishbowl <@user> [reason]')] });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.member) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
        }

        const targetMember = resolved.member;
        const targetUser = targetMember.user;

        const cageConfig = await client.db?.getCageConfig(message.guild.id);
        const cageRoleId = cageConfig?.roleId;
        const cageRole = cageRoleId
            ? message.guild.roles.cache.get(cageRoleId)
            : message.guild.roles.cache.find(r => r.name.toLowerCase() === 'fishbowled' || r.name.toLowerCase() === 'caged');

        const cagedRecord = await client.db?.getCagedUser(message.guild.id, targetUser.id);
        const hasCageRole = cageRole && targetMember.roles.cache.has(cageRole.id);

        if (!cagedRecord && !hasCageRole) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not currently in the fishbowl.`)] });
        }

        const reason = args.slice(1).join(' ').trim() || 'released from fishbowl';

        // Remove Caged role
        if (cageRole && targetMember.roles.cache.has(cageRole.id)) {
            await targetMember.roles.remove(cageRole, `${message.author.tag} (${message.author.id}) [unfishbowl]: released from spectator bowl`).catch(() => {});
        }

        // Restore saved roles
        const restoredRoles = [];
        if (cagedRecord && Array.isArray(cagedRecord.roles)) {
            for (const rId of cagedRecord.roles) {
                const role = message.guild.roles.cache.get(rId);
                if (role && role.position < botMember.roles.highest.position && !role.managed) {
                    restoredRoles.push(role.id);
                }
            }
            if (restoredRoles.length > 0) {
                await targetMember.roles.add(restoredRoles, `${message.author.tag} (${message.author.id}) [unfishbowl]: restoring roles`).catch(() => {});
            }
        }

        // Remove from DB
        if (client.db) {
            await client.db.removeCagedUser(message.guild.id, targetUser.id);
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
                action: 'unfishbowl',
                reason,
                duration: 0
            });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: `released from the fishbowl (restored ${restoredRoles.length} roles)`,
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'unfishbowl',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (${restoredRoles.length} roles restored)`,
            caseId
        });
    }
}

module.exports = UnfishbowlCommand;
