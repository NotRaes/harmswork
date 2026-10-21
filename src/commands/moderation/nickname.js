const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class NicknameCommand {
    constructor() {
        this.name = 'nickname';
        this.aliases = ['nick'];
        this.description = 'change or reset a member\'s server nickname.';
        this.syntax = ',nick <@user> [new_nick]';
        this.example = ',nick @user aesthetic or ,nick @user';
        this.category = 'moderation';
        this.permissions = ['ManageNicknames'];
        this.cooldown = 2;
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
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,nick <@user> [new_nick]')] });
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

        const newNick = args.slice(1).join(' ').trim() || null;

        if (newNick && newNick.length > 32) {
            return message.reply({ embeds: [build.warn(message.author, 'nicknames cannot exceed 32 characters.')] });
        }

        try {
            await targetMember.setNickname(newNick, `${message.author.tag} (${message.author.id}): nickname update`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to change nickname: ${err.message}`)] });
        }

        const targetDisplay = targetUser.tag || targetUser.username;
        if (newNick) {
            return message.reply({
                embeds: [build.approved(message.author, `changed nickname for **${targetDisplay}** to **${newNick}**.`)]
            });
        } else {
            return message.reply({
                embeds: [build.approved(message.author, `reset nickname for **${targetDisplay}**.`)]
            });
        }
    }
}

module.exports = NicknameCommand;
