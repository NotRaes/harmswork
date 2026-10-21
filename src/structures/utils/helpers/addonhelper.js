const config = require('../../../config.js');

const ADDONS = {
    voicemaster: {
        id: 'voicemaster',
        name: 'voicemaster',
        label: 'voicemaster',
        description: 'temporary join-to-create voice channels & interface',
        emoji: config.emojis?.infovc || '<:infovc:1558818761405104218>',
        default: false,
        aliases: ['vm', 'voice', 'j2c'],
        categories: ['voicemaster'],
        commands: ['voicemaster', 'vm', 'voice']
    },
    economy: {
        id: 'economy',
        name: 'economy',
        label: 'economy',
        description: 'currency, careers, work shifts, robbing, shop & bounties',
        emoji: config.emojis?.coin || '<:coin:1558818714055479421>',
        default: false,
        aliases: ['eco', 'economy', 'currency', 'money', 'bank'],
        categories: ['economy'],
        commands: ['balance', 'bal', 'daily', 'work', 'pay', 'rob', 'crime', 'deposit', 'dep', 'withdraw', 'with', 'shop', 'leaderboard', 'lb', 'coinflip', 'cf', 'card']
    },
    giveaway: {
        id: 'giveaway',
        name: 'giveaways',
        label: 'giveaway',
        description: 'automated community prize giveaways & roll drops',
        emoji: config.emojis?.gift || '<:gift:1558198880296898630>',
        default: false,
        aliases: ['giveaway', 'giveaways', 'gaway', 'drop', 'gw'],
        categories: ['giveaway', 'giveaways'],
        commands: ['giveaway', 'giveaways', 'gw', 'gstart', 'gwstart', 'gcreate', 'gcancel', 'gwcancel', 'gedit', 'gwedit', 'gend', 'gwend', 'gentries', 'gwentries', 'gimage', 'gwimage', 'glist', 'gwlist', 'greq', 'gwreq', 'grequirement', 'greroll', 'gwreroll']
    },
    snipe: {
        id: 'snipe',
        name: 'snipe',
        label: 'snipe & editsnipe',
        description: 'retrieve deleted messages, edit history, attachments & stickers',
        emoji: config.emojis?.harm_desc || '<:harm_desc:1559895590362419301>',
        default: false,
        aliases: ['snipe', 's', 'sniping', 'editsnipe', 'es', 'clearsnipe', 'cs'],
        categories: [],
        commands: ['snipe', 's', 'editsnipe', 'es', 'clearsnipe', 'cs']
    },
    jailbreak: {
        id: 'jailbreak',
        name: 'jailbreak',
        label: 'jailbreak minigame',
        description: 'randomized multi-stage gauntlet escape system for jailed users',
        emoji: config.emojis?.harm_unlock || config.emojis?.unlockvc || '<:unlockvc:1558818815226421308>',
        default: false,
        aliases: ['jb', 'prisonbreak', 'escape'],
        categories: [],
        commands: ['jailbreak', 'jb']
    },
    leveling: {
        id: 'leveling',
        name: 'leveling',
        label: 'leveling & progression',
        description: 'server levels, canvas rank cards, voice/text xp & role rewards',
        emoji: config.emojis?.streak || config.emojis?.harm_wand || '<:streak:1558818734582399007>',
        default: true,
        aliases: ['level', 'lvl', 'levels', 'xp', 'rank'],
        categories: ['leveling'],
        commands: ['rank', 'level', 'lvl', 'xp', 'levels', 'topxp', 'xptop', 'levelstop', 'xplb', 'rankstop', 'levelrewards', 'rewards', 'levelroles', 'lvlroles', 'leveling', 'lvlconfig', 'levelconfig']
    }
};

/**
 * Resolves an addon by ID, name, or alias.
 */
function resolveAddon(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase();

    for (const [key, addon] of Object.entries(ADDONS)) {
        if (key === clean || addon.name.toLowerCase() === clean || addon.label.toLowerCase() === clean) {
            return addon;
        }
        if (addon.aliases && addon.aliases.includes(clean)) {
            return addon;
        }
    }
    return null;
}

const commandToAddonMap = new Map();
const categoryToAddonMap = new Map();

for (const [id, addon] of Object.entries(ADDONS)) {
    if (addon.commands) {
        for (const cmd of addon.commands) commandToAddonMap.set(cmd.toLowerCase(), id);
    }
    if (addon.categories) {
        for (const cat of addon.categories) categoryToAddonMap.set(cat.toLowerCase(), id);
    }
}

/**
 * Determines which addon a given command name or category belongs to.
 */
function getAddonForCommand(commandName, category) {
    if (category) {
        const id = categoryToAddonMap.get(category.toLowerCase());
        if (id) return id;
    }
    if (commandName) {
        const id = commandToAddonMap.get(commandName.toLowerCase());
        if (id) return id;
    }
    return null;
}

module.exports = {
    ADDONS,
    resolveAddon,
    getAddonForCommand
};
