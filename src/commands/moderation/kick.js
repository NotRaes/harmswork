const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class KickCommand {
    constructor() {
        this.name = 'kick';
        this.aliases = ['k'];
        this.description = 'kick a member from the server.';
        this.syntax = ',kick <@user> [reason]';
        this.example = ',kick @user spamming chat';
        this.category = 'moderation';
        this.permissions = ['KickMembers'];
        this.cooldown = 3;
        this.noHelp = true;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the kick members permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the kick members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,kick <@user> [reason]')] });
        }

        const targetArg = args[0];
        const resolved = await resolveUserOrMember(message, targetArg);
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

        const reason = args.slice(1).join(' ').trim() || 'no reason provided';

        // Create DB Case
        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetUser.id,
                userTag: targetUser.tag || targetUser.username,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'kick',
                reason,
                duration: 0
            });
        }

        // Send Infraction DM before kicking
        await sendInfractionDM(targetUser, message.guild, {
            action: 'kick',
            reason,
            moderator: message.author,
            caseId
        });

        // Execute Discord Kick
        try {
            await targetMember.kick(`${message.author.tag} (${message.author.id}): ${reason}`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to kick member: ${err.message}`)] });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'kicked',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'kick',
            target: targetUser,
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = KickCommand;
