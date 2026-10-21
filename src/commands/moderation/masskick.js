const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const { logToModLogs, canModerate } = require('../../structures/utils/helpers/modhelper.js');

class MasskickCommand {
    constructor() {
        this.name = 'masskick';
        this.aliases = ['multikick'];
        this.description = 'kick multiple members from the server simultaneously.';
        this.syntax = ',masskick <id1> <id2> <id3>... [reason]';
        this.example = ',masskick 111111111111111111 222222222222222222 inactive raiders';
        this.category = 'moderation';
        this.permissions = ['KickMembers'];
        this.cooldown = 5;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the kick members permission to use masskick.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the kick members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,masskick <id1> <id2> <id3>... [reason]')] });
        }

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
            return message.reply({ embeds: [build.warn(message.author, 'no valid user IDs provided to kick.')] });
        }

        if (userIds.length > 50) {
            return message.reply({ embeds: [build.warn(message.author, 'you cannot masskick more than 50 users at a time.')] });
        }

        const reason = reasonWords.join(' ').trim() || 'masskick containment';
        const statusMsg = await message.reply({
            embeds: [build.say(message.author, `processing masskick for **${userIds.length}** accounts...`)]
        });

        let successCount = 0;
        let failedCount = 0;

        for (const id of userIds) {
            const member = message.guild.members.cache.get(id) || await message.guild.members.fetch(id).catch(() => null);
            if (!member) {
                failedCount++;
                continue;
            }

            const check = canModerate(message.member, member, botMember);
            if (!check.can) {
                failedCount++;
                continue;
            }

            try {
                await member.kick(`${message.author.tag} (${message.author.id}) [masskick]: ${reason}`);
                successCount++;
                if (client.db) {
                    await client.db.createModCase({
                        guildId: message.guild.id,
                        userId: id,
                        userTag: member.user.tag || member.user.username,
                        moderatorId: message.author.id,
                        moderatorTag: message.author.tag || message.author.username,
                        action: 'masskick',
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
            embeds: [build.approved(message.author, `kicked **${successCount}** member${successCount === 1 ? '' : 's'}${failText} — ${reason}`)]
        });

        await logToModLogs(message.guild, client, {
            action: 'masskick',
            target: { id: message.guild.id, tag: `${successCount} members` },
            moderator: message.author,
            reason: `${reason} (${successCount} kicked)`,
            caseId: 0
        });
    }
}

module.exports = MasskickCommand;
