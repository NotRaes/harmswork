const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const { logToModLogs, canModerate } = require('../../structures/utils/helpers/modhelper.js');

class MassbanCommand {
    constructor() {
        this.name = 'massban';
        this.aliases = ['multiban'];
        this.description = 'ban multiple user IDs from the server simultaneously.';
        this.syntax = ',massban <id1> <id2> <id3>... [reason]';
        this.example = ',massban 111111111111111111 222222222222222222 raid accounts';
        this.category = 'moderation';
        this.permissions = ['BanMembers'];
        this.cooldown = 5;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the ban members permission to use massban.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the ban members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,massban <id1> <id2> <id3>... [reason]')] });
        }

        // Separate user IDs from reason
        const userIds = [];
        const reasonWords = [];

        for (const arg of args) {
            const clean = arg.replace(/[<@!>]/g, '').trim();
            if (/^\d{17,20}$/.test(clean)) {
                userIds.push(clean);
            } else {
                reasonWords.push(arg);
            }
        }

        if (userIds.length === 0) {
            return message.reply({ embeds: [build.warn(message.author, 'no valid user IDs provided to ban.')] });
        }

        if (userIds.length > 50) {
            return message.reply({ embeds: [build.warn(message.author, 'you cannot massban more than 50 users at a time.')] });
        }

        const reason = reasonWords.join(' ').trim() || 'massban raid containment';
        const statusMsg = await message.reply({
            embeds: [build.say(message.author, `processing massban for **${userIds.length}** accounts...`)]
        });

        let successCount = 0;
        let failedCount = 0;

        for (const id of userIds) {
            // Check hierarchy if member in guild
            const member = message.guild.members.cache.get(id);
            if (member) {
                const check = canModerate(message.member, member, botMember);
                if (!check.can) {
                    failedCount++;
                    continue;
                }
            }

            try {
                await message.guild.bans.create(id, {
                    reason: `${message.author.tag} (${message.author.id}) [massban]: ${reason}`,
                    deleteMessageSeconds: 86400
                });
                successCount++;
                if (client.db) {
                    await client.db.createModCase({
                        guildId: message.guild.id,
                        userId: id,
                        userTag: member ? (member.user.tag || member.user.username) : id,
                        moderatorId: message.author.id,
                        moderatorTag: message.author.tag || message.author.username,
                        action: 'massban',
                        reason,
                        duration: 0
                    });
                }
                await new Promise(r => setTimeout(r, 120));
            } catch (_) {
                failedCount++;
            }
        }

        const failText = failedCount > 0 ? ` · failed: \`${failedCount}\`` : '';
        await statusMsg.edit({
            embeds: [build.approved(message.author, `banned **${successCount}** account${successCount === 1 ? '' : 's'}${failText} — ${reason}`)]
        });

        await logToModLogs(message.guild, client, {
            action: 'massban',
            target: { id: message.guild.id, tag: `${successCount} accounts` },
            moderator: message.author,
            reason: `${reason} (${successCount} banned)`,
            caseId: 0
        });
    }
}

module.exports = MassbanCommand;
