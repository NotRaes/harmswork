const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const config = require('../../config.js');

const FALLBACK_WYR = [
    { question: 'Would you rather always be 15 minutes late OR 20 minutes early?', rating: 'PG' },
    { question: 'Would you rather be able to speak all human languages OR communicate with all animals?', rating: 'PG' },
    { question: 'Would you rather have unlimited free food for life OR unlimited free flights anywhere?', rating: 'PG' },
    { question: 'Would you rather live in a bustling cyberpunk city OR a peaceful mountaintop retreat?', rating: 'PG' },
    { question: 'Would you rather never have to sleep again OR never have to eat again to survive?', rating: 'PG' },
    { question: 'Would you rather know all secrets of the ocean depths OR explore distant galaxies?', rating: 'PG' },
    { question: 'Would you rather always have 100% battery on every device OR free ultra-fast wifi anywhere?', rating: 'PG' },
    { question: 'Would you rather be able to rewind time by 10 minutes OR pause time for 1 hour once a day?', rating: 'PG' }
];

async function fetchWyrQuestion() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('https://api.truthordarebot.xyz/v1/wyr?rating=pg', {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (data && data.question) {
                return {
                    question: data.question,
                    rating: (data.rating || 'pg').toLowerCase()
                };
            }
        }
    } catch (_) {}

    return FALLBACK_WYR[Math.floor(Math.random() * FALLBACK_WYR.length)];
}

function parseWyr(raw) {
    let clean = raw.trim().replace(/^would you rather\s+/i, '').replace(/\?$/, '');
    const parts = clean.split(/\s+or\s+/i);
    if (parts.length >= 2) {
        return {
            optA: parts[0].trim(),
            optB: parts.slice(1).join(' or ').trim()
        };
    }
    return {
        optA: clean,
        optB: 'the alternative option'
    };
}

function renderVoteStats(votesA, votesB) {
    const total = votesA + votesB;
    if (total === 0) {
        return {
            statA: '`0%` · **0** votes',
            statB: '`0%` · **0** votes',
            total: 0
        };
    }

    const pctA = Math.round((votesA / total) * 100);
    const pctB = 100 - pctA;

    return {
        statA: `\`${pctA}%\` · **${votesA}** vote${votesA === 1 ? '' : 's'}`,
        statB: `\`${pctB}%\` · **${votesB}** vote${votesB === 1 ? '' : 's'}`,
        total
    };
}

class WyrCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'wyr';
        this.aliases = ['wouldyourather', 'either'];
        this.description = 'fetch a would-you-rather scenario from live api with channel consensus polling.';
        this.syntax = ',wyr';
        this.example = ',wyr';
        this.category = 'fun';
        this.cooldown = 3;
    }

    async execute(message) {
        let currentData = await fetchWyrQuestion();
        let parsed = parseWyr(currentData.question);

        // Store votes: userId -> 'a' | 'b'
        const votes = new Map();

        const buildMessagePayload = () => {
            let countA = 0;
            let countB = 0;
            for (const v of votes.values()) {
                if (v === 'a') countA++;
                else if (v === 'b') countB++;
            }

            const { statA, statB, total } = renderVoteStats(countA, countB);

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### [would you rather?](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# vote below to record your choice and see live consensus.\n\n` +
                    `**option a** ─ ${parsed.optA}\n` +
                    `${statA}\n\n` +
                    `**option b** ─ ${parsed.optB}\n` +
                    `${statB}\n\n` +
                    `-# total votes: ${total} · rating: ${currentData.rating}`
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('wyr_vote_a')
                    .setLabel('option a')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('wyr_vote_b')
                    .setLabel('option b')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('wyr_next')
                    .setLabel('next scenario')
                    .setEmoji(config.emojis?.harm_right || config.emojis?.ar || '<:harm_right:1560309045720649819>')
                    .setStyle(ButtonStyle.Secondary)
            );

            return { embeds: [embed], components: [row] };
        };

        const msg = await message.reply(buildMessagePayload()).catch(() => null);
        if (!msg) return;

        const collector = msg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'wyr_next') {
                if (i.user.id !== message.author.id) {
                    return i.reply({
                        content: 'only the command invoker can roll the next scenario.',
                        ephemeral: true
                    }).catch(() => {});
                }

                currentData = await fetchWyrQuestion();
                parsed = parseWyr(currentData.question);
                votes.clear();

                await i.update(buildMessagePayload()).catch(() => {});
                return;
            }

            if (i.customId === 'wyr_vote_a') {
                votes.set(i.user.id, 'a');
                await i.update(buildMessagePayload()).catch(() => {});
            } else if (i.customId === 'wyr_vote_b') {
                votes.set(i.user.id, 'b');
                await i.update(buildMessagePayload()).catch(() => {});
            }
        });

        collector.on('end', async () => {
            const finalPayload = buildMessagePayload();
            finalPayload.components = [];
            await msg.edit(finalPayload).catch(() => {});
        });
    }
}

module.exports = WyrCommand;
