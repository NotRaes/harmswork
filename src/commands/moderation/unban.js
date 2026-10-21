const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    logToModLogs,
    sendModResponse
} = require('../../structures/utils/helpers/modhelper.js');

class UnbanCommand {
    constructor() {
        this.name = 'unban';
        this.aliases = ['ub'];
        this.description = 'unban a user from the server by id or username tag.';
        this.syntax = ',unban <user_id/tag> [reason]';
        this.example = ',unban 123456789012345678 appealed punishment';
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
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,unban <user_id/tag> [reason]')] });
        }

        const query = args[0].replace(/[<@!>]/g, '').trim();
        const reason = args.slice(1).join(' ').trim() || 'no reason provided';

        // Fetch ban list
        const bans = await message.guild.bans.fetch().catch(() => null);
        if (!bans) {
            return message.reply({ embeds: [build.deny(message.author, 'failed to fetch server ban list.')] });
        }

        // Find ban by ID or Tag
        const banEntry = bans.find(b =>
            b.user.id === query ||
            b.user.tag.toLowerCase() === query.toLowerCase() ||
            b.user.username.toLowerCase() === query.toLowerCase()
        );

        if (!banEntry) {
            return message.reply({ embeds: [build.warn(message.author, 'no banned user found matching that id or tag.')] });
        }

        const targetUser = banEntry.user;

        // Check Hardban protection
        if (client.db) {
            const isHardbanned = await client.db.isHardbanned(message.guild.id, targetUser.id);
            if (isHardbanned) {
                return message.reply({
                    embeds: [build.deny(message.author, `**${targetUser.tag}** is hardbanned. you must lift the hardban before unbanning.`)]
                });
            }
        }

        // Execute Unban
        try {
            await message.guild.bans.remove(targetUser.id, `${message.author.tag} (${message.author.id}): ${reason}`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to unban user: ${err.message}`)] });
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
                action: 'unban',
                reason,
                duration: 0
            });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'unbanned',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'unban',
            target: targetUser,
            moderator: message.author,
            reason,
            caseId
        });
    }
}

module.exports = UnbanCommand;
