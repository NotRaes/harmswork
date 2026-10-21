const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    parseDuration,
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord limit: 28 days

class TimeoutCommand {
    constructor() {
        this.name = 'timeout';
        this.aliases = ['mute', 'to', 'm', 't'];
        this.description = 'temporarily mute or timeout a member for a specified duration.';
        this.syntax = ',timeout <@user> <duration> [reason]';
        this.example = ',timeout @user 10m spamming channels';
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

        if (args.length < 2) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,timeout <@user> <duration> [reason]')] });
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

        // Parse duration
        const durationStr = args[1];
        const parsed = parseDuration(durationStr);
        if (!parsed || parsed.ms < 10000 || parsed.ms > MAX_TIMEOUT_MS) {
            return message.reply({
                embeds: [build.warn(message.author, 'duration must be between `10s` and `28d` (e.g. `10m`, `2h`, `7d`).')]
            });
        }

        const reason = args.slice(2).join(' ').trim() || 'no reason provided';

        // Create DB Case
        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetUser.id,
                userTag: targetUser.tag || targetUser.username,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'timeout',
                reason,
                duration: parsed.ms
            });
            await client.db.setActiveMute(message.guild.id, targetUser.id, Date.now() + parsed.ms, reason, message.author.id);
        }

        // Send Infraction DM before timeout
        await sendInfractionDM(targetUser, message.guild, {
            action: 'timeout',
            reason,
            moderator: message.author,
            durationStr: parsed.formatted,
            caseId
        });

        // Execute Discord Timeout
        try {
            await targetMember.timeout(parsed.ms, `${message.author.tag} (${message.author.id}): ${reason}`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to timeout member: ${err.message}`)] });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'muted',
            target: targetUser,
            reason,
            durationStr: parsed.formatted,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'timeout',
            target: targetUser,
            moderator: message.author,
            reason,
            durationStr: parsed.formatted,
            caseId
        });
    }
}

module.exports = TimeoutCommand;
