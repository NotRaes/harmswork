const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class WarnCommand {
    constructor() {
        this.name = 'warn';
        this.aliases = ['w'];
        this.description = 'issue a formal warning infraction to a member.';
        this.syntax = ',warn <@user> <reason>';
        this.example = ',warn @user advertising in general chat';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 2;
        this.subcommands = ['warn <@user> <reason>'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        if (args.length < 2) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,warn <@user> <reason>')] });
        }

        const targetArg = args[0];
        const resolved = await resolveUserOrMember(message, targetArg);
        if (!resolved || !resolved.member) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
        }

        const targetMember = resolved.member;
        const targetUser = targetMember.user;
        const botMember = message.guild.members.me;

        // Hierarchy check
        const check = canModerate(message.member, targetMember, botMember);
        if (!check.can) {
            return message.reply({ embeds: [build.deny(message.author, check.reason)] });
        }

        const reason = args.slice(1).join(' ').trim();
        if (!reason) {
            return message.reply({ embeds: [build.warn(message.author, 'please provide a reason for the warning.')] });
        }

        // Create DB Case
        let caseId = 0;
        let warnCount = 1;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetUser.id,
                userTag: targetUser.tag || targetUser.username,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'warn',
                reason,
                duration: 0
            });
            const allWarns = await client.db.getUserWarns(message.guild.id, targetUser.id);
            warnCount = allWarns.length;
        }

        // Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: `warn (#${warnCount})`,
            reason,
            moderator: message.author,
            caseId
        });

        // Send Harm Response
        await sendModResponse(message, {
            action: `warned (infraction #${warnCount})`,
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: `warn (#${warnCount})`,
            target: targetUser,
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = WarnCommand;
