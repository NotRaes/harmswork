const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class BanCommand {
    constructor() {
        this.name = 'ban';
        this.aliases = ['b'];
        this.description = 'ban a member from the server.';
        this.syntax = ',ban <@user/id> [reason]';
        this.example = ',ban @user breaking server rules';
        this.category = 'moderation';
        this.permissions = ['BanMembers'];
        this.cooldown = 3;
        this.noHelp = true;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the ban members permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the ban members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,ban <@user/id> [reason]')] });
        }

        const targetArg = args[0];
        const resolved = await resolveUserOrMember(message, targetArg);
        if (!resolved || !resolved.user) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
        }

        const targetUser = resolved.user;
        const targetMember = resolved.member;

        // Hierarchy check if member is inside guild
        if (targetMember) {
            const check = canModerate(message.member, targetMember, botMember);
            if (!check.can) {
                return message.reply({ embeds: [build.deny(message.author, check.reason)] });
            }
        }

        const reason = args.slice(1).join(' ').trim() || 'no reason provided';

        // Check if already banned
        const existingBan = await message.guild.bans.fetch(targetUser.id).catch(() => null);
        if (existingBan) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already banned.`)] });
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
                action: 'ban',
                reason,
                duration: 0
            });
        }

        // Send Infraction DM before ban
        await sendInfractionDM(targetUser, message.guild, {
            action: 'ban',
            reason,
            moderator: message.author,
            caseId
        });

        // Execute Discord Ban
        try {
            await message.guild.bans.create(targetUser.id, {
                reason: `${message.author.tag} (${message.author.id}): ${reason}`
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to ban user: ${err.message}`)] });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'banned',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'ban',
            target: targetUser,
            moderator: message.author,
            reason: deleteDays > 0 ? `${reason} (purged ${deleteDays}d messages)` : reason,
            caseId
        });
    }
}

module.exports = BanCommand;
