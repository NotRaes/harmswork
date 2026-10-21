const build = require('../../structures/utils/builder.js');

class DmCommand {
    constructor() {
        this.name = 'dm';
        this.aliases = ['directmessage', 'senddm'];
        this.description = 'dispatch a direct message to a user as the bot.';
        this.syntax = ',dm <@user|id> <message>';
        this.example = ',dm @user hello from harm developer';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 1;
    }

    async execute(message, args) {
        if (args.length < 2) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: `,dm <@user|id> <message>`')] });
        }

        const rawTarget = args[0].replace(/[<@!>]/g, '').trim();
        const content = args.slice(1).join(' ').trim();

        let targetUser = null;
        try {
            targetUser = message.client.users.cache.get(rawTarget) || await message.client.users.fetch(rawTarget);
        } catch (_) {}

        if (!targetUser) {
            return message.reply({ embeds: [build.warn(message.author, `unable to locate user with id or tag \`${rawTarget}\`.`)] });
        }

        try {
            await targetUser.send(content);
            return message.reply({ embeds: [build.approved(message.author, `delivered message to **${targetUser.tag || targetUser.username}** (\`${targetUser.id}\`).`)] });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to send dm: ${err.message}`)] });
        }
    }
}

module.exports = DmCommand;
