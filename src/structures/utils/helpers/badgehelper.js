const config = require('../../../config.js');

const BADGES = {
    developer: {
        id: 'developer',
        name: 'developer',
        emojiKey: 'crown',
        defaultEmoji: '<:gw_crown:1558198883883028621>',
        description: 'harm core developer & bot architect',
        requirement: 'bot developer & owner team',
        check: async (ctx) => ctx.isOwner
    },
    premium: {
        id: 'premium',
        name: 'premium',
        emojiKey: 'premium',
        defaultEmoji: '<:harm_premium:1558810882795114536>',
        description: 'active harm premium membership subscriber',
        requirement: 'hold an active premium tier',
        check: async (ctx) => ctx.profile?.tier === 'premium'
    },
    supporter: {
        id: 'supporter',
        name: 'supporter',
        emojiKey: 'standard',
        defaultEmoji: '<:harm_standard:1558811340385026119>',
        description: 'verified member in the official harm support discord',
        requirement: 'join harm support community',
        check: async (ctx) => ctx.isSupportMember
    },
    early_adopter: {
        id: 'early_adopter',
        name: 'early adopter',
        emojiKey: 'streak',
        defaultEmoji: '<:streak:1558818734582399007>',
        description: 'pioneered harm during genesis (uid <= 100)',
        requirement: 'registered with uid 100 or earlier',
        check: async (ctx) => ctx.profile?.uid && ctx.profile.uid <= 100
    },
    high_roller: {
        id: 'high_roller',
        name: 'high roller',
        emojiKey: 'trophy',
        defaultEmoji: '<:trophy:1558198891248095366>',
        description: 'amassed over $100,000 in total net worth',
        requirement: 'reach $100,000 economy net worth',
        check: async (ctx) => ctx.netWorth >= 100000
    },
    millionaire: {
        id: 'millionaire',
        name: 'millionaire',
        emojiKey: 'coin',
        defaultEmoji: '<:coin:1558818714055479421>',
        description: 'achieved an elite fortune of $1,000,000 or more',
        requirement: 'reach $1,000,000 economy net worth',
        check: async (ctx) => ctx.netWorth >= 1000000
    },
    cardholder: {
        id: 'cardholder',
        name: 'cardholder',
        emojiKey: 'idcard',
        defaultEmoji: '<:idcard:1558818721156567040>',
        description: 'holds an active harm bank debit card',
        requirement: 'open a debit card in the economy bank',
        check: async (ctx) => Boolean(ctx.card?.is_open)
    },
    wedded: {
        id: 'wedded',
        name: 'wedded',
        emojiKey: 'harm_ring',
        defaultEmoji: '<:harm_ring:1560309021078982676>',
        description: 'married to another server member in harm',
        requirement: 'marry someone via the marriage system',
        check: async (ctx) => Boolean(ctx.marriage?.partnerId)
    },
    notable: {
        id: 'notable',
        name: 'notable',
        emojiKey: 'boost',
        defaultEmoji: '<:boost:1558818693629214760>',
        description: 'earned 10 or more community reputation points',
        requirement: 'accumulate 10 reputation points',
        check: async (ctx) => (ctx.profile?.rep || 0) >= 10
    },
    beloved: {
        id: 'beloved',
        name: 'beloved',
        emojiKey: 'harm_heart',
        defaultEmoji: '<:harm_heart:1559895595848695960>',
        description: 'celebrated with 50 or more community reputation points',
        requirement: 'accumulate 50 reputation points',
        check: async (ctx) => (ctx.profile?.rep || 0) >= 50
    },
    conversationalist: {
        id: 'conversationalist',
        name: 'conversationalist',
        emojiKey: 'harm_chat',
        defaultEmoji: '<:harm_chat:1561780895038439606>',
        description: 'active talker with 500+ messages tracked in leveling',
        requirement: 'send 500 messages in servers with leveling',
        check: async (ctx) => (ctx.userLevel?.messages || 0) >= 500
    },
    vocalist: {
        id: 'vocalist',
        name: 'vocalist',
        emojiKey: 'harm_voice',
        defaultEmoji: '<:harm_voice:1561780897198514206>',
        description: 'voice aficionado with 5+ hours spent in voice channels',
        requirement: 'spend 5 hours in voice channels with leveling',
        check: async (ctx) => (ctx.userLevel?.voice_seconds || 0) >= 18000
    },
    curator: {
        id: 'curator',
        name: 'curator',
        emojiKey: 'harm_disc',
        defaultEmoji: '<:harm_disc:1561738406403244033>',
        description: 'music curator with personal saved playlists',
        requirement: 'create at least 1 custom saved playlist',
        check: async (ctx) => (ctx.playlistCount || 0) > 0
    },
    connector: {
        id: 'connector',
        name: 'connector',
        emojiKey: 'harm_pin',
        defaultEmoji: '<:harm_pin:1561780890751729695>',
        description: 'server promoter with 5+ successful member invites',
        requirement: 'refer 5 members to servers via invites',
        check: async (ctx) => (ctx.invites?.joins || 0) >= 5
    },
    artisan: {
        id: 'artisan',
        name: 'artisan',
        emojiKey: 'harm_wand',
        defaultEmoji: '<:harm_wand:1560309018973442169>',
        description: 'designer who crafted custom server embeds',
        requirement: 'create a custom embed with the embed builder',
        check: async (ctx) => Boolean(ctx.hasCreatedEmbed)
    },
    philanthropist: {
        id: 'philanthropist',
        name: 'philanthropist',
        emojiKey: 'gift',
        defaultEmoji: '<:gift:1558198880296898630>',
        description: 'community patron who entered or won giveaways',
        requirement: 'participate in community giveaways',
        check: async (ctx) => Boolean(ctx.hasGiveawayEntry)
    }
};

