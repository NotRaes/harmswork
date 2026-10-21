const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

const DANGEROUS_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.MentionEveryone
];

class StripstaffCommand {
    constructor() {
        this.name = 'stripstaff';
        this.aliases = ['demote', 'strip'];
        this.description = 'emergency strip all staff, administrative, and dangerous roles from a member.';
        this.syntax = ',stripstaff <@user> [reason]';
        this.example = ',stripstaff @user rogue staff member';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.cooldown = 5;
        this.subcommands = ['stripstaff <@user> [reason]'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need manage roles permission to use stripstaff.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,stripstaff <@user> [reason]')] });
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

        const reason = args.slice(1).join(' ').trim() || 'emergency staff demotion';

        // Fetch custom bound staff roles from DB
        const boundStaffRoleIds = (await client.db?.getStaffRoles(message.guild.id)) || [];

        // Identify all staff and high-permission roles on the member
        const rolesToStrip = targetMember.roles.cache.filter(role => {
            if (role.id === message.guild.roles.everyone.id || role.managed) return false;
            if (role.position >= botMember.roles.highest.position) return false;

            // Check if bound in DB
            if (boundStaffRoleIds.includes(role.id)) return true;

            // Check dangerous permissions
            return DANGEROUS_PERMISSIONS.some(perm => role.permissions.has(perm));
        });

        if (rolesToStrip.size === 0) {
            return message.reply({
                embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** has no staff or administrative roles that i can manage.`)]
            });
        }

        const strippedNames = rolesToStrip.map(r => r.name);
        const strippedIds = rolesToStrip.map(r => r.id);

        try {
            await targetMember.roles.remove(strippedIds, `${message.author.tag} (${message.author.id}) [stripstaff]: ${reason}`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to strip staff roles: ${err.message}`)] });
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
                action: 'stripstaff',
                reason: `${reason} (stripped: ${strippedNames.join(', ')})`,
                duration: 0
            });
        }

        // Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: 'stripstaff',
            reason: `${reason} (stripped ${rolesToStrip.size} roles)`,
            moderator: message.author,
            caseId
        });

        // Send Harm Response
        await sendModResponse(message, {
            action: `stripped of ${rolesToStrip.size} staff roles`,
            target: targetUser,
            reason: `${reason} (${strippedNames.slice(0, 3).join(', ')}${strippedNames.length > 3 ? '...' : ''})`,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'stripstaff',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (stripped: ${strippedNames.join(', ')})`,
            caseId
        });
    }
}

module.exports = StripstaffCommand;
