const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class SoftbanCommand {
    constructor() {
        this.name = 'softban';
        this.aliases = ['sb'];
        this.description = 'ban and immediately unban a member to purge 7 days of their messages.';
        this.syntax = ',softban <@user> [reason]';
        this.example = ',softban @user clearing spam messages';
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
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,softban <@user> [reason]')] });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.user) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member.')] });
        }

        const targetUser = resolved.user;
        const targetMember = resolved.member;

        // Hierarchy check
        if (targetMember) {
            const check = canModerate(message.member, targetMember, botMember);
            if (!check.can) {
                return message.reply({ embeds: [build.deny(message.author, check.reason)] });
            }
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
                action: 'softban',
                reason,
                duration: 0
            });
        }

        // Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: 'softban',
            reason,
            moderator: message.author,
            caseId
        });

        // Execute Ban with 7 days message purge
        try {
            await message.guild.bans.create(targetUser.id, {
                reason: `${message.author.tag} (${message.author.id}) [softban]: ${reason}`,
                deleteMessageSeconds: 7 * 86400
            });
            // Immediately unban
            await message.guild.bans.remove(targetUser.id, 'softban purge completed');
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to softban member: ${err.message}`)] });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'softbanned (purged 7d chat history)',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'softban',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (purged 7d messages)`,
            caseId
        });
    }
}

module.exports = SoftbanCommand;
