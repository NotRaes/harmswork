const { EmbedBuilder } = require('discord.js');
const config = require('../../config.js');

const ROASTS = [
    'you type like you are being charged 10 cents per vowel.',
    'you bring the exact same energy to a room as a 2% battery notification.',
    'even your autocorrect gave up on trying to help you.',
    'you look like you rehearse your discord replies in the notes app first.',
    'you have the conversational presence of an unskippable 15-second ad.',
    'your thoughts have an estimated 450ms ping to your keyboard.',
    'you couldn\'t read the room even if it had subtitles on.',
    'your spotify wrapped was probably just 80 hours of white noise and defeat.',
    'you give off very strong unread terms-of-service energy.',
    'your opinion arrived three business days late and completely unsolicited.',
    'you are the human equivalent of a loading spinner that never finishes.',
    'not even your shadow wants to be associated with that take.',
    'you mute your microphone just to breathe louder in text chat.',
    'you have the aesthetic appeal of a default discord avatar with no banner.',
    'you act like you are main character material, but you are barely in the background credits.',
    'your wifi router puts in more effort than your entire personality.',
    'you probably say "it is what it is" after making the worst decision imaginable.',
    'if awkwardness was currency, you would own the entire economy.',
    'you talk with the unearned confidence of someone who has never been fact-checked in public.',
    'the only thing holding your life together right now is discord nitro and pure denial.'
];

class RoastCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'roast';
        this.aliases = ['burn'];
        this.description = 'deliver a crisp, witty roast with zero remorse.';
        this.syntax = ',roast [@user]';
        this.example = ',roast @user\n,roast';
        this.category = 'fun';
        this.cooldown = 2;
    }

    async execute(message, args) {
        let targetUser = message.author;
        if (args && args.length > 0) {
            const rawId = args[0].replace(/[<@!>]/g, '');
            const mention = typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null;
            if (mention) {
                targetUser = mention;
            } else if (/^\d{17,20}$/.test(rawId)) {
                try { targetUser = await message.client.users.fetch(rawId); } catch (_) {}
            } else if (message.guild) {
                const query = args.join(' ').toLowerCase();
                const member = message.guild.members.cache.find(m =>
                    m.user.username.toLowerCase() === query ||
                    m.displayName.toLowerCase() === query
                );
                if (member) targetUser = member.user;
            }
        }

        // Easter egg if roasting the bot itself
        if (targetUser.id === message.client.user.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.colors.c || '#0A0A0C')
                        .setDescription(
                            `### [roast diagnostic](https://discord.gg/hCQhTmPf2G)\n` +
                            `nice try, <@${message.author.id}>. roasting an automated script is the most desperate plea for attention harm has witnessed today.`
                        )
                ]
            });
        }

        const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
        const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 256 });

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setThumbnail(avatarUrl)
            .setDescription(
                `### [roast diagnostic](https://discord.gg/hCQhTmPf2G)\n` +
                `**target** <@${targetUser.id}>\n\n` +
                `> "${roast}"\n\n` +
                `-# emotional durability: critically compromised`
            );

        return message.reply({ embeds: [embed] });
    }
}

module.exports = RoastCommand;
