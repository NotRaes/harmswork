const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../../config.js');

const FALLBACK_GIFS = {
    // Category A: Affection
    hug: [
        { url: 'https://media.giphy.com/media/u9BxQbM5bxvwY/giphy.gif', anime: 'nichijou' },
        { url: 'https://media.giphy.com/media/lrr9rHuoJOE0w/giphy.gif', anime: 'toradora' }
    ],
    kiss: [
        { url: 'https://media.giphy.com/media/FqBTvSNjNzeZG/giphy.gif', anime: 'chuunibyou' },
        { url: 'https://media.giphy.com/media/nyGFcsP0KAobm/giphy.gif', anime: 'toradora' }
    ],
    cuddle: [
        { url: 'https://media.giphy.com/media/PHZ7vmgmgZcss/giphy.gif', anime: 'lucky star' },
        { url: 'https://media.giphy.com/media/sUIZWMnfd4Mb6/giphy.gif', anime: 'k-on' }
    ],
    pat: [
        { url: 'https://media.giphy.com/media/ARSp9T7wwxNcs/giphy.gif', anime: 'k-on' },
        { url: 'https://media.giphy.com/media/osAcIGJnYeaE8/giphy.gif', anime: 'hyouka' }
    ],
    handhold: [
        { url: 'https://media.giphy.com/media/11rIergnpiYpvW/giphy.gif', anime: 'clannad' },
        { url: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif', anime: 'tamako love story' }
    ],
    // Category B: Playful Chaos
    slap: [
        { url: 'https://media.giphy.com/media/Gf3AUz3eBNbTW/giphy.gif', anime: 'toradora' },
        { url: 'https://media.giphy.com/media/jLeyZWgtwWP2U/giphy.gif', anime: 'clannad' }
    ],
    punch: [
        { url: 'https://media.giphy.com/media/yo3TC0yeHd53G/giphy.gif', anime: 'one punch man' },
        { url: 'https://media.giphy.com/media/arbHBDAUW958Q/giphy.gif', anime: 'dragon ball' }
    ],
    bite: [
        { url: 'https://media.giphy.com/media/yaRhyICIUpQsg/giphy.gif', anime: 'bakemonogatari' },
        { url: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif', anime: 'toradora' }
    ],
    poke: [
        { url: 'https://media.giphy.com/media/pWd3OvcNnyqw7AVPHL/giphy.gif', anime: 'k-on' },
        { url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', anime: 'hyouka' }
    ],
    tickle: [
        { url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', anime: 'nichijou' },
        { url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif', anime: 'k-on' }
    ],
    yeet: [
        { url: 'https://media.giphy.com/media/5PhDdJQd2yG1MvHzJ6/giphy.gif', anime: 'konosuba' },
        { url: 'https://media.giphy.com/media/l3vR85PnGsBwu1PFK/giphy.gif', anime: 'nichijou' }
    ],
    // Solo Expressions
    cry: [
        { url: 'https://media.giphy.com/media/ROF8OQvDmxRxK/giphy.gif', anime: 'violet evergarden' },
        { url: 'https://media.giphy.com/media/L95W4wvxxB1G8/giphy.gif', anime: 'anohana' }
    ],
    blush: [
        { url: 'https://media.giphy.com/media/befaYZCgtZfZm/giphy.gif', anime: 'kaguya-sama' },
        { url: 'https://media.giphy.com/media/T3Vvyi6SH14oE/giphy.gif', anime: 'toradora' }
    ]
};

const SOCIAL_ACTIONS = {
    // Category A: Affection
    hug: {
        category: 'affection',
        verb: 'hugged',
        noun: 'hug',
        phrase: 'a warm, genuine embrace',
        self: 'wrapped their arms around themselves... stay strong.',
        bot: 'thank you for the hug. harm feels appreciated.',
        emojiKey: 'harm_heart'
    },
    kiss: {
        category: 'affection',
        verb: 'kissed',
        noun: 'kiss',
        phrase: 'a sweet and affectionate moment',
        self: 'kissed their reflection in the mirror.',
        bot: 'flattered, but harm\'s heart is strictly read-only.',
        emojiKey: 'harm_heart'
    },
    cuddle: {
        category: 'affection',
        verb: 'cuddled up with',
        noun: 'cuddle',
        phrase: 'sharing gentle warmth together',
        self: 'curled up alone with a blanket.',
        bot: 'harm tucks you into the server blanket.',
        emojiKey: 'harm_heart'
    },
    pat: {
        category: 'affection',
        verb: 'patted',
        noun: 'pat',
        phrase: 'a comforting, gentle headpat',
        self: 'patted their own head. you did your best today.',
        bot: 'harm pats you back softly.',
        emojiKey: 'harm_wand'
    },
    handhold: {
        category: 'affection',
        verb: 'held hands with',
        noun: 'handhold',
        phrase: 'fingers intertwined softly in silence',
        self: 'held their own hands together in quiet contemplation.',
        bot: 'harm extends a digital hand in friendship.',
        emojiKey: 'harm_heart'
    },

    // Category B: Playful Chaos
    slap: {
        category: 'chaos',
        verb: 'slapped',
        noun: 'slap',
        phrase: 'a swift and resounding impact',
        self: 'slapped themselves across the face. snap out of it!',
        bot: 'hey! what did harm ever do to you?',
        emojiKey: 'harm_cross'
    },
    punch: {
        category: 'chaos',
        verb: 'punched',
        noun: 'punch',
        phrase: 'a clean, direct strike',
        self: 'threw a punch directly into the mirror.',
        bot: 'harm absorbed the impact without flinching.',
        emojiKey: 'harm_bomb'
    },
    bite: {
        category: 'chaos',
        verb: 'bit',
        noun: 'bite',
        phrase: 'a playful and sharp nibble',
        self: 'bit their own lip nervously.',
        bot: 'ouch! watch where you are biting.',
        emojiKey: 'harm_bomb'
    },
    poke: {
        category: 'chaos',
        verb: 'poked',
        noun: 'poke',
        phrase: 'demanding immediate attention',
        self: 'poked themselves in the cheek with a sigh.',
        bot: 'harm is already fully listening.',
        emojiKey: 'harm_wand'
    },
    tickle: {
        category: 'chaos',
        verb: 'tickled',
        noun: 'tickle',
        phrase: 'an unstoppable tickle assault',
        self: 'tried to tickle themselves, but science prevented it.',
        bot: 'harm cannot feel tickles, but nice try.',
        emojiKey: 'harm_wand'
    },
    yeet: {
        category: 'chaos',
        verb: 'yeeted',
        noun: 'yeet',
        phrase: 'launched across the server at terminal velocity',
        self: 'tripped over their own ego and yeeted themselves.',
        bot: 'harm is anchored into the cloud; you cannot yeet code.',
        emojiKey: 'harm_cross'
    },

    // Solo Expressions
    cry: {
        category: 'solo',
        verb: 'is crying',
        noun: 'cry',
        phrase: 'overwhelmed with emotion... someone comfort them',
        solo: true,
        emojiKey: 'tired'
    },
    blush: {
        category: 'solo',
        verb: 'is blushing',
        noun: 'blush',
        phrase: 'completely flustered and hiding their face',
        solo: true,
        emojiKey: 'harm_heart'
    }
};

async function fetchActionMedia(action) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`https://nekos.best/api/v2/${action}`, {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                const item = data.results[0];
                return {
                    url: item.url,
                    anime: (item.anime_name || 'unknown').toLowerCase()
                };
            }
        }
    } catch (_) {}

    const fallbackList = FALLBACK_GIFS[action] || FALLBACK_GIFS.hug;
    return fallbackList[Math.floor(Math.random() * fallbackList.length)];
}

function resolveTarget(message, args) {
    if (!args || args.length === 0) return null;
    const raw = args[0].trim();
    const mention = typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null;
    if (mention && mention.id !== message.author.id) return mention;

    const idMatch = raw.replace(/[<@!>]/g, '');
    if (/^\d{17,20}$/.test(idMatch)) {
        const cached = message.client.users.cache.get(idMatch);
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

module.exports = {
    SOCIAL_ACTIONS,
    fetchActionMedia,
    resolveTarget
};
