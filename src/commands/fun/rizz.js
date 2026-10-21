const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

const RIZZ_LINES = [
    'i was going to say something smooth, but you already made me forget my train of thought.',
    'i usually keep my notifications muted, but i\'d leave yours on loud.',
    'you have that effortless energy people spend years trying to fake.',
    'they told me nothing lasts forever, so would you mind being my nothing?',
    'i wasn\'t planning on getting distracted today, but then you typed in chat.',
    'you make staying unbothered remarkably difficult.',
    'my screen time was down 40% today until you sent a message.',
    'you don\'t even have to try; your presence does all the talking.',
    'i\'m not usually one to gamble, but i\'d bet on us.',
    'if you were a song, you\'d be the track i put on loop and never skip.',
    'i told myself i\'d stay detached today, but then you showed up.',
    'i\'d willingly turn off do not disturb just to see your messages.',
    'is it just me, or did the whole room get quieter when you started talking?',
    'you must be a high-refresh display, because you make everything look smoother.',
    'i don\'t need a weather report to know the temperature went up when you joined.',
    'i was having a completely average day until i saw your notification.',
    'you have the kind of subtle magnetism people write albums about.',
    'are you an echo? because everything you say stays in my head.',
    'i\'m not a mind reader, but i could tell you were waiting for me to say something.',
    'you didn\'t even say much, but you still said everything.',
    'i could listen to you talk about the most random topic and still be completely invested.',
    'they say timing is everything, and seeing you felt right on time.',
    'every playlist makes sense when i think about you.',
    'i\'m not a photographer, but i can easily picture us together.',
    'you have that rare energy where you don\'t even need to speak to be noticed.',
    'are you a bookmark? because i definitely want to remember where we left off.',
    'you bring the kind of calm that makes everything else feel loud.',
    'i\'d let you ruin my sleep schedule any night of the week.',
    'your name looks really good next to my incoming notification badge.',
    'some people take hours to make an impression; you did it in three words.',
    'i was doing completely fine until you walked in with unmatched confidence.'
];

function getRandomLine() {
    return RIZZ_LINES[Math.floor(Math.random() * RIZZ_LINES.length)];
}

function resolveTargetUser(message, args) {
    if (!args || args.length === 0) return null;
    const rawId = args[0].replace(/[<@!>]/g, '').trim();
    const mention = typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null;
    if (mention) return mention;
    if (/^\d{17,20}$/.test(rawId)) {
        const cached = message.client.users.cache.get(rawId);
        if (cached) return cached;
    }
    if (message.guild) {
        const query = args.join(' ').toLowerCase();
        const member = message.guild.members.cache.find(m =>
            m.user.username.toLowerCase() === query ||
            m.displayName.toLowerCase() === query ||
            m.user.tag.toLowerCase() === query
        );
        if (member) return member.user;
    }
    return null;
}

class RizzCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'rizz';
        this.aliases = ['flirt', 'pickupline'];
        this.description = 'drop a smooth, modern pickup line on someone with zero hesitation.';
        this.syntax = ',rizz <@user>';
        this.example = ',rizz @user';
        this.category = 'fun';
        this.cooldown = 3;
    }

    async execute(message, args) {
        const target = resolveTargetUser(message, args);

        if (!target) {
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,rizz <@user>`')]
            });
        }

        // Self-rizz check
        if (target.id === message.author.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.colors.c || '#0A0A0C')
                        .setDescription(
                            `### [rizz](https://discord.gg/hCQhTmPf2G)\n` +
                            `<@${message.author.id}> trying to rizz themselves up in the mirror... have some self-respect.`
                        )
                ]
            });
        }

        // Bot rizz check
        if (target.id === message.client.user.id) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.colors.c || '#0A0A0C')
                        .setDescription(
                            `### [rizz](https://discord.gg/hCQhTmPf2G)\n` +
                            `nice try <@${message.author.id}>, but harm's heart is strictly read-only.`
                        )
                ]
            });
        }

        const line = getRandomLine();
        const embed = new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setDescription(
                `### [rizz](https://discord.gg/hCQhTmPf2G)\n` +
                `<@${message.author.id}> ─ <@${target.id}>\n\n` +
                `> "${line}"\n\n` +
                `-# delivery: effortless · zero hesitation`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`rizz_back_${message.author.id}_${target.id}`)
                .setLabel('return rizz')
                .setEmoji(config.emojis?.harm_heart || '<:harm_heart:1559895595848695960>')
                .setStyle(ButtonStyle.Secondary)
        );

        const replyMsg = await message.reply({ embeds: [embed], components: [row] }).catch(() => null);
        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({
            filter: i => i.customId === `rizz_back_${message.author.id}_${target.id}`,
            time: 45000
        });

        collector.on('collect', async i => {
            if (i.user.id !== target.id) {
                return i.reply({
                    content: `only <@${target.id}> can return this line.`,
                    ephemeral: true
                }).catch(() => {});
            }

            const returnLine = getRandomLine();
            const returnEmbed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### [rizz returned](https://discord.gg/hCQhTmPf2G)\n` +
                    `<@${target.id}> ─ <@${message.author.id}>\n\n` +
                    `> "${returnLine}"\n\n` +
                    `-# smooth counter-play · mutual chemistry`
                );

            await i.update({ components: [] }).catch(() => {});
            await message.channel.send({ embeds: [returnEmbed] }).catch(() => {});
            collector.stop('returned');
        });

        collector.on('end', async (_, reason) => {
            if (reason !== 'returned') {
                await replyMsg.edit({ components: [] }).catch(() => {});
            }
        });
    }
}

module.exports = RizzCommand;