function getBadgeEmoji(badge) {
    if (!badge) return '';
    const e = config.emojis || {};
    return e[badge.emojiKey] || badge.defaultEmoji;
}

class BadgeHelper {
    static get BADGES() {
        return BADGES;
    }

    static getBadge(badgeId) {
        const b = BADGES[badgeId];
        if (!b) return null;
        return {
            ...b,
            emoji: getBadgeEmoji(b)
        };
    }

    static getAllBadges() {
        return Object.values(BADGES).map(b => ({
            ...b,
            emoji: getBadgeEmoji(b)
        }));
    }

    static async syncAndGetBadges(client, user, guildId = 'global') {
        const db = client.db;
        if (!db || !user || user.bot) {
            return {
                unlocked: [],
                featured: null,
                shelf: '`none`',
                catalog: this.getAllBadges().map(b => ({ ...b, unlocked: false }))
            };
        }

        const isOwner = config.owners?.includes(user.id);
        const profile = await db.getUserProfile(user.id, true);
        const isSupportMember = db.isSupportMember ? await db.isSupportMember(client, user.id) : false;

        const eco = await db.getEconomy(guildId, user.id).catch(() => ({ wallet: 0, bank: 0, vault: 0 }));
        const wallet = eco.wallet || 0;
        const bank = eco.bank || 0;
        const vault = eco.vault || 0;
        const netWorth = wallet + bank + vault;

        const card = await db.getCard(guildId, user.id).catch(() => null);
        const marriage = await db.getMarriage(guildId, user.id).catch(() => null);
        const userLevel = await db.getUserLevel(guildId, user.id).catch(() => ({ messages: 0, voice_seconds: 0 }));
        const invites = await db.getUserInvites(guildId, user.id).catch(() => ({ joins: 0 }));
        const playlists = await db.getUserPlaylists(user.id).catch(() => []);

        // Check if created embed
        let hasCreatedEmbed = false;
        try {
            const embRow = await db.db?.get('SELECT 1 FROM guild_embeds WHERE author_id = ? LIMIT 1', [user.id]);
            hasCreatedEmbed = Boolean(embRow);
        } catch (_) {}

        // Check giveaway participation
        let hasGiveawayEntry = false;
        try {
            const gwRow = await db.db?.get('SELECT 1 FROM giveaway_entries WHERE user_id = ? LIMIT 1', [user.id]);
            hasGiveawayEntry = Boolean(gwRow);
        } catch (_) {}

        const context = {
            isOwner,
            profile,
            isSupportMember,
            netWorth,
            card,
            marriage,
            userLevel,
            invites,
            playlistCount: playlists.length,
            hasCreatedEmbed,
            hasGiveawayEntry
        };

        // Auto-grant qualified dynamic badges
        for (const badge of Object.values(BADGES)) {
            try {
                const qualified = await badge.check(context);
                if (qualified) {
                    await db.grantUserBadge(user.id, badge.id);
                }
            } catch (_) {}
        }

        // Fetch all assigned badges from database (includes manually granted ones)
        const storedRows = await db.getUserBadges(user.id);
        const storedIds = new Set(storedRows.map(r => r.badge_id));

        const unlockedBadges = [];
        for (const row of storedRows) {
            const b = BADGES[row.badge_id];
            if (b) {
                unlockedBadges.push({
                    ...b,
                    emoji: getBadgeEmoji(b),
                    granted_at: row.granted_at
                });
            } else {
                // Custom or legacy badge
                unlockedBadges.push({
                    id: row.badge_id,
                    name: row.badge_id.replace(/_/g, ' '),
                    emoji: config.emojis?.harm || '<:harmsdio:1556221836507742278>',
                    description: 'special distinction badge',
                    requirement: 'granted by harm administration',
                    granted_at: row.granted_at
                });
            }
        }

        // Featured badge
        let featuredBadge = null;
        if (profile?.featured_badge) {
            featuredBadge = unlockedBadges.find(b => b.id === profile.featured_badge) || null;
            if (!featuredBadge && profile.featured_badge) {
                await db.setFeaturedBadge(user.id, null).catch(() => {});
            }
        }

        // If no featured badge manually set, default to highest tier unlocked
        if (!featuredBadge && unlockedBadges.length > 0) {
            featuredBadge = unlockedBadges[0];
        }

        // Build Shelf (custom Discord emojis only)
        let shelf = '`none`';
        if (unlockedBadges.length > 0) {
            shelf = unlockedBadges.map(b => b.emoji).join(' ');
        }

        // Catalog with locked/unlocked status
        const catalog = Object.values(BADGES).map(b => ({
            ...b,
            emoji: getBadgeEmoji(b),
            unlocked: storedIds.has(b.id)
        }));

        return {
            unlocked: unlockedBadges,
            featured: featuredBadge,
            shelf,
            catalog
        };
    }
}

module.exports = BadgeHelper;
