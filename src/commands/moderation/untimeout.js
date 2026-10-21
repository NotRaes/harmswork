const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class UntimeoutCommand {
    constructor() {
        this.name = 'untimeout';
        this.aliases = ['unmute', 'unto', 'um'];
        this.description = 'remove active timeout or unmute a member.';
        this.syntax = ',untimeout <@user> [reason]';
        this.example = ',untimeout @user appeal accepted';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 3;
        this.noHelp = true;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the moderate members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,untimeout <@user> [reason]')] });
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

        const isTimedOut = targetMember.communicationDisabledUntilTimestamp &&
                           targetMember.communicationDisabledUntilTimestamp > Date.now();

        if (!isTimedOut) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not currently muted or timed out.`)] });
        }

        const reason = args.slice(1).join(' ').trim() || 'no reason provided';

        // Execute Discord Timeout removal
        try {
            await targetMember.timeout(null, `${message.author.tag} (${message.author.id}): ${reason}`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to remove timeout: ${err.message}`)] });
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
                action: 'untimeout',
                reason,
                duration: 0
            });
            await client.db.removeActiveMute(message.guild.id, targetUser.id);
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'unmuted',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'untimeout',
            target: targetUser,
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = UntimeoutCommand;
