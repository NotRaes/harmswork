const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    logToModLogs,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class ClearwarnsCommand {
    constructor() {
        this.name = 'clearwarns';
        this.aliases = ['cw', 'warnclear'];
        this.description = 'clear all or a specific warning infraction for a member.';
        this.syntax = ',clearwarns <@user> [case_id]';
        this.example = ',clearwarns @user 14';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 2;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,clearwarns <@user> [case_id]')] });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.user) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
        }

        const targetUser = resolved.user;
        const targetDisplay = targetUser.tag || targetUser.username;

        let specificCaseId = null;
        if (args[1] && !isNaN(args[1])) {
            specificCaseId = parseInt(args[1], 10);
        }

        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const clearedCount = await client.db.clearUserWarns(message.guild.id, targetUser.id, specificCaseId);

        if (clearedCount === 0) {
            if (specificCaseId) {
                return message.reply({
                    embeds: [build.warn(message.author, `no active warning found for **${targetDisplay}** with case id \`#${specificCaseId}\`!`)]
                });
            }
            return message.reply({
                embeds: [build.warn(message.author, `**${targetDisplay}** has no active warnings to clear.`)]
            });
        }

        const msgText = specificCaseId
            ? `cleared warning \`#${specificCaseId}\` for **${targetDisplay}**.`
            : `cleared **${clearedCount}** warning${clearedCount === 1 ? '' : 's'} for **${targetDisplay}**.`;

        await message.reply({
            embeds: [build.approved(message.author, msgText)]
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'clearwarns',
            target: targetUser,
            moderator: message.author,
            reason: specificCaseId ? `cleared case #${specificCaseId}` : `cleared all (${clearedCount} total)`,
            caseId: specificCaseId || 0
        });
    }
}

module.exports = ClearwarnsCommand;
