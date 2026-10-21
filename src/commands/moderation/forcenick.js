const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class ForcenickCommand {
    constructor() {
        this.name = 'forcenick';
        this.aliases = ['fn'];
        this.description = 'lock a member\'s nickname so they cannot change it.';
        this.syntax = ',forcenick <@user> <nickname> or ,forcenick remove <@user>';
        this.example = ',forcenick @user moderated nickname';
        this.category = 'moderation';
        this.permissions = ['ManageNicknames'];
        this.subcommands = ['forcenick <@user> <nickname>', 'forcenick remove <@user>'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the manage nicknames permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the manage nicknames permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,forcenick <@user> <nickname> or ,forcenick remove <@user>')] });
        }

        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        // Subcommand: remove
        if (args[0].toLowerCase() === 'remove' || args[0].toLowerCase() === 'reset' || args[0].toLowerCase() === 'lift') {
            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,forcenick remove <@user>')] });
            }
            const resolved = await resolveUserOrMember(message, args[1]);
            if (!resolved || !resolved.user) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
            }
            await client.db.removeForcenick(message.guild.id, resolved.user.id);
            if (resolved.member) {
                await resolved.member.setNickname(null, 'forcenick removed').catch(() => {});
            }
            return message.reply({
                embeds: [build.approved(message.author, `removed nickname lock for **${resolved.user.tag || resolved.user.username}**.`)]
            });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
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

        const nickname = args.slice(1).join(' ').trim();
        if (!nickname) {
            return message.reply({ embeds: [build.warn(message.author, 'please specify the nickname to lock.')] });
        }

        if (nickname.length > 32) {
            return message.reply({ embeds: [build.warn(message.author, 'nicknames cannot exceed 32 characters.')] });
        }

        try {
            await targetMember.setNickname(nickname, `${message.author.tag} (${message.author.id}): forcenick applied`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to change nickname: ${err.message}`)] });
        }

        await client.db.setForcenick(message.guild.id, targetUser.id, nickname, message.author.id);

        return message.reply({
            embeds: [build.approved(message.author, `locked nickname of **${targetUser.tag || targetUser.username}** to **${nickname}**.`)]
        });
    }
}

module.exports = ForcenickCommand;
