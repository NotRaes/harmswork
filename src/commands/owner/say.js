const build = require('../../structures/utils/builder.js');

class SayCommand {
    constructor() {
        this.name = 'say';
        this.aliases = ['echo', 'speak'];
        this.description = 'broadcast a message into a specified channel as the bot.';
        this.syntax = ',say [#channel|channel_id] <message>';
        this.example = ',say #general hello everyone';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 1;
    }

    async execute(message, args) {
        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: `,say [#channel|channel_id] <message>`')] });
        }

        let targetChannel = message.channel;
        let textTokens = [...args];

        const firstArg = args[0].replace(/[<#>]/g, '').trim();
        const foundChannel = message.client.channels.cache.get(firstArg) || message.guild?.channels?.cache?.get(firstArg);

        if (foundChannel && foundChannel.isTextBased()) {
            targetChannel = foundChannel;
            textTokens = args.slice(1);
        }

        const content = textTokens.join(' ').trim();
        if (!content) {
            return message.reply({ embeds: [build.warn(message.author, 'provide text to broadcast.')] });
        }

        try {
            await targetChannel.send(content);
            if (targetChannel.id !== message.channel.id) {
                return message.reply({ embeds: [build.approved(message.author, `message delivered to <#${targetChannel.id}>.`)] });
            }
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to send message: ${err.message}`)] });
        }
    }
}

module.exports = SayCommand;
