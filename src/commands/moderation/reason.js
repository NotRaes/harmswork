const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const { logToModLogs } = require('../../structures/utils/helpers/modhelper.js');

class ReasonCommand {
    constructor() {
        this.name = 'reason';
        this.aliases = ['r'];
        this.description = 'update the reason for a previous moderation case.';
        this.syntax = ',reason <case_id> <new_reason>';
        this.example = ',reason 14 appealed after discussion';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 2;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        if (args.length < 2 || isNaN(args[0])) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,reason <case_id> <new_reason>')] });
        }

        const caseId = parseInt(args[0], 10);
        const newReason = args.slice(1).join(' ').trim();

        if (!newReason) {
            return message.reply({ embeds: [build.warn(message.author, 'please provide the new reason.')] });
        }

        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const c = await client.db.getModCase(message.guild.id, caseId);
        if (!c) {
            return message.reply({ embeds: [build.warn(message.author, `no moderation case found with id \`#${caseId}\` in this server.`)] });
        }

        const oldReason = c.reason || 'no reason provided';
        const success = await client.db.updateCaseReason(message.guild.id, caseId, newReason);

        if (!success) {
            return message.reply({ embeds: [build.deny(message.author, 'failed to update case reason.')] });
        }

        await message.reply({
            embeds: [build.approved(message.author, `updated reason for case \`#${caseId}\` (${c.action}) to: **${newReason}**`)]
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: `reason update (case #${caseId})`,
            target: { id: c.user_id, tag: c.user_tag || c.user_id },
            moderator: message.author,
            reason: `old: ${oldReason} -> new: ${newReason}`,
            caseId
        });
    }
}

module.exports = ReasonCommand;
