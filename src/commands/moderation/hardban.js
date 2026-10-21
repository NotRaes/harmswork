const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class HardbanCommand {
    constructor() {
        this.name = 'hardban';
        this.aliases = ['hb'];
        this.description = 'permanently ban and blacklist a user from the server.';
        this.syntax = ',hardban <@user/id> [reason] | ,hardban lift <user_id>';
        this.example = ',hardban @user malicious raider';
        this.category = 'moderation';
        this.permissions = ['BanMembers'];
        this.subcommands = ['hardban <@user> [reason]', 'hardban lift <@user>'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the ban members permission to use hardban.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the ban members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,hardban <@user/id> [reason] or ,hardban lift <user_id>')] });
        }

        // Subcommand: lift hardban
        if (args[0].toLowerCase() === 'lift' || args[0].toLowerCase() === 'remove') {
            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,hardban lift <user_id>')] });
            }
            const targetId = args[1].replace(/[<@!>]/g, '').trim();
            if (client.db) {
                const isHb = await client.db.isHardbanned(message.guild.id, targetId);
                if (!isHb) {
                    return message.reply({ embeds: [build.warn(message.author, 'that user is not hardbanned.')] });
                }
                await client.db.removeHardban(message.guild.id, targetId);
            }
            return message.reply({
                embeds: [build.approved(message.author, `lifted hardban on \`${targetId}\`. you may now unban them.`)]
            });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.user) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
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

        // Set hardban in DB
        if (client.db) {
            await client.db.setHardban(message.guild.id, targetUser.id, message.author.id, reason);
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
                action: 'hardban',
                reason,
                duration: 0
            });
        }

        // Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: 'hardban',
            reason,
            moderator: message.author,
            caseId
        });

        // Execute Ban with 7 days wipe
        try {
            await message.guild.bans.create(targetUser.id, {
                reason: `${message.author.tag} (${message.author.id}) [hardban]: ${reason}`,
                deleteMessageSeconds: 7 * 86400
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to ban user: ${err.message}`)] });
        }

        // Send Harm Response
        await sendModResponse(message, {
            action: 'hardbanned (blacklisted & 7d purged)',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'hardban',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (permanent blacklist)`,
            caseId
        });
    }
}

module.exports = HardbanCommand;
