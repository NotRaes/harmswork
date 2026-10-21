const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const config = require('../../config.js');

const FALLBACK_TRUTHS = [
    { question: 'What is the most ridiculous excuse you have ever given to avoid going somewhere?', rating: 'PG' },
    { question: 'What is something you pretend to dislike just because it is popular?', rating: 'PG' },
    { question: 'What is your most irrational fear that makes zero sense to anyone else?', rating: 'PG' },
    { question: 'What is the longest amount of time you have spent doomscrolling without moving?', rating: 'PG' },
    { question: 'If you could erase one message you sent in Discord forever, what would it be?', rating: 'PG' },
    { question: 'What is a secret talent or weird habit you have never told anyone here about?', rating: 'PG' },
    { question: 'What is the most embarrassing song currently in your favorites playlist?', rating: 'PG' },
    { question: 'What is something you bought and immediately regretted 5 minutes later?', rating: 'PG' }
];

const FALLBACK_DARES = [
    { question: 'Send your most recently saved meme into chat with zero context.', rating: 'PG' },
    { question: 'Change your discord status to "thinking about potatoes" for the next 10 minutes.', rating: 'PG' },
    { question: 'Type out your favorite song lyrics entirely in question marks and emojis.', rating: 'PG' },
    { question: 'Compliment the person directly above you in chat with extreme sincerity.', rating: 'PG' },
    { question: 'Speak only in formal old english for the next 5 messages you send here.', rating: 'PG' },
    { question: 'Ping someone in the server and immediately pretend you did not do it.', rating: 'PG' },
    { question: 'Explain your favorite hobby using only words that start with the letter P.', rating: 'PG' }
];

async function fetchChallenge(type) {
    const isDare = type === 'dare';
    const endpoint = isDare
        ? 'https://api.truthordarebot.xyz/v1/dare?rating=pg'
        : 'https://api.truthordarebot.xyz/v1/truth?rating=pg';

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (data && data.question) {
                return {
                    question: data.question,
                    rating: (data.rating || 'pg').toLowerCase(),
                    type: isDare ? 'dare' : 'truth'
                };
            }
        }
    } catch (_) {}

    const pool = isDare ? FALLBACK_DARES : FALLBACK_TRUTHS;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return {
        question: picked.question,
        rating: picked.rating.toLowerCase(),
        type: isDare ? 'dare' : 'truth'
    };
}

class TodCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'tod';
        this.aliases = ['truthordare', 'truth', 'dare'];
        this.description = 'play interactive truth or dare with live scenario prompts from api.';
        this.syntax = ',tod [truth|dare]';
        this.example = ',tod\n,tod truth\n,tod dare';
        this.category = 'fun';
        this.cooldown = 3;
    }

    buildRow() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('tod_truth')
                .setLabel('truth')
                .setEmoji(config.emojis?.mail || config.emojis?.harm_mail || '<:harm_mail:1560309035327291547>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('tod_dare')
                .setLabel('dare')
                .setEmoji(config.emojis?.harm_bomb || '<:harm_bomb:1561738453505417256>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('tod_random')
                .setLabel('random')
                .setEmoji(config.emojis?.wand || config.emojis?.harm_wand || '<:harm_wand:1560309018973442169>')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    buildEmbed(user, challenge) {
        return new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setDescription(
                `### [truth or dare](https://discord.gg/hCQhTmPf2G)\n` +
                `**player** <@${user.id}> · **mode** \`${challenge.type}\`\n\n` +
                `> "${challenge.question}"\n\n` +
                `-# rating: ${challenge.rating} · select a mode below for the next challenge.`
            );
    }

    async execute(message, args) {
        const sub = (args[0] || '').toLowerCase();
        let initialType = null;

        if (sub === 'truth' || message.content.toLowerCase().startsWith(',truth')) {
            initialType = 'truth';
        } else if (sub === 'dare' || message.content.toLowerCase().startsWith(',dare')) {
            initialType = 'dare';
        }

        // If direct mode was requested
        if (initialType) {
            const challenge = await fetchChallenge(initialType);
            const embed = this.buildEmbed(message.author, challenge);
            const row = this.buildRow();
            const msg = await message.reply({ embeds: [embed], components: [row] }).catch(() => null);
            if (msg) this.setupCollector(msg, message);
            return;
        }

        // Interactive Menu Mode
        const embed = new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setDescription(
                `### [truth or dare](https://discord.gg/hCQhTmPf2G)\n` +
                `**player** <@${message.author.id}>\n\n` +
                `-# select your challenge category below to receive a live prompt.`
            );

        const row = this.buildRow();
        const msg = await message.reply({ embeds: [embed], components: [row] }).catch(() => null);
        if (msg) this.setupCollector(msg, message);
    }

    setupCollector(msg, message) {
        const collector = msg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            let type = 'truth';
            if (i.customId === 'tod_dare') type = 'dare';
            else if (i.customId === 'tod_random') type = Math.random() < 0.5 ? 'truth' : 'dare';

            const challenge = await fetchChallenge(type);
            const updatedEmbed = this.buildEmbed(i.user, challenge);
            const row = this.buildRow();

            await i.update({
                embeds: [updatedEmbed],
                components: [row]
            }).catch(() => {});
        });

        collector.on('end', async () => {
            await msg.edit({ components: [] }).catch(() => {});
        });
    }
}

module.exports = TodCommand;
