const path = require('path');
const fs = require('fs');
const LevelingHelper = require('./levelinghelper.js');

let DatabaseSync = null;
try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (_) {}

class NodeSqliteAdapter {
    constructor(filePath) {
        this._db = new DatabaseSync(filePath);
        this._stmtCache = new Map();
    }

    _prepare(sql) {
        let stmt = this._stmtCache.get(sql);
        if (!stmt) {
            stmt = this._db.prepare(sql);
            if (this._stmtCache.size < 500) this._stmtCache.set(sql, stmt);
        }
        return stmt;
    }

    _cleanArgs(params) {
        if (params === undefined || params === null) return [];
        const arr = Array.isArray(params) ? params : [params];
        return arr.map(v => (v === undefined ? null : v));
    }

    async run(sql, params) {
        const stmt = this._prepare(sql);
        const args = this._cleanArgs(params);
        const res = stmt.run(...args);
        const lastID = res?.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : (res?.lastID ? Number(res.lastID) : 0);
        return {
            changes: res?.changes || 0,
            lastID,
            lastInsertRowid: res?.lastInsertRowid
        };
    }

    async get(sql, params) {
        const stmt = this._prepare(sql);
        const args = this._cleanArgs(params);
        return stmt.get(...args);
    }

    async all(sql, params) {
        const stmt = this._prepare(sql);
        const args = this._cleanArgs(params);
        return stmt.all(...args);
    }

    async exec(sql) {
        return this._db.exec(sql);
    }
}

class DatabaseManager {
    constructor() {
        this.db = null;
        this.guildSettingsCache = new Map();
        this.blacklistCache = new Set();
        this.blacklistDataCache = new Map();
        this.voicemasterCache = new Map();
        this.afkCache = new Map();
        this.featureTogglesCache = new Map();
        this.autorolesCache = new Map();
        this.onjoinPingsCache = new Map();
        this.onjoinDMCache = new Map();
        this.onjoinWelcomeCache = new Map();
        this.leaveCache = new Map();
        this.guildPremiumCache = new Map();
        this.onjoinPingSettingsCache = new Map();
        this.uwuLocksCache = new Set();
        this.mockLocksCache = new Set();
        this.nerdLocksCache = new Set();
        this.clownLocksCache = new Set();
        this.userProfilesCache = new Set();
        this.levelingSettingsCache = new Map();
        this.invokesCache = new Map();
        this.stickiesCache = new Map();
        this._analyticsQueue = [];
        this._analyticsInterval = null;
    }

    async init() {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const dbFile = path.join(dataDir, 'cases.db');

        if (DatabaseSync) {
            this.db = new NodeSqliteAdapter(dbFile);
        } else {
            const sqlite3 = require('sqlite3');
            const { open } = require('sqlite');
            this.db = await open({
                filename: dbFile,
                driver: sqlite3.Database
            });
        }

        await this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -64000; PRAGMA temp_store = MEMORY; PRAGMA mmap_size = 268435456;');
        await this._init();
        await this._loadGuildSettingsCache();
    }

    async _init() {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS voicemaster_setup (
                guild_id TEXT PRIMARY KEY,
                vc_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                interface_channel_id TEXT,
                interface_msg_id TEXT,
                script TEXT,
                waiting_room_id TEXT,
                thread_count INTEGER DEFAULT 0,
                counter_channel_id TEXT
            );

            CREATE TABLE IF NOT EXISTS voicemaster_j2c (
                guild_id TEXT NOT NULL,
                vc_id TEXT PRIMARY KEY,
                category_id TEXT,
                name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS voicemaster_active (
                channel_id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                text_channel_id TEXT
            );

            CREATE TABLE IF NOT EXISTS voicemaster_default_names (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS voicemaster_default_limits (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_limit INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS voicemaster_bans (
                guild_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                banned_user_id TEXT NOT NULL,
                PRIMARY KEY (guild_id, owner_id, banned_user_id)
            );

            CREATE TABLE IF NOT EXISTS command_analytics (
                command_name TEXT NOT NULL,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY,
                prefix TEXT,
                mod_log_channel_id TEXT,
                disabled_categories TEXT,
                disabled_commands TEXT
            );

            CREATE TABLE IF NOT EXISTS afk (
                user_id TEXT PRIMARY KEY,
                guild_id TEXT,
                reason TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS guild_feature_toggles (
                guild_id TEXT NOT NULL,
                feature TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                PRIMARY KEY (guild_id, feature)
            );

            CREATE TABLE IF NOT EXISTS user_economy (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                wallet INTEGER DEFAULT 1000,
                bank INTEGER DEFAULT 0,
                last_daily INTEGER DEFAULT 0,
                last_weekly INTEGER DEFAULT 0,
                last_monthly INTEGER DEFAULT 0,
                streak INTEGER DEFAULT 0,
                vault INTEGER DEFAULT 0,
                bank_capacity INTEGER DEFAULT 25000,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS economy_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_cards (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                card_number TEXT NOT NULL,
                cvv TEXT NOT NULL,
                is_open INTEGER DEFAULT 1,
                is_locked INTEGER DEFAULT 0,
                opened_at INTEGER NOT NULL,
                unlocked_at INTEGER NOT NULL,
                tier TEXT DEFAULT 'standard',
                bank_capacity INTEGER DEFAULT 25000,
                earned_all_time INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_work (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                career TEXT DEFAULT 'engineer',
                level INTEGER DEFAULT 1,
                exp INTEGER DEFAULT 0,
                shifts_completed INTEGER DEFAULT 0,
                total_earned INTEGER DEFAULT 0,
                last_work INTEGER DEFAULT 0,
                work_streak INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_inventory (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                amount INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS economy_bounties (
                guild_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                setter_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, target_id)
            );

            CREATE TABLE IF NOT EXISTS economy_lottery (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                tickets INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS economy_cooldowns (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id, command)
            );

            CREATE TABLE IF NOT EXISTS economy_active_items (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id, item_id)
            );

            CREATE TABLE IF NOT EXISTS user_pets (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                pet_type TEXT NOT NULL,
                pet_name TEXT NOT NULL,
                level INTEGER DEFAULT 1,
                xp INTEGER DEFAULT 0,
                hunger INTEGER DEFAULT 100,
                hygiene INTEGER DEFAULT 100,
                energy INTEGER DEFAULT 100,
                loyalty INTEGER DEFAULT 100,
                last_fed INTEGER DEFAULT 0,
                last_washed INTEGER DEFAULT 0,
                last_played INTEGER DEFAULT 0,
                last_trained INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_marriages (
                guild_id TEXT NOT NULL,
                user1_id TEXT NOT NULL,
                user2_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                level INTEGER DEFAULT 1,
                love_exp INTEGER DEFAULT 0,
                last_love INTEGER DEFAULT 0,
                ring TEXT DEFAULT 'silver ring',
                PRIMARY KEY (guild_id, user1_id)
            );

            CREATE TABLE IF NOT EXISTS user_invites (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                joins INTEGER DEFAULT 0,
                leaves INTEGER DEFAULT 0,
                fakes INTEGER DEFAULT 0,
                bonus INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS member_invites (
                guild_id TEXT NOT NULL,
                member_id TEXT NOT NULL,
                inviter_id TEXT NOT NULL,
                code TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, member_id)
            );

            CREATE TABLE IF NOT EXISTS giveaways (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT UNIQUE NOT NULL,
                channel_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                host_id TEXT NOT NULL,
                prize TEXT NOT NULL,
                winners_count INTEGER DEFAULT 1,
                ends_at INTEGER NOT NULL,
                ended INTEGER DEFAULT 0,
                cancelled INTEGER DEFAULT 0,
                image_url TEXT,
                requirement TEXT,
                winners TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS giveaway_entries (
                giveaway_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                entered_at INTEGER NOT NULL,
                PRIMARY KEY (giveaway_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS bot_blacklist (
                user_id TEXT PRIMARY KEY,
                reason TEXT,
                blacklisted_by TEXT,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS guild_movement (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                type TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS free_command_uses (
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                uses INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, command)
            );

            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                uid INTEGER UNIQUE,
                tier TEXT DEFAULT 'standard',
                premium_since INTEGER,
                premium_expires INTEGER
            );

            CREATE TABLE IF NOT EXISTS user_playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, name)
            );

            CREATE TABLE IF NOT EXISTS user_playlist_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                duration INTEGER DEFAULT 0,
                author TEXT DEFAULT 'unknown',
                added_at INTEGER NOT NULL,
                FOREIGN KEY (playlist_id) REFERENCES user_playlists(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_badges (
                user_id TEXT NOT NULL,
                badge_id TEXT NOT NULL,
                granted_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, badge_id)
            );

            CREATE TABLE IF NOT EXISTS guild_autoroles (
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                target_type TEXT DEFAULT 'humans',
                PRIMARY KEY (guild_id, role_id)
            );

            CREATE TABLE IF NOT EXISTS guild_embeds (
                guild_id TEXT NOT NULL,
                name TEXT NOT NULL,
                data TEXT NOT NULL,
                author_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, name)
            );

            CREATE TABLE IF NOT EXISTS moderation_cases (
                case_id INTEGER NOT NULL,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_tag TEXT,
                moderator_id TEXT NOT NULL,
                moderator_tag TEXT,
                action TEXT NOT NULL,
                reason TEXT,
                duration INTEGER DEFAULT 0,
                active INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, case_id)
            );

            CREATE TABLE IF NOT EXISTS jailed_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                roles TEXT NOT NULL,
                jailed_at INTEGER NOT NULL,
                reason TEXT,
                moderator_id TEXT,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS guild_jail_config (
                guild_id TEXT PRIMARY KEY,
                role_id TEXT,
                channel_id TEXT
            );

            CREATE TABLE IF NOT EXISTS guild_staff_roles (
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                PRIMARY KEY (guild_id, role_id)
            );

            CREATE TABLE IF NOT EXISTS guild_hardbans (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_forcenicks (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                nickname TEXT NOT NULL,
                set_by TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS guild_active_mutes (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                reason TEXT,
                moderator_id TEXT,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS blinded_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                roles TEXT NOT NULL,
                reason TEXT,
                moderator_id TEXT,
                blinded_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_uwulocks (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                locked_by TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_mocklocks (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                locked_by TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_nerdlocks (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                locked_by TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_clownlocks (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                locked_by TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS caged_users (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                roles TEXT NOT NULL,
                locked_by TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS guild_cage_config (
                guild_id TEXT PRIMARY KEY,
                role_id TEXT,
                channel_id TEXT
            );

            CREATE TABLE IF NOT EXISTS user_support_perks (
                user_id TEXT PRIMARY KEY,
                join_bonus_claimed INTEGER DEFAULT 0,
                join_bonus_timestamp INTEGER
            );

            CREATE TABLE IF NOT EXISTS user_daily_command_uses (
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                last_daily_date TEXT NOT NULL,
                PRIMARY KEY (user_id, command)
            );

            CREATE TABLE IF NOT EXISTS user_command_quotas (
                user_id TEXT NOT NULL,
                command TEXT NOT NULL,
                quota INTEGER NOT NULL,
                last_replenish_date TEXT NOT NULL,
                PRIMARY KEY (user_id, command)
            );

            CREATE TABLE IF NOT EXISTS guild_onjoin_pings (
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                delete_after INTEGER,
                PRIMARY KEY (guild_id, channel_id)
            );

            CREATE TABLE IF NOT EXISTS guild_onjoin_dm (
                guild_id TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 0,
                message TEXT,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS guild_onjoin_welcome (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT,
                enabled INTEGER DEFAULT 0,
                message TEXT,
                autodelete INTEGER DEFAULT 0,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS guild_leave (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT,
                enabled INTEGER DEFAULT 0,
                message TEXT,
                autodelete INTEGER DEFAULT 0,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS guild_premium (
                guild_id TEXT PRIMARY KEY,
                tier TEXT DEFAULT 'premium',
                premium_since INTEGER,
                premium_expires INTEGER,
                granted_by TEXT,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS guild_onjoin_ping_settings (
                guild_id TEXT PRIMARY KEY,
                dm_enabled INTEGER DEFAULT 1,
                dm_message TEXT,
                channel_text TEXT,
                updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS guild_invokes (
                guild_id TEXT NOT NULL,
                action TEXT NOT NULL,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (guild_id, action, type)
            );

            CREATE TABLE IF NOT EXISTS user_levels (
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                messages INTEGER DEFAULT 0,
                voice_seconds INTEGER DEFAULT 0,
                last_xp_at INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS leveling_settings (
                guild_id TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 1,
                channel_id TEXT DEFAULT NULL,
                multiplier REAL DEFAULT 1.0,
                ignored_channels TEXT DEFAULT '[]',
                ignored_roles TEXT DEFAULT '[]',
                stack_roles INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS level_rewards (
                guild_id TEXT NOT NULL,
                level INTEGER NOT NULL,
                role_id TEXT NOT NULL,
                PRIMARY KEY (guild_id, level, role_id)
            );

            CREATE TABLE IF NOT EXISTS music_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                author TEXT,
                duration INTEGER,
                requester_id TEXT,
                played_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS guild_counters (
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL PRIMARY KEY,
                counter_type TEXT NOT NULL,
                channel_name_format TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS guild_stickies (
                guild_id TEXT NOT NULL,
                channel_id TEXT NOT NULL PRIMARY KEY,
                content TEXT NOT NULL,
                last_message_id TEXT,
                created_by TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                guild_id TEXT,
                message_id TEXT,
                reason TEXT NOT NULL,
                trigger_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cmd_analytics ON command_analytics (command_name, timestamp);
            CREATE INDEX IF NOT EXISTS idx_cmd_analytics_user ON command_analytics (user_id);
            CREATE INDEX IF NOT EXISTS idx_user_invites_guild ON user_invites (guild_id);
            CREATE INDEX IF NOT EXISTS idx_member_invites_inviter ON member_invites (guild_id, inviter_id);
            CREATE INDEX IF NOT EXISTS idx_guild_movement ON guild_movement (guild_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_user ON moderation_cases (guild_id, user_id);
            CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_action ON moderation_cases (guild_id, action);
            CREATE INDEX IF NOT EXISTS idx_user_levels_guild_xp ON user_levels (guild_id, xp DESC);
            CREATE INDEX IF NOT EXISTS idx_level_rewards_guild ON level_rewards (guild_id, level ASC);
            CREATE INDEX IF NOT EXISTS idx_music_history_guild ON music_history (guild_id, played_at DESC);
            CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways (guild_id, ended);
            CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user ON giveaway_entries (user_id);
            CREATE INDEX IF NOT EXISTS idx_econ_tx_guild_user ON economy_transactions (guild_id, user_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_user_marriages_guild ON user_marriages (guild_id, user1_id, user2_id);
            CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders (trigger_at ASC);
            CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id);
            CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges (user_id);
        `);

        try { await this.db.run('ALTER TABLE voicemaster_setup ADD COLUMN counter_channel_id TEXT'); } catch (_) {}
        try { await this.db.run('ALTER TABLE voicemaster_setup ADD COLUMN thread_count INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE giveaways ADD COLUMN winners TEXT'); } catch (_) {}
        try { await this.db.run('ALTER TABLE giveaways ADD COLUMN image_url TEXT'); } catch (_) {}
        try { await this.db.run('ALTER TABLE giveaways ADD COLUMN requirement TEXT'); } catch (_) {}
        try { await this.db.run('ALTER TABLE giveaways ADD COLUMN cancelled INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_economy ADD COLUMN last_weekly INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_economy ADD COLUMN last_monthly INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_economy ADD COLUMN vault INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_economy ADD COLUMN bank_capacity INTEGER DEFAULT 25000'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_economy ADD COLUMN streak_freezes INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_economy ADD COLUMN prestige INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_cards ADD COLUMN tier TEXT DEFAULT \'standard\''); } catch (_) {}
        try { await this.db.run('ALTER TABLE guild_onjoin_welcome ADD COLUMN autodelete INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_cards ADD COLUMN bank_capacity INTEGER DEFAULT 25000'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_cards ADD COLUMN earned_all_time INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_cards ADD COLUMN unlocked_at INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_cards ADD COLUMN opened_at INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_profiles ADD COLUMN bio TEXT DEFAULT NULL'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_profiles ADD COLUMN rep INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_profiles ADD COLUMN featured_badge TEXT DEFAULT NULL'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_work ADD COLUMN overtime_last INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_work ADD COLUMN strikes INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_work ADD COLUMN stars INTEGER DEFAULT 5'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_marriages ADD COLUMN love_exp INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run('ALTER TABLE user_marriages ADD COLUMN last_love INTEGER DEFAULT 0'); } catch (_) {}
        try { await this.db.run("ALTER TABLE user_marriages ADD COLUMN ring TEXT DEFAULT 'silver ring'"); } catch (_) {}

        // Backfill user_profiles for all users with past activity
        try {
            await this.db.run(`
                INSERT OR IGNORE INTO user_profiles (user_id, uid, tier)
                SELECT DISTINCT user_id, NULL, 'standard' FROM (
                    SELECT user_id FROM user_economy
                    UNION SELECT user_id FROM user_work
                    UNION SELECT user_id FROM user_levels
                    UNION SELECT user_id FROM command_analytics
                    UNION SELECT user_id FROM economy_transactions
                    UNION SELECT user_id FROM user_inventory
                    UNION SELECT user_id FROM giveaway_entries
                    UNION SELECT user_id FROM user_invites
                    UNION SELECT user_id FROM user_cards
                    UNION SELECT user_id FROM user_pets
                    UNION SELECT user1_id AS user_id FROM user_marriages
                    UNION SELECT user2_id AS user_id FROM user_marriages
                ) WHERE user_id IS NOT NULL AND user_id != '';
            `);

            const unassigned = await this.db.all('SELECT user_id FROM user_profiles WHERE uid IS NULL');
            if (unassigned && unassigned.length > 0) {
                const maxRow = await this.db.get('SELECT MAX(uid) AS max_uid FROM user_profiles WHERE uid IS NOT NULL');
                let nextUid = (maxRow?.max_uid !== null && maxRow?.max_uid !== undefined) ? Number(maxRow.max_uid) + 1 : 1;
                for (const u of unassigned) {
                    await this.db.run('UPDATE user_profiles SET uid = ? WHERE user_id = ?', [nextUid++, u.user_id]);
                }
            }
        } catch (_) {}
    }

    // Direct SQLite delegates
    async run(...args) {
        if (!this.db) return null;
        return this.db.run(...args);
    }

    async all(...args) {
        if (!this.db) return [];
        return this.db.all(...args);
    }

    async get(...args) {
        if (!this.db) return null;
        return this.db.get(...args);
    }

    async exec(...args) {
        if (!this.db) return null;
        return this.db.exec(...args);
    }

    // --- Analytics (Asynchronous Batched Writes) ---
    trackCommand(commandName, userId, guildId) {
        if (!this.db) return Promise.resolve();
        this._analyticsQueue.push([commandName, userId, guildId, Math.floor(Date.now() / 1000)]);
        if (this._analyticsQueue.length >= 25) {
            this.flushAnalytics().catch(() => {});
        }
        return Promise.resolve();
    }

    async flushAnalytics() {
        if (!this.db || !this._analyticsQueue.length) return;
        const batch = this._analyticsQueue.splice(0, this._analyticsQueue.length);
        try {
            await this.db.exec('BEGIN TRANSACTION;');
            for (const [cmd, u, g, t] of batch) {
                await this.db.run(
                    'INSERT INTO command_analytics (command_name, user_id, guild_id, timestamp) VALUES (?, ?, ?, ?)',
                    [cmd, u, g, t]
                ).catch(() => {});
            }
            await this.db.exec('COMMIT;');
        } catch (_) {
            try { await this.db.exec('ROLLBACK;'); } catch (__) {}
        }
    }

    // --- Guild Settings & Prefix ---
    async _loadGuildSettingsCache() {
        const rows = await this.db.all('SELECT * FROM guild_settings') || [];
        for (const row of rows) {
            this.guildSettingsCache.set(row.guild_id, {
                prefix: row.prefix || null,
                modLogChannelId: row.mod_log_channel_id || null,
                disabledCategories: row.disabled_categories ? JSON.parse(row.disabled_categories) : [],
                disabledCommands: row.disabled_commands ? JSON.parse(row.disabled_commands) : []
            });
        }

        const blRows = await this.db.all('SELECT * FROM bot_blacklist') || [];
        for (const bl of blRows) {
            this.blacklistCache.add(bl.user_id);
            this.blacklistDataCache.set(bl.user_id, bl);
        }

        const vmRows = await this.db.all('SELECT * FROM voicemaster_setup') || [];
        for (const row of vmRows) {
            this.voicemasterCache.set(row.guild_id, row);
        }

        const afkRows = await this.db.all('SELECT * FROM afk') || [];
        for (const row of afkRows) {
            const data = {
                userId: row.user_id,
                guildId: row.guild_id,
                reason: row.reason,
                timestamp: row.timestamp
            };
            if (row.guild_id) {
                this.afkCache.set(`${row.user_id}:${row.guild_id}`, data);
            }
            this.afkCache.set(row.user_id, data);
        }

        const toggleRows = await this.db.all('SELECT * FROM guild_feature_toggles') || [];
        for (const row of toggleRows) {
            this.featureTogglesCache.set(`${row.guild_id}:${row.feature}`, Boolean(row.enabled));
        }

        const autoroleRows = await this.db.all('SELECT * FROM guild_autoroles') || [];
        for (const row of autoroleRows) {
            if (!this.autorolesCache.has(row.guild_id)) {
                this.autorolesCache.set(row.guild_id, []);
            }
            this.autorolesCache.get(row.guild_id).push({
                roleId: row.role_id,
                targetType: row.target_type || 'humans'
            });
        }

        const pingRows = await this.db.all('SELECT * FROM guild_onjoin_pings') || [];
        for (const row of pingRows) {
            if (!this.onjoinPingsCache.has(row.guild_id)) {
                this.onjoinPingsCache.set(row.guild_id, new Map());
            }
            this.onjoinPingsCache.get(row.guild_id).set(row.channel_id, row.delete_after);
        }

        const dmRows = await this.db.all('SELECT * FROM guild_onjoin_dm') || [];
        for (const row of dmRows) {
            this.onjoinDMCache.set(row.guild_id, {
                enabled: Boolean(row.enabled),
                message: row.message
            });
        }

        const welcomeRows = await this.db.all('SELECT * FROM guild_onjoin_welcome') || [];
        for (const row of welcomeRows) {
            this.onjoinWelcomeCache.set(row.guild_id, {
                channel_id: row.channel_id,
                enabled: Boolean(row.enabled),
                message: row.message,
                autodelete: row.autodelete || 0
            });
        }

        const leaveRows = await this.db.all('SELECT * FROM guild_leave').catch(() => []) || [];
        for (const row of leaveRows) {
            this.leaveCache.set(row.guild_id, {
                channel_id: row.channel_id,
                enabled: Boolean(row.enabled),
                message: row.message,
                autodelete: row.autodelete || 0
            });
        }

        const pingSettingRows = await this.db.all('SELECT * FROM guild_onjoin_ping_settings') || [];
        for (const row of pingSettingRows) {
            this.onjoinPingSettingsCache.set(row.guild_id, {
                dm_enabled: Boolean(row.dm_enabled),
                dm_message: row.dm_message,
                channel_text: row.channel_text
            });
        }

        const guildPremiumRows = await this.db.all('SELECT * FROM guild_premium').catch(() => []) || [];
        for (const row of guildPremiumRows) {
            this.guildPremiumCache.set(row.guild_id, row);
        }

        const [uwuRows, mockRows, nerdRows, clownRows, profileRows] = await Promise.all([
            this.db.all('SELECT guild_id, user_id FROM user_uwulocks').catch(() => []),
            this.db.all('SELECT guild_id, user_id FROM user_mocklocks').catch(() => []),
            this.db.all('SELECT guild_id, user_id FROM user_nerdlocks').catch(() => []),
            this.db.all('SELECT guild_id, user_id FROM user_clownlocks').catch(() => []),
            this.db.all('SELECT user_id FROM user_profiles').catch(() => [])
        ]);

        for (const r of uwuRows || []) this.uwuLocksCache.add(`${r.guild_id}:${r.user_id}`);
        for (const r of mockRows || []) this.mockLocksCache.add(`${r.guild_id}:${r.user_id}`);
        for (const r of nerdRows || []) this.nerdLocksCache.add(`${r.guild_id}:${r.user_id}`);
        for (const r of clownRows || []) this.clownLocksCache.add(`${r.guild_id}:${r.user_id}`);
        for (const r of profileRows || []) this.userProfilesCache.add(r.user_id);

        const stickyRows = await this.db.all('SELECT channel_id, guild_id, content, last_message_id FROM guild_stickies').catch(() => []);
        for (const s of stickyRows || []) {
            this.stickiesCache.set(s.channel_id, s);
        }

        const invokeRows = await this.db.all('SELECT guild_id, action, type, content FROM guild_invokes').catch(() => []);
        for (const r of invokeRows || []) {
            if (!this.invokesCache.has(r.guild_id)) {
                this.invokesCache.set(r.guild_id, new Map());
            }
            this.invokesCache.get(r.guild_id).set(`${r.action.toLowerCase()}:${r.type.toLowerCase()}`, r.content);
        }

        if (!this._analyticsInterval) {
            this._analyticsInterval = setInterval(() => this.flushAnalytics(), 5000);
            this._analyticsInterval.unref?.();
        }
    }

    // --- Feature Toggles ---
    isFeatureEnabled(guildId, feature, defaultValue = true) {
        if (!guildId || !feature) return defaultValue;
        const key = `${guildId}:${feature}`;
        if (this.featureTogglesCache.has(key)) {
            return this.featureTogglesCache.get(key);
        }
        return defaultValue;
    }

    async setFeatureEnabled(guildId, feature, enabled) {
        if (!guildId || !feature) return;
        const key = `${guildId}:${feature}`;
        const val = enabled ? 1 : 0;
        this.featureTogglesCache.set(key, Boolean(val));
        if (!this.db) return;
        await this.db.run(
            'INSERT OR REPLACE INTO guild_feature_toggles (guild_id, feature, enabled) VALUES (?, ?, ?)',
            [guildId, feature, val]
        );
    }

    isNukeEnabled(guildId) {
        return this.isFeatureEnabled(guildId, 'nuke', false);
    }

    async setNukeEnabled(guildId, enabled) {
        return await this.setFeatureEnabled(guildId, 'nuke', enabled);
    }

    isSnipeEnabled(guildId) {
        return this.isAddonEnabled(guildId, 'snipe');
    }

    async setSnipeEnabled(guildId, enabled) {
        return await this.setAddonState(guildId, 'snipe', enabled);
    }

    // --- Modular Addons Subsystem ---
    isAddonEnabled(guildId, addonName) {
        if (!guildId || !addonName) return false;
        const canonical = addonName.toLowerCase();
        const key = `${guildId}:addon:${canonical}`;
        if (this.featureTogglesCache.has(key)) {
            return Boolean(this.featureTogglesCache.get(key));
        }
        // If voicemaster setup already exists, default to true unless explicitly disabled
        if (canonical === 'voicemaster') {
            const vm = this.voiceMasterSetupCache?.get(guildId);
            if (vm && vm.vc_id) return true;
        }
        // All modular addons are disabled by default until explicitly enabled by a server administrator
        const defaultState = false;
        return this.isFeatureEnabled(guildId, `addon:${canonical}`, defaultState);
    }

    async setAddonState(guildId, addonName, enabled) {
        if (!guildId || !addonName) return false;
        const canonical = addonName.toLowerCase();
        await this.setFeatureEnabled(guildId, `addon:${canonical}`, enabled);
        return true;
    }

    getGuildAddons(guildId) {
        const list = ['voicemaster', 'economy', 'giveaway', 'snipe', 'jailbreak'];
        const result = {};
        for (const item of list) {
            result[item] = this.isAddonEnabled(guildId, item);
        }
        return result;
    }

    async resetGuildAddons(guildId) {
        const list = ['voicemaster', 'economy', 'giveaway', 'snipe', 'jailbreak'];
        for (const item of list) {
            const key = `${guildId}:addon:${item}`;
            this.featureTogglesCache.delete(key);
            if (this.db) {
                await this.db.run(
                    'DELETE FROM guild_feature_toggles WHERE guild_id = ? AND feature = ?',
                    [guildId, `addon:${item}`]
                ).catch(() => {});
            }
        }
        return true;
    }

    isJailbreakEnabled(guildId) {
        return this.isAddonEnabled(guildId, 'jailbreak');
    }

    async setJailbreakEnabled(guildId, enabled) {
        return await this.setAddonState(guildId, 'jailbreak', enabled);
    }

    // --- Autorole System ---
    getAutoroles(guildId) {
        if (!guildId) return [];
        return this.autorolesCache.get(guildId) || [];
    }

    async addAutorole(guildId, roleId, targetType = 'humans') {
        if (!guildId || !roleId) return;
        const current = this.getAutoroles(guildId);
        const filtered = current.filter(r => r.roleId !== roleId);
        filtered.push({ roleId, targetType });
        this.autorolesCache.set(guildId, filtered);
        if (!this.db) return;
        await this.db.run(
            'INSERT OR REPLACE INTO guild_autoroles (guild_id, role_id, target_type) VALUES (?, ?, ?)',
            [guildId, roleId, targetType]
        );
    }

    async removeAutorole(guildId, roleId) {
        if (!guildId || !roleId) return false;
        const current = this.getAutoroles(guildId);
        const exists = current.some(r => r.roleId === roleId);
        if (!exists) return false;
        const filtered = current.filter(r => r.roleId !== roleId);
        this.autorolesCache.set(guildId, filtered);
        if (!this.db) return true;
        await this.db.run(
            'DELETE FROM guild_autoroles WHERE guild_id = ? AND role_id = ?',
            [guildId, roleId]
        );
        return true;
    }

    async clearAutoroles(guildId) {
        if (!guildId) return;
        this.autorolesCache.delete(guildId);
        if (!this.db) return;
        await this.db.run('DELETE FROM guild_autoroles WHERE guild_id = ?', [guildId]);
    }

    // --- On-Join Automation System ---
    getOnjoinPings(guildId) {
        if (!guildId) return [];
        const map = this.onjoinPingsCache.get(guildId);
        if (!map) return [];
        const result = [];
        for (const [channelId, deleteAfter] of map) {
            result.push({ channel_id: channelId, delete_after: deleteAfter });
        }
        return result;
    }

    async addOnjoinPing(guildId, channelId, deleteAfter = 0) {
        if (!guildId || !channelId) return;
        if (!this.onjoinPingsCache.has(guildId)) {
            this.onjoinPingsCache.set(guildId, new Map());
        }
        this.onjoinPingsCache.get(guildId).set(channelId, deleteAfter);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_onjoin_pings (guild_id, channel_id, delete_after) VALUES (?, ?, ?)',
                [guildId, channelId, deleteAfter]
            );
        }
    }

    async removeOnjoinPing(guildId, channelId) {
        if (!guildId || !channelId) return false;
        const map = this.onjoinPingsCache.get(guildId);
        if (!map || !map.has(channelId)) return false;
        map.delete(channelId);

        if (this.db) {
            await this.db.run(
                'DELETE FROM guild_onjoin_pings WHERE guild_id = ? AND channel_id = ?',
                [guildId, channelId]
            );
        }
        return true;
    }

    async clearOnjoinPings(guildId) {
        if (!guildId) return;
        this.onjoinPingsCache.delete(guildId);
        if (this.db) {
            await this.db.run('DELETE FROM guild_onjoin_pings WHERE guild_id = ?', [guildId]);
        }
    }

    getOnjoinDM(guildId) {
        if (!guildId) return { enabled: false, message: null };
        return this.onjoinDMCache.get(guildId) || { enabled: false, message: null };
    }

    async setOnjoinDM(guildId, message, enabled = 1) {
        if (!guildId) return;
        const current = this.getOnjoinDM(guildId);
        const newState = {
            enabled: enabled !== undefined ? Boolean(enabled) : current.enabled,
            message: message !== undefined ? message : current.message
        };
        this.onjoinDMCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_onjoin_dm (guild_id, enabled, message, updated_at) VALUES (?, ?, ?, ?)',
                [guildId, newState.enabled ? 1 : 0, newState.message, Date.now()]
            );
        }
    }

    async toggleOnjoinDM(guildId) {
        if (!guildId) return false;
        const current = this.getOnjoinDM(guildId);
        const nextEnabled = !current.enabled;
        const newState = {
            enabled: nextEnabled,
            message: current.message
        };
        this.onjoinDMCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_onjoin_dm (guild_id, enabled, message, updated_at) VALUES (?, ?, ?, ?)',
                [guildId, nextEnabled ? 1 : 0, current.message, Date.now()]
            );
        }
        return nextEnabled;
    }

    getOnjoinWelcome(guildId) {
        if (!guildId) return { channel_id: null, enabled: false, message: null, autodelete: 0 };
        return this.onjoinWelcomeCache.get(guildId) || { channel_id: null, enabled: false, message: null, autodelete: 0 };
    }

    async setOnjoinWelcome(guildId, channelId, message, enabled = 1, autodelete = 0) {
        if (!guildId) return;
        const current = this.getOnjoinWelcome(guildId);
        const newState = {
            channel_id: channelId !== undefined ? channelId : current.channel_id,
            enabled: enabled !== undefined ? Boolean(enabled) : current.enabled,
            message: message !== undefined ? message : current.message,
            autodelete: autodelete !== undefined ? parseInt(autodelete, 10) || 0 : (current.autodelete || 0)
        };
        this.onjoinWelcomeCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_onjoin_welcome (guild_id, channel_id, enabled, message, autodelete, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [guildId, newState.channel_id, newState.enabled ? 1 : 0, newState.message, newState.autodelete, Date.now()]
            );
        }
    }

    async toggleOnjoinWelcome(guildId) {
        if (!guildId) return false;
        const current = this.getOnjoinWelcome(guildId);
        const nextEnabled = !current.enabled;
        const newState = {
            channel_id: current.channel_id,
            enabled: nextEnabled,
            message: current.message,
            autodelete: current.autodelete || 0
        };
        this.onjoinWelcomeCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_onjoin_welcome (guild_id, channel_id, enabled, message, autodelete, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [guildId, current.channel_id, nextEnabled ? 1 : 0, current.message, current.autodelete || 0, Date.now()]
            );
        }
        return nextEnabled;
    }

    async clearOnjoinWelcome(guildId) {
        if (!guildId) return;
        this.onjoinWelcomeCache.delete(guildId);
        if (this.db) {
            await this.db.run('DELETE FROM guild_onjoin_welcome WHERE guild_id = ?', [guildId]);
        }
    }

    // --- Leave / Goodbye Message System ---
    getLeaveConfig(guildId) {
        if (!guildId) return { channel_id: null, enabled: false, message: null, autodelete: 0 };
        return this.leaveCache.get(guildId) || { channel_id: null, enabled: false, message: null, autodelete: 0 };
    }

    async setLeaveConfig(guildId, channelId, message, enabled = 1, autodelete = 0) {
        if (!guildId) return;
        const current = this.getLeaveConfig(guildId);
        const newState = {
            channel_id: channelId !== undefined ? channelId : current.channel_id,
            enabled: enabled !== undefined ? Boolean(enabled) : current.enabled,
            message: message !== undefined ? message : current.message,
            autodelete: autodelete !== undefined ? parseInt(autodelete, 10) || 0 : (current.autodelete || 0)
        };
        this.leaveCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_leave (guild_id, channel_id, enabled, message, autodelete, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [guildId, newState.channel_id, newState.enabled ? 1 : 0, newState.message, newState.autodelete, Date.now()]
            );
        }
    }

    async toggleLeave(guildId) {
        if (!guildId) return false;
        const current = this.getLeaveConfig(guildId);
        const nextEnabled = !current.enabled;
        const newState = {
            channel_id: current.channel_id,
            enabled: nextEnabled,
            message: current.message,
            autodelete: current.autodelete || 0
        };
        this.leaveCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_leave (guild_id, channel_id, enabled, message, autodelete, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [guildId, current.channel_id, nextEnabled ? 1 : 0, current.message, current.autodelete || 0, Date.now()]
            );
        }
        return nextEnabled;
    }

    async clearLeaveConfig(guildId) {
        if (!guildId) return;
        this.leaveCache.delete(guildId);
        if (this.db) {
            await this.db.run('DELETE FROM guild_leave WHERE guild_id = ?', [guildId]);
        }
    }

    getOnjoinPingSettings(guildId) {
        if (!guildId) return { dm_enabled: true, dm_message: null, channel_text: null };
        const cached = this.onjoinPingSettingsCache.get(guildId);
        if (cached) return cached;
        return { dm_enabled: true, dm_message: null, channel_text: null };
    }

    async setOnjoinPingSettings(guildId, settings = {}) {
        if (!guildId) return;
        const current = this.getOnjoinPingSettings(guildId);
        const newState = {
            dm_enabled: settings.dm_enabled !== undefined ? Boolean(settings.dm_enabled) : current.dm_enabled,
            dm_message: settings.dm_message !== undefined ? settings.dm_message : current.dm_message,
            channel_text: settings.channel_text !== undefined ? settings.channel_text : current.channel_text
        };
        this.onjoinPingSettingsCache.set(guildId, newState);

        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_onjoin_ping_settings (guild_id, dm_enabled, dm_message, channel_text, updated_at) VALUES (?, ?, ?, ?, ?)',
                [guildId, newState.dm_enabled ? 1 : 0, newState.dm_message, newState.channel_text, Date.now()]
            );
        }
    }

    async toggleOnjoinPingDM(guildId) {
        if (!guildId) return false;
        const current = this.getOnjoinPingSettings(guildId);
        const nextState = !current.dm_enabled;
        await this.setOnjoinPingSettings(guildId, { dm_enabled: nextState });
        return nextState;
    }

    // --- AFK System ---
    async setAfk(userId, reason, guildId = null) {
        if (!this.db || !userId) return;
        const now = Date.now();
        const safeReason = (reason && String(reason).trim()) ? String(reason).trim().slice(0, 100) : 'afk';
        await this.db.run(
            'INSERT OR REPLACE INTO afk (user_id, guild_id, reason, timestamp) VALUES (?, ?, ?, ?)',
            [userId, guildId || null, safeReason, now]
        );
        const data = { userId, guildId: guildId || null, reason: safeReason, timestamp: now };
        if (guildId) this.afkCache.set(`${userId}:${guildId}`, data);
        this.afkCache.set(userId, data);
    }

    getAfk(userId, guildId = null) {
        if (!userId) return null;
        if (guildId && this.afkCache.has(`${userId}:${guildId}`)) {
            return this.afkCache.get(`${userId}:${guildId}`);
        }
        const entry = this.afkCache.get(userId);
        if (entry) {
            if (guildId && entry.guildId && entry.guildId !== guildId) {
                return null;
            }
            return entry;
        }
        return null;
    }

    async removeAfk(userId, guildId = null) {
        if (!this.db || !userId) return;
        if (guildId) this.afkCache.delete(`${userId}:${guildId}`);
        this.afkCache.delete(userId);
        for (const key of this.afkCache.keys()) {
            if (typeof key === 'string' && key.startsWith(`${userId}:`)) {
                this.afkCache.delete(key);
            }
        }
        await this.db.run('DELETE FROM afk WHERE user_id = ?', [userId]);
    }

    // --- Blacklist System ---
    isBlacklisted(userId) {
        return this.blacklistCache.has(userId);
    }

    getBlacklistEntry(userId) {
        return this.blacklistDataCache.get(userId) || null;
    }

    async addBlacklist(userId, reason, blacklistedBy) {
        this.blacklistCache.add(userId);
        const data = { user_id: userId, reason, blacklisted_by: blacklistedBy, timestamp: Math.floor(Date.now() / 1000) };
        this.blacklistDataCache.set(userId, data);
        if (!this.db) return;
        await this.db.run(
            'INSERT OR REPLACE INTO bot_blacklist (user_id, reason, blacklisted_by, timestamp) VALUES (?, ?, ?, ?)',
            [userId, reason, blacklistedBy, data.timestamp]
        );
    }

    async removeBlacklist(userId) {
        this.blacklistCache.delete(userId);
        this.blacklistDataCache.delete(userId);
        if (!this.db) return;
        await this.db.run('DELETE FROM bot_blacklist WHERE user_id = ?', [userId]);
    }

    async getBlacklist() {
        if (!this.db) return [];
        return await this.db.all('SELECT * FROM bot_blacklist ORDER BY timestamp DESC') || [];
    }

    // --- Guild Settings & Prefix ---
    getGuildSettings(guildId) {
        return this.guildSettingsCache.get(guildId) || null;
    }

    getGuildPrefix(guildId) {
        const settings = this.guildSettingsCache.get(guildId);
        return settings ? settings.prefix : null;
    }

    async setGuildPrefix(guildId, prefix) {
        const current = this.guildSettingsCache.get(guildId) || {
            prefix: null,
            modLogChannelId: null,
            disabledCategories: [],
            disabledCommands: []
        };
        current.prefix = prefix;
        this.guildSettingsCache.set(guildId, current);

        if (!this.db) return;
        await this.db.run(
            'INSERT INTO guild_settings (guild_id, prefix) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET prefix = excluded.prefix',
            [guildId, prefix]
        );
    }

    async updateGuildSettings(guildId, updates = {}) {
        const current = this.guildSettingsCache.get(guildId) || {
            prefix: null,
            modLogChannelId: null,
            disabledCategories: [],
            disabledCommands: []
        };

        if (updates.prefix !== undefined) current.prefix = updates.prefix;
        if (updates.modLogChannelId !== undefined) current.modLogChannelId = updates.modLogChannelId;
        if (updates.disabledCategories !== undefined) current.disabledCategories = updates.disabledCategories;
        if (updates.disabledCommands !== undefined) current.disabledCommands = updates.disabledCommands;

        this.guildSettingsCache.set(guildId, current);

        if (!this.db) return;
        await this.db.run(`
            INSERT INTO guild_settings (guild_id, prefix, mod_log_channel_id, disabled_categories, disabled_commands)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                prefix = excluded.prefix,
                mod_log_channel_id = excluded.mod_log_channel_id,
                disabled_categories = excluded.disabled_categories,
                disabled_commands = excluded.disabled_commands
        `, [
            guildId,
            current.prefix,
            current.modLogChannelId,
            JSON.stringify(current.disabledCategories),
            JSON.stringify(current.disabledCommands)
        ]);
    }

    async setGuildSettings(guildId, updates = {}) {
        return this.updateGuildSettings(guildId, updates);
    }

    isCategoryDisabled(guildId, category) {
        if (!category) return false;
        const settings = this.guildSettingsCache.get(guildId);
        if (!settings || !Array.isArray(settings.disabledCategories)) return false;
        return settings.disabledCategories.includes(category.toLowerCase());
    }

    isCommandDisabled(guildId, commandName) {
        if (!commandName) return false;
        const settings = this.guildSettingsCache.get(guildId);
        if (!settings || !Array.isArray(settings.disabledCommands)) return false;
        return settings.disabledCommands.includes(commandName.toLowerCase());
    }

    // --- VoiceMaster System ---
    async setVoiceMasterSetup(guildId, vcId, categoryId, interfaceChannelId = null, interfaceMsgId = null, script = null, waitingRoomId = null, counterChannelId = null) {
        const existing = this.voicemasterCache.get(guildId);
        const resolvedCounterId = counterChannelId !== null ? counterChannelId : (existing?.counter_channel_id || null);

        this.voicemasterCache.set(guildId, {
            guild_id: guildId,
            vc_id: vcId,
            category_id: categoryId,
            interface_channel_id: interfaceChannelId,
            interface_msg_id: interfaceMsgId,
            script,
            waiting_room_id: waitingRoomId,
            thread_count: existing?.thread_count || 0,
            counter_channel_id: resolvedCounterId
        });

        await this.db.run(`
            INSERT OR REPLACE INTO voicemaster_setup
            (guild_id, vc_id, category_id, interface_channel_id, interface_msg_id, script, waiting_room_id, counter_channel_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [guildId, vcId, categoryId, interfaceChannelId, interfaceMsgId, script, waitingRoomId, resolvedCounterId]);
    }

    async setVoiceMasterCounterChannel(guildId, counterChannelId) {
        const setup = this.voicemasterCache.get(guildId);
        if (setup) setup.counter_channel_id = counterChannelId;
        await this.db.run('UPDATE voicemaster_setup SET counter_channel_id = ? WHERE guild_id = ?', [counterChannelId, guildId]);
    }

    async getVoiceMasterSetup(guildId) {
        if (this.voicemasterCache.has(guildId)) {
            return this.voicemasterCache.get(guildId);
        }
        const row = await this.db.get('SELECT * FROM voicemaster_setup WHERE guild_id = ?', [guildId]);
        this.voicemasterCache.set(guildId, row || null);
        return row || null;
    }

    getVoiceMasterSetupSync(guildId) {
        return this.voicemasterCache.get(guildId) || null;
    }

    async incrementVoiceMasterThreadCount(guildId) {
        const setup = this.voicemasterCache.get(guildId);
        const newCount = ((setup?.thread_count || 0) + 1);
        if (setup) setup.thread_count = newCount;
        await this.db.run('UPDATE voicemaster_setup SET thread_count = thread_count + 1 WHERE guild_id = ?', [guildId]);
        return newCount;
    }

    async setVoiceMasterCategory(guildId, categoryId) {
        const setup = this.voicemasterCache.get(guildId);
        if (setup) setup.category_id = categoryId;
        await this.db.run('UPDATE voicemaster_setup SET category_id = ? WHERE guild_id = ?', [categoryId, guildId]);
    }

    async removeVoiceMasterSetup(guildId) {
        this.voicemasterCache.delete(guildId);
        await this.db.run('DELETE FROM voicemaster_setup WHERE guild_id = ?', [guildId]);
    }

    async resetAllVoiceMasterThreadCounts() {
        for (const [guildId, setup] of this.voicemasterCache.entries()) {
            setup.thread_count = 0;
        }
        await this.db.run('UPDATE voicemaster_setup SET thread_count = 0');
    }

    async addVoiceMasterJ2C(guildId, vcId, name) {
        await this.db.run(`
            INSERT OR REPLACE INTO voicemaster_j2c (guild_id, vc_id, name)
            VALUES (?, ?, ?)
        `, [guildId, vcId, name]);
    }

    async setVoiceMasterJ2CCategory(vcId, categoryId) {
        await this.db.run('UPDATE voicemaster_j2c SET category_id = ? WHERE vc_id = ?', [categoryId, vcId]);
    }

    async getVoiceMasterJ2Cs(guildId) {
        return await this.db.all('SELECT * FROM voicemaster_j2c WHERE guild_id = ?', [guildId]) || [];
    }

    async getVoiceMasterJ2C(vcId) {
        return await this.db.get('SELECT * FROM voicemaster_j2c WHERE vc_id = ?', [vcId]);
    }

    async removeVoiceMasterJ2C(vcId) {
        await this.db.run('DELETE FROM voicemaster_j2c WHERE vc_id = ?', [vcId]);
    }

    async addActiveVC(channelId, ownerId, guildId, textChannelId = null) {
        await this.db.run('INSERT OR REPLACE INTO voicemaster_active (channel_id, owner_id, guild_id, text_channel_id) VALUES (?, ?, ?, ?)', [channelId, ownerId, guildId, textChannelId]);
    }

    async getActiveVCByTextChannel(textChannelId) {
        return await this.db.get('SELECT * FROM voicemaster_active WHERE text_channel_id = ?', [textChannelId]);
    }

    async getActiveVC(channelId) {
        return await this.db.get('SELECT * FROM voicemaster_active WHERE channel_id = ?', [channelId]);
    }

    async getAllActiveVCs(guildId) {
        return await this.db.all('SELECT * FROM voicemaster_active WHERE guild_id = ?', [guildId]) || [];
    }

    async removeActiveVC(channelId) {
        await this.db.run('DELETE FROM voicemaster_active WHERE channel_id = ?', [channelId]);
    }

    async getActiveVCByOwner(ownerId, guildId) {
        return await this.db.get('SELECT * FROM voicemaster_active WHERE owner_id = ? AND guild_id = ?', [ownerId, guildId]);
    }

    async updateActiveVCOwner(channelId, newOwnerId) {
        await this.db.run('UPDATE voicemaster_active SET owner_id = ? WHERE channel_id = ?', [newOwnerId, channelId]);
    }

    async setVCDefaultName(guildId, userId, name) {
        await this.db.run('INSERT OR REPLACE INTO voicemaster_default_names (guild_id, user_id, name) VALUES (?, ?, ?)', [guildId, userId, name]);
    }

    async getVCDefaultName(guildId, userId) {
        const row = await this.db.get('SELECT name FROM voicemaster_default_names WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        return row ? row.name : null;
    }

    async removeVCDefaultName(guildId, userId) {
        await this.db.run('DELETE FROM voicemaster_default_names WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    }

    async setVCDefaultLimit(guildId, userId, limit) {
        await this.db.run('INSERT OR REPLACE INTO voicemaster_default_limits (guild_id, user_id, user_limit) VALUES (?, ?, ?)', [guildId, userId, limit]);
    }

    async getVCDefaultLimit(guildId, userId) {
        const row = await this.db.get('SELECT user_limit FROM voicemaster_default_limits WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        return row ? row.user_limit : null;
    }

    async removeVCDefaultLimit(guildId, userId) {
        await this.db.run('DELETE FROM voicemaster_default_limits WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    }

    async addVCBan(guildId, ownerId, bannedUserId) {
        await this.db.run('INSERT OR IGNORE INTO voicemaster_bans (guild_id, owner_id, banned_user_id) VALUES (?, ?, ?)', [guildId, ownerId, bannedUserId]);
    }

    async removeVCBan(guildId, ownerId, bannedUserId) {
        await this.db.run('DELETE FROM voicemaster_bans WHERE guild_id = ? AND owner_id = ? AND banned_user_id = ?', [guildId, ownerId, bannedUserId]);
    }

    async getVCBans(guildId, ownerId) {
        return await this.db.all('SELECT banned_user_id FROM voicemaster_bans WHERE guild_id = ? AND owner_id = ?', [guildId, ownerId]) || [];
    }

    async isVCBanned(guildId, ownerId, userId) {
        const row = await this.db.get('SELECT 1 FROM voicemaster_bans WHERE guild_id = ? AND owner_id = ? AND banned_user_id = ?', [guildId, ownerId, userId]);
        return !!row;
    }

    async resetVoiceMaster(guildId) {
        this.voicemasterCache.delete(guildId);
        await this.db.run('DELETE FROM voicemaster_setup WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM voicemaster_active WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM voicemaster_j2c WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM voicemaster_bans WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM voicemaster_default_names WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM voicemaster_default_limits WHERE guild_id = ?', [guildId]);
    }

    // --- Economy System ---
    async getEconomy(guildId, userId) {
        let row = await this.db.get('SELECT * FROM user_economy WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        if (!row) {
            await this.db.run(
                'INSERT INTO user_economy (guild_id, user_id, wallet, bank, last_daily, last_weekly, last_monthly, streak, vault, bank_capacity) VALUES (?, ?, 1000, 0, 0, 0, 0, 0, 0, 25000) ON CONFLICT(guild_id, user_id) DO NOTHING',
                [guildId, userId]
            );
            row = {
                guild_id: guildId,
                user_id: userId,
                wallet: 1000,
                bank: 0,
                last_daily: 0,
                last_weekly: 0,
                last_monthly: 0,
                streak: 0,
                vault: 0,
                bank_capacity: 25000
            };
        }
        if (row.bank_capacity === undefined || row.bank_capacity === null) row.bank_capacity = 25000;
        if (row.vault === undefined || row.vault === null) row.vault = 0;
        if (row.streak_freezes === undefined || row.streak_freezes === null) row.streak_freezes = 0;
        if (row.prestige === undefined || row.prestige === null) row.prestige = 0;
        return row;
    }

    async addWallet(guildId, userId, amount) {
        await this.getEconomy(guildId, userId);
        await this.db.run(
            'UPDATE user_economy SET wallet = MAX(0, wallet + ?) WHERE guild_id = ? AND user_id = ?',
            [amount, guildId, userId]
        );
        return await this.getEconomy(guildId, userId);
    }

    async setWallet(guildId, userId, amount) {
        await this.getEconomy(guildId, userId);
        await this.db.run(
            'UPDATE user_economy SET wallet = MAX(0, ?) WHERE guild_id = ? AND user_id = ?',
            [amount, guildId, userId]
        );
        return await this.getEconomy(guildId, userId);
    }

    async addBank(guildId, userId, amount) {
        await this.getEconomy(guildId, userId);
        await this.db.run(
            'UPDATE user_economy SET bank = MAX(0, bank + ?) WHERE guild_id = ? AND user_id = ?',
            [amount, guildId, userId]
        );
        return await this.getEconomy(guildId, userId);
    }

    async setBank(guildId, userId, amount) {
        await this.getEconomy(guildId, userId);
        await this.db.run(
            'UPDATE user_economy SET bank = MAX(0, ?) WHERE guild_id = ? AND user_id = ?',
            [amount, guildId, userId]
        );
        return await this.getEconomy(guildId, userId);
    }

    async deposit(guildId, userId, amount) {
        const eco = await this.getEconomy(guildId, userId);
        if (eco.wallet < amount) return { success: false, reason: 'insufficient' };
        const card = await this.getCard(guildId, userId);
        const cap = (card && card.bank_capacity) ? card.bank_capacity : (eco.bank_capacity || 25000);
        const availableSpace = Math.max(0, cap - eco.bank);
        if (availableSpace <= 0) return { success: false, reason: 'full', capacity: cap };
        const toDeposit = Math.min(amount, availableSpace);

        await this.db.run('UPDATE user_economy SET wallet = wallet - ?, bank = bank + ? WHERE guild_id = ? AND user_id = ?', [toDeposit, toDeposit, guildId, userId]);
        return { success: true, deposited: toDeposit, newWallet: eco.wallet - toDeposit, newBank: eco.bank + toDeposit, capped: toDeposit < amount };
    }

    async withdraw(guildId, userId, amount) {
        const eco = await this.getEconomy(guildId, userId);
        if (eco.bank < amount) return { success: false, reason: 'insufficient' };
        await this.db.run('UPDATE user_economy SET wallet = wallet + ?, bank = bank - ? WHERE guild_id = ? AND user_id = ?', [amount, amount, guildId, userId]);
        return { success: true, withdrawn: amount, newWallet: eco.wallet + amount, newBank: eco.bank - amount };
    }

    async depositVault(guildId, userId, amount) {
        const eco = await this.getEconomy(guildId, userId);
        if (eco.wallet < amount) return { success: false, reason: 'insufficient' };
        await this.db.run('UPDATE user_economy SET wallet = wallet - ?, vault = vault + ? WHERE guild_id = ? AND user_id = ?', [amount, amount, guildId, userId]);
        return { success: true, deposited: amount, newWallet: eco.wallet - amount, newVault: (eco.vault || 0) + amount };
    }

    async withdrawVault(guildId, userId, amount) {
        const eco = await this.getEconomy(guildId, userId);
        const vaultBal = eco.vault || 0;
        if (vaultBal < amount) return { success: false, reason: 'insufficient' };
        await this.db.run('UPDATE user_economy SET wallet = wallet + ?, vault = vault - ? WHERE guild_id = ? AND user_id = ?', [amount, amount, guildId, userId]);
        return { success: true, withdrawn: amount, newWallet: eco.wallet + amount, newVault: vaultBal - amount };
    }

    async upgradeBankCapacity(guildId, userId, cost, additionalCap) {
        const eco = await this.getEconomy(guildId, userId);
        if (eco.wallet < cost) return { success: false, reason: 'insufficient' };
        const newCap = (eco.bank_capacity || 25000) + additionalCap;
        await this.db.run('UPDATE user_economy SET wallet = wallet - ?, bank_capacity = ? WHERE guild_id = ? AND user_id = ?', [cost, newCap, guildId, userId]);
        return { success: true, newCapacity: newCap, remainingWallet: eco.wallet - cost };
    }

    async claimDaily(guildId, userId, amount = 750) {
        const user = await this.getEconomy(guildId, userId);
        const now = Math.floor(Date.now() / 1000);
        const oneDay = 86400;
        const twoDays = 172800;

        if (user.last_daily && (now - user.last_daily) < oneDay) {
            const remaining = oneDay - (now - user.last_daily);
            return { success: false, remaining };
        }

        let newStreak = 1;
        let streakFrozen = false;

        if (user.last_daily && (now - user.last_daily) < twoDays) {
            newStreak = (user.streak || 0) + 1;
        } else if (user.last_daily && (now - user.last_daily) >= twoDays && (user.streak_freezes || 0) > 0) {
            newStreak = (user.streak || 1) + 1;
            streakFrozen = true;
            await this.db.run('UPDATE user_economy SET streak_freezes = streak_freezes - 1 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        }

        // Marriage bonus check (scales 15% to 27% based on marriage level)
        const marriage = await this.getMarriage(guildId, userId);
        const marriageMultiplier = marriage ? (0.15 + Math.min(0.12, ((marriage.level || 1) - 1) * 0.03)) : 0;

        // Prestige multiplier check
        const prestigeMultiplier = (user.prestige || 0) * 0.20;

        const streakBonus = Math.min(newStreak * 75, 1500);
        let baseReward = amount + streakBonus;

        const bonusCoins = Math.floor(baseReward * (marriageMultiplier + prestigeMultiplier));
        const totalReward = baseReward + bonusCoins;

        await this.db.run(
            'UPDATE user_economy SET wallet = wallet + ?, streak = ?, last_daily = ? WHERE guild_id = ? AND user_id = ?',
            [totalReward, newStreak, now, guildId, userId]
        );

        return {
            success: true,
            reward: totalReward,
            streakBonus,
            streakFrozen,
            hasMarriage: Boolean(marriage),
            prestige: user.prestige || 0,
            streak: newStreak,
            totalWallet: user.wallet + totalReward
        };
    }

    async claimWeekly(guildId, userId, amount = 3500) {
        const user = await this.getEconomy(guildId, userId);
        const now = Math.floor(Date.now() / 1000);
        const sevenDays = 604800;

        if (user.last_weekly && (now - user.last_weekly) < sevenDays) {
            const remaining = sevenDays - (now - user.last_weekly);
            return { success: false, remaining };
        }

        await this.db.run(
            'UPDATE user_economy SET wallet = wallet + ?, last_weekly = ? WHERE guild_id = ? AND user_id = ?',
            [amount, now, guildId, userId]
        );

        return {
            success: true,
            reward: amount,
            totalWallet: user.wallet + amount
        };
    }

    async claimMonthly(guildId, userId, amount = 15000) {
        const user = await this.getEconomy(guildId, userId);
        const now = Math.floor(Date.now() / 1000);
        const thirtyDays = 2592000;

        if (user.last_monthly && (now - user.last_monthly) < thirtyDays) {
            const remaining = thirtyDays - (now - user.last_monthly);
            return { success: false, remaining };
        }

        await this.db.run(
            'UPDATE user_economy SET wallet = wallet + ?, last_monthly = ? WHERE guild_id = ? AND user_id = ?',
            [amount, now, guildId, userId]
        );

        return {
            success: true,
            reward: amount,
            totalWallet: user.wallet + amount
        };
    }

    async transferWallet(guildId, fromId, toId, amount) {
        const fromUser = await this.getEconomy(guildId, fromId);
        if (fromUser.wallet < amount) return { success: false, reason: 'insufficient' };

        await this.db.run('UPDATE user_economy SET wallet = wallet - ? WHERE guild_id = ? AND user_id = ?', [amount, guildId, fromId]);
        await this.db.run(
            'INSERT INTO user_economy (guild_id, user_id, wallet) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET wallet = wallet + excluded.wallet',
            [guildId, toId, amount]
        );
        return { success: true };
    }

    async getEconomyRank(guildId, userId) {
        const rows = await this.db.all('SELECT user_id, (wallet + bank + COALESCE(vault, 0)) AS total FROM user_economy WHERE guild_id = ? ORDER BY total DESC', [guildId]);
        if (!rows || rows.length === 0) return 1;
        const idx = rows.findIndex(r => r.user_id === userId);
        return idx !== -1 ? idx + 1 : rows.length + 1;
    }

    async getEconomyLeaderboard(guildId, limit = 10) {
        return await this.db.all(
            'SELECT user_id, wallet, bank, COALESCE(vault, 0) AS vault, (wallet + bank + COALESCE(vault, 0)) AS total FROM user_economy WHERE guild_id = ? ORDER BY total DESC LIMIT ?',
            [guildId, limit]
        ) || [];
    }

    async recordTransaction(guildId, userId, type, amount, description = '') {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(`
            INSERT INTO economy_transactions (guild_id, user_id, type, amount, description, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [guildId, userId, type, amount, description, now]);
    }

    async getTransactions(guildId, userId, limit = 5) {
        return await this.db.all(`
            SELECT * FROM economy_transactions
            WHERE guild_id = ? AND user_id = ?
            ORDER BY timestamp DESC LIMIT ?
        `, [guildId, userId, limit]) || [];
    }

    async getTransactionById(guildId, userId, txId) {
        if (!this.db || !guildId || !userId) return null;
        return await this.db.get(
            'SELECT * FROM economy_transactions WHERE guild_id = ? AND user_id = ? AND id = ?',
            [guildId, userId, txId]
        ) || null;
    }

    async getRecentTransactions(guildId, userId, sinceTimestamp) {
        if (!this.db || !guildId || !userId) return [];
        return await this.db.all(
            'SELECT * FROM economy_transactions WHERE guild_id = ? AND user_id = ? AND timestamp >= ? ORDER BY timestamp DESC',
            [guildId, userId, sinceTimestamp]
        ) || [];
    }

    async recordFraudCheck(guildId, userId) {
        return true;
    }

    // --- Card & Banking System ---
    _generateCardNumber() {
        let num = '4532';
        for (let i = 0; i < 12; i++) {
            num += Math.floor(Math.random() * 10).toString();
        }
        return `${num.slice(0, 4)} ${num.slice(4, 8)} ${num.slice(8, 12)} ${num.slice(12, 16)}`;
    }

    _generateCvv() {
        return Math.floor(100 + Math.random() * 900).toString();
    }

    async hasCard(guildId, userId) {
        if (!this.db || !guildId || !userId) return false;
        const row = await this.db.get('SELECT is_open FROM user_cards WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        return !!(row && row.is_open);
    }

    async getCard(guildId, userId) {
        if (!this.db || !guildId || !userId) return null;
        const row = await this.db.get('SELECT * FROM user_cards WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        if (!row) return null;
        return {
            ...row,
            is_open: !!row.is_open,
            is_locked: !!row.is_locked,
            locked: !!row.is_locked
        };
    }

    async openCard(guildId, userId) {
        if (!this.db || !guildId || !userId) return { success: false, alreadyOpen: false };
        const existing = await this.getCard(guildId, userId);
        if (existing && existing.is_open) {
            return { success: false, alreadyOpen: true };
        }
        const now = Math.floor(Date.now() / 1000);
        const cardNumber = this._generateCardNumber();
        const cvv = this._generateCvv();

        // Ensure user_economy exists
        await this.getEconomy(guildId, userId);

        await this.db.run(`
            INSERT INTO user_cards (guild_id, user_id, card_number, cvv, is_open, is_locked, opened_at, unlocked_at, tier, bank_capacity, earned_all_time)
            VALUES (?, ?, ?, ?, 1, 0, ?, ?, 'standard', 25000, 0)
            ON CONFLICT(guild_id, user_id) DO UPDATE SET
                card_number = excluded.card_number,
                cvv = excluded.cvv,
                is_open = 1,
                is_locked = 0,
                opened_at = excluded.opened_at,
                unlocked_at = excluded.unlocked_at
        `, [guildId, userId, cardNumber, cvv, now, now]);

        return { success: true, alreadyOpen: false, cardNumber, cvv };
    }

    async setCardLock(guildId, userId, locked) {
        if (!this.db || !guildId || !userId) return false;
        const now = Math.floor(Date.now() / 1000);
        const lockVal = locked ? 1 : 0;
        if (!locked) {
            await this.db.run(
                'UPDATE user_cards SET is_locked = ?, unlocked_at = ? WHERE guild_id = ? AND user_id = ?',
                [lockVal, now, guildId, userId]
            );
        } else {
            await this.db.run(
                'UPDATE user_cards SET is_locked = ? WHERE guild_id = ? AND user_id = ?',
                [lockVal, guildId, userId]
            );
        }
        return true;
    }

    async reissueCard(guildId, userId) {
        if (!this.db || !guildId || !userId) return null;
        const now = Math.floor(Date.now() / 1000);
        const cardNumber = this._generateCardNumber();
        const cvv = this._generateCvv();
        await this.db.run(
            'UPDATE user_cards SET card_number = ?, cvv = ?, is_locked = 0, unlocked_at = ? WHERE guild_id = ? AND user_id = ?',
            [cardNumber, cvv, now, guildId, userId]
        );
        return { cardNumber, cvv };
    }

    async updateCardNumber(guildId, userId, newNumber) {
        if (!this.db || !guildId || !userId) return false;
        await this.db.run(
            'UPDATE user_cards SET card_number = ? WHERE guild_id = ? AND user_id = ?',
            [newNumber, guildId, userId]
        );
        return true;
    }

    async getCardByNumber(guildId, rawNumber) {
        if (!this.db || !guildId || !rawNumber) return null;
        const cleanNum = String(rawNumber).replace(/[\s-]/g, '');
        const rows = await this.db.all('SELECT * FROM user_cards WHERE guild_id = ?', [guildId]) || [];
        for (const row of rows) {
            if (row.card_number && row.card_number.replace(/[\s-]/g, '') === cleanNum) {
                return {
                    ...row,
                    is_open: !!row.is_open,
                    is_locked: !!row.is_locked,
                    locked: !!row.is_locked
                };
            }
        }
        return null;
    }

    // --- Work & Career Progression Engine ---
    async getWork(guildId, userId) {
        if (!this.db || !guildId || !userId) {
            return {
                guild_id: guildId,
                user_id: userId,
                career: null,
                level: 1,
                exp: 0,
                shifts_completed: 0,
                total_earned: 0,
                last_work: 0,
                work_streak: 0
            };
        }
        let row = await this.db.get('SELECT * FROM user_work WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        if (!row) {
            await this.db.run(
                'INSERT INTO user_work (guild_id, user_id, career, level, exp, shifts_completed, total_earned, last_work, work_streak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [guildId, userId, null, 1, 0, 0, 0, 0, 0]
            );
            row = await this.db.get('SELECT * FROM user_work WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        }
        return row || {
            guild_id: guildId,
            user_id: userId,
            career: null,
            level: 1,
            exp: 0,
            shifts_completed: 0,
            total_earned: 0,
            last_work: 0,
            work_streak: 0
        };
    }

    async setWorkCareer(guildId, userId, careerId) {
        if (!this.db || !guildId || !userId) return false;
        await this.getWork(guildId, userId);
        await this.db.run(
            'UPDATE user_work SET career = ? WHERE guild_id = ? AND user_id = ?',
            [careerId, guildId, userId]
        );
        return true;
    }

    async saveWorkShift(guildId, userId, { career, level, exp, earned, lastWork, workStreak, strikes, overtimeLast }) {
        if (!this.db || !guildId || !userId) return false;
        await this.getWork(guildId, userId);
        const updates = ['career = ?', 'level = ?', 'exp = ?', 'shifts_completed = shifts_completed + 1', 'total_earned = total_earned + ?', 'last_work = ?', 'work_streak = ?'];
        const params = [career, level, exp, earned, lastWork, workStreak];
        if (strikes !== undefined) {
            updates.push('strikes = ?');
            params.push(strikes);
        }
        if (overtimeLast !== undefined) {
            updates.push('overtime_last = ?');
            params.push(overtimeLast);
        }
        params.push(guildId, userId);
        await this.db.run(`
            UPDATE user_work
            SET ${updates.join(', ')}
            WHERE guild_id = ? AND user_id = ?
        `, params);

        await this.db.run(`
            UPDATE user_cards
            SET earned_all_time = earned_all_time + ?
            WHERE guild_id = ? AND user_id = ?
        `, [earned, guildId, userId]);

        return true;
    }

    async setWorkLastWork(guildId, userId, lastWork) {
        if (!this.db || !guildId || !userId) return false;
        await this.getWork(guildId, userId);
        await this.db.run('UPDATE user_work SET last_work = ? WHERE guild_id = ? AND user_id = ?', [lastWork, guildId, userId]);
        return true;
    }

    async getWorkLeaderboard(guildId, limit = 10) {
        if (!this.db || !guildId) return [];
        return await this.db.all(`
            SELECT user_id, career, level, exp, shifts_completed, total_earned, work_streak, COALESCE(strikes, 0) AS strikes
            FROM user_work
            WHERE guild_id = ? AND shifts_completed > 0
            ORDER BY total_earned DESC LIMIT ?
        `, [guildId, limit]) || [];
    }

    // --- Inventory System ---
    async getInventory(guildId, userId) {
        return await this.db.all('SELECT item_id, amount FROM user_inventory WHERE guild_id = ? AND user_id = ? AND amount > 0 ORDER BY amount DESC', [guildId, userId]) || [];
    }

    async getItem(guildId, userId, itemId) {
        const row = await this.db.get('SELECT item_id, amount FROM user_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
        return row ? row.amount : 0;
    }

    async addItem(guildId, userId, itemId, amount = 1) {
        await this.db.run(
            'INSERT INTO user_inventory (guild_id, user_id, item_id, amount) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET amount = amount + excluded.amount',
            [guildId, userId, itemId, amount]
        );
        return await this.getItem(guildId, userId, itemId);
    }

    async removeItem(guildId, userId, itemId, amount = 1) {
        const current = await this.getItem(guildId, userId, itemId);
        if (current < amount) return false;
        if (current === amount) {
            await this.db.run('DELETE FROM user_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
        } else {
            await this.db.run('UPDATE user_inventory SET amount = amount - ? WHERE guild_id = ? AND user_id = ? AND item_id = ?', [amount, guildId, userId, itemId]);
        }
        return true;
    }

    // --- Cooldowns ---
    async getEcoCooldown(guildId, userId, command) {
        const row = await this.db.get('SELECT timestamp FROM economy_cooldowns WHERE guild_id = ? AND user_id = ? AND command = ?', [guildId, userId, command]);
        if (!row) return 0;
        const now = Math.floor(Date.now() / 1000);
        return Math.max(0, row.timestamp - now);
    }

    async setEcoCooldown(guildId, userId, command, seconds) {
        const expireTs = Math.floor(Date.now() / 1000) + seconds;
        await this.db.run(
            'INSERT INTO economy_cooldowns (guild_id, user_id, command, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id, command) DO UPDATE SET timestamp = excluded.timestamp',
            [guildId, userId, command, expireTs]
        );
    }

    // --- Active Item Buffs ---
    async getActiveItem(guildId, userId, itemId) {
        const row = await this.db.get('SELECT expires_at FROM economy_active_items WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
        if (!row) return null;
        const now = Math.floor(Date.now() / 1000);
        if (row.expires_at <= now) {
            await this.db.run('DELETE FROM economy_active_items WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
            return null;
        }
        return row.expires_at;
    }

    async setActiveItem(guildId, userId, itemId, durationSeconds) {
        const expiresAt = Math.floor(Date.now() / 1000) + durationSeconds;
        await this.db.run(
            'INSERT INTO economy_active_items (guild_id, user_id, item_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET expires_at = excluded.expires_at',
            [guildId, userId, itemId, expiresAt]
        );
    }

    async removeActiveItem(guildId, userId, itemId) {
        await this.db.run('DELETE FROM economy_active_items WHERE guild_id = ? AND user_id = ? AND item_id = ?', [guildId, userId, itemId]);
    }

    // --- Bounties ---
    async getBounty(guildId, targetId) {
        return await this.db.get('SELECT * FROM economy_bounties WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
    }

    async setBounty(guildId, targetId, setterId, amount) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(
            'INSERT INTO economy_bounties (guild_id, target_id, setter_id, amount, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(guild_id, target_id) DO UPDATE SET amount = amount + excluded.amount, setter_id = excluded.setter_id',
            [guildId, targetId, setterId, amount, now]
        );
    }

    async removeBounty(guildId, targetId) {
        await this.db.run('DELETE FROM economy_bounties WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
    }

    async getAllBounties(guildId) {
        return await this.db.all('SELECT * FROM economy_bounties WHERE guild_id = ? ORDER BY amount DESC', [guildId]) || [];
    }

    // --- Lottery Pool ---
    async getLotteryPool(guildId) {
        const rows = await this.db.all('SELECT user_id, tickets FROM economy_lottery WHERE guild_id = ?', [guildId]) || [];
        const totalTickets = rows.reduce((sum, r) => sum + r.tickets, 0);
        return { participants: rows, totalTickets, jackpot: totalTickets * 200 };
    }

    async buyLotteryTickets(guildId, userId, count) {
        await this.db.run(
            'INSERT INTO economy_lottery (guild_id, user_id, tickets) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET tickets = tickets + excluded.tickets',
            [guildId, userId, count]
        );
    }

    async drawLotteryWinner(guildId) {
        const pool = await this.getLotteryPool(guildId);
        if (pool.participants.length === 0 || pool.totalTickets === 0) return null;
        let rand = Math.floor(Math.random() * pool.totalTickets);
        let winnerId = null;
        for (const p of pool.participants) {
            if (rand < p.tickets) {
                winnerId = p.user_id;
                break;
            }
            rand -= p.tickets;
        }
        if (!winnerId) winnerId = pool.participants[0].user_id;
        await this.db.run('DELETE FROM economy_lottery WHERE guild_id = ?', [guildId]);
        return { winnerId, jackpot: pool.jackpot, totalTickets: pool.totalTickets };
    }

    // --- Admin Resets ---
    async resetUserEconomy(guildId, userId) {
        await this.db.run('DELETE FROM user_economy WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM user_inventory WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM economy_transactions WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM economy_cooldowns WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM economy_active_items WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM economy_bounties WHERE guild_id = ? AND (target_id = ? OR setter_id = ?)', [guildId, userId, userId]);
        await this.db.run('DELETE FROM user_cards WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM user_work WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    }

    // --- Pet System ---
    async getPet(guildId, userId) {
        const pet = await this.db.get('SELECT * FROM user_pets WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        if (!pet) return null;

        // Apply natural decay over time
        const now = Math.floor(Date.now() / 1000);
        const hoursPassed = pet.last_fed ? Math.floor((now - pet.last_fed) / 3600) : 0;
        if (hoursPassed > 0) {
            pet.hunger = Math.max(0, pet.hunger - (hoursPassed * 4));
            pet.hygiene = Math.max(0, pet.hygiene - (hoursPassed * 3));
            pet.energy = Math.min(100, pet.energy + (hoursPassed * 5));
        }
        return pet;
    }

    async adoptPet(guildId, userId, petType, petName) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(`
            INSERT INTO user_pets (guild_id, user_id, pet_type, pet_name, level, xp, hunger, hygiene, energy, loyalty, last_fed, last_washed, last_played, last_trained)
            VALUES (?, ?, ?, ?, 1, 0, 100, 100, 100, 100, ?, ?, ?, ?)
            ON CONFLICT(guild_id, user_id) DO UPDATE SET pet_type = excluded.pet_type, pet_name = excluded.pet_name, level = 1, xp = 0, hunger = 100, hygiene = 100, energy = 100, loyalty = 100
        `, [guildId, userId, petType, petName, now, now, now, now]);
        return await this.getPet(guildId, userId);
    }

    async abandonPet(guildId, userId) {
        await this.db.run('DELETE FROM user_pets WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    }

    async feedPet(guildId, userId) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(`
            UPDATE user_pets SET hunger = MIN(100, hunger + 40), loyalty = MIN(100, loyalty + 5), xp = xp + 15, last_fed = ?
            WHERE guild_id = ? AND user_id = ?
        `, [now, guildId, userId]);
        return await this._checkPetLevelUp(guildId, userId);
    }

    async washPet(guildId, userId) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(`
            UPDATE user_pets SET hygiene = 100, loyalty = MIN(100, loyalty + 5), xp = xp + 10, last_washed = ?
            WHERE guild_id = ? AND user_id = ?
        `, [now, guildId, userId]);
        return await this._checkPetLevelUp(guildId, userId);
    }

    async playPet(guildId, userId) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(`
            UPDATE user_pets SET energy = MAX(0, energy - 20), loyalty = MIN(100, loyalty + 10), xp = xp + 25, last_played = ?
            WHERE guild_id = ? AND user_id = ?
        `, [now, guildId, userId]);
        return await this._checkPetLevelUp(guildId, userId);
    }

    async trainPet(guildId, userId) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(`
            UPDATE user_pets SET energy = MAX(0, energy - 35), hunger = MAX(0, hunger - 15), xp = xp + 50, last_trained = ?
            WHERE guild_id = ? AND user_id = ?
        `, [now, guildId, userId]);
        return await this._checkPetLevelUp(guildId, userId);
    }

    async _checkPetLevelUp(guildId, userId) {
        const pet = await this.db.get('SELECT * FROM user_pets WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        if (!pet) return null;
        const requiredXp = pet.level * 100;
        if (pet.xp >= requiredXp) {
            await this.db.run('UPDATE user_pets SET level = level + 1, xp = xp - ? WHERE guild_id = ? AND user_id = ?', [requiredXp, guildId, userId]);
            pet.level += 1;
            pet.leveledUp = true;
        }
        return pet;
    }

    // --- Marriage System ---
    async getMarriage(guildId, userId) {
        const row = await this.db.get('SELECT * FROM user_marriages WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?)', [guildId, userId, userId]);
        if (!row) return null;
        const partnerId = row.user1_id === userId ? row.user2_id : row.user1_id;
        return { ...row, partnerId };
    }

    async createMarriage(guildId, user1Id, user2Id, ring = 'silver ring', level = 1) {
        const now = Math.floor(Date.now() / 1000);
        await this.db.run(
            'INSERT INTO user_marriages (guild_id, user1_id, user2_id, created_at, level, love_exp, last_love, ring) VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
            [guildId, user1Id, user2Id, now, level, ring]
        );
        return await this.getMarriage(guildId, user1Id);
    }

    async addMarriageExp(guildId, userId, amount) {
        const marriage = await this.getMarriage(guildId, userId);
        if (!marriage) return null;
        const now = Math.floor(Date.now() / 1000);
        const currentExp = (marriage.love_exp || 0) + amount;

        let newLevel = 1;
        if (currentExp >= 1000) newLevel = 5;
        else if (currentExp >= 500) newLevel = 4;
        else if (currentExp >= 250) newLevel = 3;
        else if (currentExp >= 100) newLevel = 2;

        const oldLevel = marriage.level || 1;
        const finalLevel = Math.max(oldLevel, newLevel);
        const leveledUp = finalLevel > oldLevel;

        await this.db.run(
            'UPDATE user_marriages SET love_exp = ?, level = ?, last_love = ? WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?)',
            [currentExp, finalLevel, now, guildId, userId, userId]
        );

        const updated = await this.getMarriage(guildId, userId);
        return {
            marriage: updated,
            leveledUp,
            oldLevel,
            newLevel: finalLevel,
            expGain: amount
        };
    }

    async deleteMarriage(guildId, userId) {
        await this.db.run('DELETE FROM user_marriages WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?)', [guildId, userId, userId]);
    }

    // --- Prestige System ---
    async prestigeUser(guildId, userId) {
        const eco = await this.getEconomy(guildId, userId);
        const newPrestige = (eco.prestige || 0) + 1;
        // Wipe wallet & bank, preserve vault and bump prestige
        await this.db.run('UPDATE user_economy SET wallet = 1000, bank = 0, prestige = ? WHERE guild_id = ? AND user_id = ?', [newPrestige, guildId, userId]);
        return newPrestige;
    }

    async resetGuildEconomy(guildId) {
        await this.db.run('DELETE FROM user_economy WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM user_inventory WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM economy_transactions WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM economy_cooldowns WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM economy_active_items WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM economy_bounties WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM economy_lottery WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM user_pets WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM user_marriages WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM user_cards WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM user_work WHERE guild_id = ?', [guildId]);
    }

    // --- Invite Tracking System ---
    async getUserInvites(guildId, userId) {
        if (!this.db || !guildId || !userId) return { joins: 0, leaves: 0, fakes: 0, bonus: 0, total: 0 };
        const row = await this.db.get('SELECT * FROM user_invites WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        if (!row) return { joins: 0, leaves: 0, fakes: 0, bonus: 0, total: 0 };
        const total = (row.joins || 0) - (row.leaves || 0) + (row.bonus || 0);
        return {
            joins: row.joins || 0,
            leaves: row.leaves || 0,
            fakes: row.fakes || 0,
            bonus: row.bonus || 0,
            total
        };
    }

    async recordInviteJoin(guildId, memberId, inviterId, code, isFake = false) {
        if (!this.db) return;
        const existing = await this.db.get('SELECT inviter_id FROM member_invites WHERE guild_id = ? AND member_id = ?', [guildId, memberId]);
        if (existing) return;

        await this.db.run(
            'INSERT OR REPLACE INTO member_invites (guild_id, member_id, inviter_id, code, timestamp) VALUES (?, ?, ?, ?, ?)',
            [guildId, memberId, inviterId, code, Math.floor(Date.now() / 1000)]
        );

        if (isFake) {
            await this.db.run(`
                INSERT INTO user_invites (guild_id, user_id, joins, fakes) VALUES (?, ?, 1, 1)
                ON CONFLICT(guild_id, user_id) DO UPDATE SET joins = joins + 1, fakes = fakes + 1
            `, [guildId, inviterId]);
        } else {
            await this.db.run(`
                INSERT INTO user_invites (guild_id, user_id, joins) VALUES (?, ?, 1)
                ON CONFLICT(guild_id, user_id) DO UPDATE SET joins = joins + 1
            `, [guildId, inviterId]);
        }
    }

    async recordInviteLeave(guildId, memberId) {
        if (!this.db) return;
        const row = await this.db.get('SELECT inviter_id FROM member_invites WHERE guild_id = ? AND member_id = ?', [guildId, memberId]);
        if (!row || !row.inviter_id) return;

        await this.db.run(`
            UPDATE user_invites SET leaves = leaves + 1 WHERE guild_id = ? AND user_id = ?
        `, [guildId, row.inviter_id]);
    }

    async addBonusInvites(guildId, userId, amount) {
        return await this.adjustBonusInvites(guildId, userId, amount);
    }

    async adjustBonusInvites(guildId, userId, amount) {
        if (!this.db || !guildId || !userId) return 0;
        await this.db.run(`
            INSERT INTO user_invites (guild_id, user_id, bonus) VALUES (?, ?, ?)
            ON CONFLICT(guild_id, user_id) DO UPDATE SET bonus = bonus + ?
        `, [guildId, userId, amount, amount]);

        const row = await this.db.get(`
            SELECT bonus FROM user_invites WHERE guild_id = ? AND user_id = ?
        `, [guildId, userId]);
        return row?.bonus || 0;
    }

    async resetUserInvites(guildId, userId) {
        if (!this.db) return;
        await this.db.run('DELETE FROM user_invites WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        await this.db.run('DELETE FROM member_invites WHERE guild_id = ? AND inviter_id = ?', [guildId, userId]);
    }

    async resetAllGuildInvites(guildId) {
        return await this.resetGuildInvites(guildId);
    }

    async resetGuildInvites(guildId) {
        if (!this.db) return;
        await this.db.run('DELETE FROM user_invites WHERE guild_id = ?', [guildId]);
        await this.db.run('DELETE FROM member_invites WHERE guild_id = ?', [guildId]);
    }

    async getTopInviters(guildId, limit = 10) {
        if (!this.db) return [];
        return await this.db.all(`
            SELECT user_id, joins, leaves, fakes, bonus, ((joins - leaves) + bonus) as total
            FROM user_invites
            WHERE guild_id = ?
            ORDER BY total DESC
            LIMIT ?
        `, [guildId, limit]) || [];
    }

    // --- Guild Movement ---
    async recordGuildMovement(guildId, type) {
        if (!this.db || !guildId) return;
        await this.db.run(
            'INSERT INTO guild_movement (guild_id, type, timestamp) VALUES (?, ?, ?)',
            [guildId, type, Math.floor(Date.now() / 1000)]
        );
    }

    async getGuildMovement(guildId) {
        if (!this.db || !guildId) return { joins1h: 0, leaves1h: 0, joins24h: 0, leaves24h: 0 };
        const now = Math.floor(Date.now() / 1000);
        const oneHourAgo = now - 3600;
        const oneDayAgo = now - 86400;

        const rows = await this.db.all(
            'SELECT type, timestamp FROM guild_movement WHERE guild_id = ? AND timestamp >= ?',
            [guildId, oneDayAgo]
        ) || [];

        let joins1h = 0, leaves1h = 0, joins24h = 0, leaves24h = 0;
        for (const r of rows) {
            if (r.type === 'join') {
                joins24h++;
                if (r.timestamp >= oneHourAgo) joins1h++;
            } else if (r.type === 'leave') {
                leaves24h++;
                if (r.timestamp >= oneHourAgo) leaves1h++;
            }
        }
        return { joins1h, leaves1h, joins24h, leaves24h };
    }

    // --- Giveaway System ---
    async createGiveaway({ messageId, channelId, guildId, hostId, prize, winnersCount, endsAt, imageUrl = null, requirement = null }) {
        if (!this.db) return null;
        const now = Math.floor(Date.now() / 1000);
        const result = await this.db.run(`
            INSERT INTO giveaways (message_id, channel_id, guild_id, host_id, prize, winners_count, ends_at, image_url, requirement, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [messageId, channelId, guildId, hostId, prize, winnersCount, endsAt, imageUrl, requirement, now]);
        return result?.lastInsertRowid || result?.lastID;
    }

    async getGiveawayByMessageId(messageId) {
        if (!this.db) return null;
        return await this.db.get('SELECT * FROM giveaways WHERE message_id = ?', [messageId]) || null;
    }

    async getGiveawayById(id) {
        if (!this.db) return null;
        return await this.db.get('SELECT * FROM giveaways WHERE id = ?', [id]) || null;
    }

    async getLatestGiveaway(guildId, channelId = null, { activeOnly = false, endedOnly = false } = {}) {
        if (!this.db) return null;
        let query = 'SELECT * FROM giveaways WHERE guild_id = ?';
        const params = [guildId];

        if (channelId) {
            query += ' AND channel_id = ?';
            params.push(channelId);
        }
        if (activeOnly) {
            query += ' AND ended = 0 AND cancelled = 0';
        } else if (endedOnly) {
            query += ' AND ended = 1 AND cancelled = 0';
        }

        query += ' ORDER BY created_at DESC LIMIT 1';
        let row = await this.db.get(query, params);

        if (!row && channelId) {
            let fallbackQuery = 'SELECT * FROM giveaways WHERE guild_id = ?';
            const fallbackParams = [guildId];
            if (activeOnly) fallbackQuery += ' AND ended = 0 AND cancelled = 0';
            else if (endedOnly) fallbackQuery += ' AND ended = 1 AND cancelled = 0';
            fallbackQuery += ' ORDER BY created_at DESC LIMIT 1';
            row = await this.db.get(fallbackQuery, fallbackParams);
        }

        return row || null;
    }

    async getActiveGiveaways(guildId = null) {
        if (!this.db) return [];
        if (guildId) {
            return await this.db.all('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 AND cancelled = 0 ORDER BY ends_at ASC', [guildId]) || [];
        }
        return await this.db.all('SELECT * FROM giveaways WHERE ended = 0 AND cancelled = 0 ORDER BY ends_at ASC') || [];
    }

    async updateGiveawayPrize(id, prize) {
        if (!this.db) return;
        await this.db.run('UPDATE giveaways SET prize = ? WHERE id = ?', [prize, id]);
    }

    async updateGiveawayEndsAt(id, endsAt) {
        if (!this.db) return;
        await this.db.run('UPDATE giveaways SET ends_at = ? WHERE id = ?', [endsAt, id]);
    }

    async updateGiveawayImage(id, imageUrl) {
        if (!this.db) return;
        await this.db.run('UPDATE giveaways SET image_url = ? WHERE id = ?', [imageUrl, id]);
    }

    async updateGiveawayRequirement(id, requirement) {
        if (!this.db) return;
        await this.db.run('UPDATE giveaways SET requirement = ? WHERE id = ?', [requirement, id]);
    }

    async cancelGiveaway(id) {
        if (!this.db) return;
        await this.db.run('UPDATE giveaways SET ended = 1, cancelled = 1 WHERE id = ?', [id]);
    }

    async endGiveaway(id, winners = []) {
        if (!this.db) return;
        const winnersJson = JSON.stringify(winners);
        if (winners.length > 0) {
            await this.db.run('UPDATE giveaways SET ended = 1, winners = ? WHERE id = ?', [winnersJson, id]);
        } else {
            await this.db.run('UPDATE giveaways SET ended = 1 WHERE id = ?', [id]);
        }
    }

    async deleteGiveaway(messageId) {
        if (!this.db) return false;
        const gw = await this.getGiveawayByMessageId(messageId);
        if (!gw) return false;
        await this.db.run('DELETE FROM giveaway_entries WHERE giveaway_id = ?', [gw.id]);
        await this.db.run('DELETE FROM giveaways WHERE id = ?', [gw.id]);
        return true;
    }

    async addGiveawayEntry(giveawayId, userId) {
        if (!this.db) return false;
        try {
            await this.db.run(`
                INSERT INTO giveaway_entries (giveaway_id, user_id, entered_at)
                VALUES (?, ?, ?)
            `, [giveawayId, userId, Math.floor(Date.now() / 1000)]);
            return true;
        } catch (_) {
            return false;
        }
    }

    async removeGiveawayEntry(giveawayId, userId) {
        if (!this.db) return false;
        const res = await this.db.run('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?', [giveawayId, userId]);
        return res?.changes > 0;
    }

    async hasUserEnteredGiveaway(giveawayId, userId) {
        if (!this.db) return false;
        const row = await this.db.get('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?', [giveawayId, userId]);
        return Boolean(row);
    }

    async getGiveawayEntries(giveawayId) {
        if (!this.db || !giveawayId) return [];
        const rows = await this.db.all('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ? ORDER BY entered_at ASC', [giveawayId]) || [];
        return rows.map(r => r.user_id);
    }

    async getGiveawayDetailedEntries(giveawayId) {
        if (!this.db || !giveawayId) return [];
        const rows = await this.db.all('SELECT user_id, entered_at FROM giveaway_entries WHERE giveaway_id = ? ORDER BY entered_at ASC', [giveawayId]) || [];
        return rows;
    }

    async getGiveawayEntriesCount(giveawayId) {
        if (!this.db || !giveawayId) return 0;
        const row = await this.db.get('SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = ?', [giveawayId]);
        return row ? row.count : 0;
    }

    async getCommandUses(userId, command) {
        if (!this.db || !userId || !command) return 0;
        const row = await this.db.get('SELECT uses FROM free_command_uses WHERE user_id = ? AND command = ?', [userId, command]);
        return row ? row.uses : 0;
    }

    async incrementCommandUses(userId, command) {
        if (!this.db || !userId || !command) return 1;
        await this.db.run(
            `INSERT INTO free_command_uses (user_id, command, uses) VALUES (?, ?, 1)
             ON CONFLICT(user_id, command) DO UPDATE SET uses = uses + 1`,
            [userId, command]
        );
        const row = await this.db.get('SELECT uses FROM free_command_uses WHERE user_id = ? AND command = ?', [userId, command]);
        return row ? row.uses : 1;
    }

    // --- User Profiles & Premium ---
    async hasUserInteracted(userId) {
        if (!this.db || !userId) return false;
        try {
            const row = await this.db.get(`
                SELECT 1 FROM user_economy WHERE user_id = ?
                UNION SELECT 1 FROM user_work WHERE user_id = ?
                UNION SELECT 1 FROM user_levels WHERE user_id = ?
                UNION SELECT 1 FROM command_analytics WHERE user_id = ?
                UNION SELECT 1 FROM user_inventory WHERE user_id = ?
                UNION SELECT 1 FROM user_marriages WHERE user1_id = ? OR user2_id = ?
                UNION SELECT 1 FROM giveaway_entries WHERE user_id = ?
                UNION SELECT 1 FROM user_invites WHERE user_id = ?
                UNION SELECT 1 FROM user_cards WHERE user_id = ?
                UNION SELECT 1 FROM user_pets WHERE user_id = ?
                LIMIT 1
            `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);
            return Boolean(row);
        } catch (_) {
            return false;
        }
    }

    async getUserProfile(userId, createIfMissing = false) {
        if (!this.db || !userId) return null;
        let row = await this.db.get('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
        if (!row) {
            const hasUsed = await this.hasUserInteracted(userId);
            if (hasUsed || createIfMissing) {
                return await this.ensureUserProfile(userId);
            }
        }
        return row || null;
    }

    async ensureUserProfile(userId) {
        if (!this.db || !userId) return null;

        if (this.userProfilesCache.has(userId)) {
            const row = await this.db.get('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
            if (row) return row;
        }

        let row = await this.db.get('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
        if (row) {
            this.userProfilesCache.add(userId);
            return row;
        }

        const config = require('../../../config.js');
        const isOwner = config.owners?.includes(userId);

        let nextUid;
        if (isOwner) {
            const zeroRow = await this.db.get('SELECT * FROM user_profiles WHERE uid = 0');
            if (!zeroRow) {
                nextUid = 0;
            } else {
                const maxRow = await this.db.get('SELECT MAX(uid) AS max_uid FROM user_profiles WHERE uid IS NOT NULL');
                nextUid = (maxRow?.max_uid !== null && maxRow?.max_uid !== undefined) ? Number(maxRow.max_uid) + 1 : 1;
            }
        } else {
            const maxRow = await this.db.get('SELECT MAX(uid) AS max_uid FROM user_profiles WHERE uid IS NOT NULL');
            if (maxRow?.max_uid !== null && maxRow?.max_uid !== undefined) {
                nextUid = Number(maxRow.max_uid) + 1;
            } else {
                nextUid = 1;
            }
        }

        const now = Math.floor(Date.now() / 1000);
        const tier = isOwner ? 'owner' : 'standard';
        const premiumSince = isOwner ? now : null;

        try {
            await this.db.run(
                'INSERT INTO user_profiles (user_id, uid, tier, premium_since, premium_expires) VALUES (?, ?, ?, ?, ?)',
                [userId, nextUid, tier, premiumSince, null]
            );
            this.userProfilesCache.add(userId);
            return { user_id: userId, uid: nextUid, tier, premium_since: premiumSince, premium_expires: null };
        } catch (_) {
            const existing = await this.db.get('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
            if (existing) this.userProfilesCache.add(userId);
            return existing;
        }
    }

    async getUserProfileByUid(uid) {
        if (!this.db || uid === null || uid === undefined) return null;
        const num = parseInt(uid, 10);
        if (isNaN(num)) return null;
        return await this.db.get('SELECT * FROM user_profiles WHERE uid = ?', [num]);
    }

    async resolveUserOrProfile(input) {
        if (!this.db || !input) return null;
        if (typeof input === 'object' && input !== null) {
            input = input.id || input.userId || input.user_id || input.uid || '';
        }
        const clean = String(input).replace(/[<@!>]/g, '').trim();
        const num = parseInt(clean, 10);
        if (!isNaN(num) && clean.length < 17) {
            const byUid = await this.db.get('SELECT * FROM user_profiles WHERE uid = ?', [num]);
            if (byUid) return { userId: byUid.user_id, profile: byUid };
        }
        const byUserId = await this.db.get('SELECT * FROM user_profiles WHERE user_id = ?', [clean]);
        if (byUserId) return { userId: clean, profile: byUserId };
        return null;
    }

    async setUserPremium(userId, tier = 'premium', durationSeconds = null) {
        if (!this.db || !userId) return false;
        const now = Math.floor(Date.now() / 1000);
        const expires = durationSeconds ? now + durationSeconds : null;
        await this.ensureUserProfile(userId);
        const existing = await this.db.get('SELECT premium_since FROM user_profiles WHERE user_id = ?', [userId]);
        const since = existing?.premium_since || now;
        await this.db.run(
            'UPDATE user_profiles SET tier = ?, premium_since = ?, premium_expires = ? WHERE user_id = ?',
            [tier, since, expires, userId]
        );
        return true;
    }

    async revokeUserPremium(userId) {
        if (!this.db || !userId) return false;
        await this.ensureUserProfile(userId);
        await this.db.run(
            'UPDATE user_profiles SET tier = ?, premium_since = NULL, premium_expires = NULL WHERE user_id = ?',
            ['standard', userId]
        );
        return true;
    }

    async isUserPremium(userId) {
        if (!userId) return false;
        const config = require('../../../config.js');
        if (config.owners?.includes(userId)) return true;
        const profile = await this.getUserProfile(userId);
        if (!profile || profile.tier === 'standard') return false;
        const now = Math.floor(Date.now() / 1000);
        if (profile.premium_expires && profile.premium_expires <= now) {
            await this.db.run(
                'UPDATE user_profiles SET tier = ?, premium_since = NULL, premium_expires = NULL WHERE user_id = ?',
                ['standard', userId]
            );
            return false;
        }
        return true;
    }

    async setGuildPremium(guildId, tier = 'premium', durationSeconds = null, grantedBy = null) {
        if (!guildId) return false;
        const now = Math.floor(Date.now() / 1000);
        const expires = durationSeconds ? now + durationSeconds : null;
        const existing = this.guildPremiumCache.get(guildId);
        const since = existing?.premium_since || now;
        const data = {
            guild_id: guildId,
            tier,
            premium_since: since,
            premium_expires: expires,
            granted_by: grantedBy || existing?.granted_by || null,
            updated_at: Date.now()
        };
        this.guildPremiumCache.set(guildId, data);
        if (this.db) {
            await this.db.run(
                'INSERT OR REPLACE INTO guild_premium (guild_id, tier, premium_since, premium_expires, granted_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [guildId, tier, since, expires, data.granted_by, data.updated_at]
            );
        }
        return true;
    }

    async revokeGuildPremium(guildId) {
        if (!guildId) return false;
        this.guildPremiumCache.delete(guildId);
        if (this.db) {
            await this.db.run('DELETE FROM guild_premium WHERE guild_id = ?', [guildId]);
        }
        return true;
    }

    getGuildPremium(guildId) {
        if (!guildId) return null;
        const data = this.guildPremiumCache.get(guildId);
        if (!data) return null;
        if (data.premium_expires && data.premium_expires <= Math.floor(Date.now() / 1000)) {
            this.guildPremiumCache.delete(guildId);
            if (this.db) {
                this.db.run('DELETE FROM guild_premium WHERE guild_id = ?', [guildId]).catch(() => {});
            }
            return null;
        }
        return data;
    }

    async isGuildPremium(guildId) {
        if (!guildId) return false;
        const data = this.getGuildPremium(guildId);
        return Boolean(data && data.tier && data.tier !== 'standard');
    }

    async setUserBio(userId, bio) {
        if (!this.db || !userId) return false;
        await this.ensureUserProfile(userId);
        await this.db.run('UPDATE user_profiles SET bio = ? WHERE user_id = ?', [bio, userId]);
        return true;
    }

    async giveUserRep(guildId, senderId, targetId) {
        if (!this.db || !senderId || !targetId || senderId === targetId) return { success: false, reason: 'self' };
        const cd = await this.getEcoCooldown(guildId, senderId, 'rep');
        if (cd > 0) return { success: false, reason: 'cooldown', remaining: cd };

        await this.ensureUserProfile(targetId);
        await this.db.run('UPDATE user_profiles SET rep = COALESCE(rep, 0) + 1 WHERE user_id = ?', [targetId]);
        // 12 hour cooldown (43200 seconds)
        await this.setEcoCooldown(guildId, senderId, 'rep', 43200);
        const updated = await this.getUserProfile(targetId);
        return { success: true, rep: updated?.rep || 1 };
    }

    async getUserCommandUses(userId, commandName) {
        if (!this.db || !userId || !commandName) return 0;
        const row = await this.db.get(
            'SELECT uses FROM free_command_uses WHERE user_id = ? AND command = ?',
            [userId, commandName]
        );
        return row ? (row.uses || 0) : 0;
    }

    async incrementUserCommandUses(userId, commandName) {
        if (!this.db || !userId || !commandName) return 1;
        const existing = await this.getUserCommandUses(userId, commandName);
        if (existing === 0) {
            await this.db.run(
                'INSERT INTO free_command_uses (user_id, command, uses) VALUES (?, ?, 1)',
                [userId, commandName]
            );
            return 1;
        } else {
            await this.db.run(
                'UPDATE free_command_uses SET uses = uses + 1 WHERE user_id = ? AND command = ?',
                [userId, commandName]
            );
            return existing + 1;
        }
    }

    // --- Saved Embeds ---
    async saveEmbed(guildId, name, data, authorId) {
        if (!this.db) return false;
        const now = Math.floor(Date.now() / 1000);
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        await this.db.run(
            `INSERT INTO guild_embeds (guild_id, name, data, author_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(guild_id, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            [guildId, name.toLowerCase(), dataStr, authorId, now, now]
        );
        return true;
    }

    async getEmbed(guildId, name) {
        if (!this.db) return null;
        const row = await this.db.get(
            'SELECT * FROM guild_embeds WHERE guild_id = ? AND name = ?',
            [guildId, name.toLowerCase()]
        );
        if (!row) return null;
        try {
            return {
                ...row,
                parsedData: JSON.parse(row.data)
            };
        } catch {
            return row;
        }
    }

    async listEmbeds(guildId) {
        if (!this.db) return [];
        return await this.db.all(
            'SELECT name, author_id, updated_at FROM guild_embeds WHERE guild_id = ? ORDER BY updated_at DESC',
            [guildId]
        );
    }

    async deleteEmbed(guildId, name) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM guild_embeds WHERE guild_id = ? AND name = ?',
            [guildId, name.toLowerCase()]
        );
        return (res.changes || 0) > 0;
    }

    // --- Moderation System ---
    async createModCase({ guildId, userId, userTag = null, moderatorId, moderatorTag = null, action, reason = null, duration = 0 }) {
        if (!this.db) return 0;
        const nextRow = await this.db.get(
            'SELECT COALESCE(MAX(case_id), 0) + 1 AS nextId FROM moderation_cases WHERE guild_id = ?',
            [guildId]
        );
        const caseId = Number(nextRow?.nextId || 1);
        const now = Date.now();
        await this.db.run(
            `INSERT INTO moderation_cases (case_id, guild_id, user_id, user_tag, moderator_id, moderator_tag, action, reason, duration, active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [caseId, guildId, userId, userTag, moderatorId, moderatorTag, action.toLowerCase(), reason || 'no reason provided', duration || 0, now]
        );
        return caseId;
    }

    async getModCase(guildId, caseId) {
        if (!this.db) return null;
        return await this.db.get(
            'SELECT * FROM moderation_cases WHERE guild_id = ? AND case_id = ?',
            [guildId, caseId]
        );
    }

    async getUserCases(guildId, userId) {
        if (!this.db) return [];
        return await this.db.all(
            'SELECT * FROM moderation_cases WHERE guild_id = ? AND user_id = ? ORDER BY case_id DESC',
            [guildId, userId]
        );
    }

    async getGuildCases(guildId, limit = 10, offset = 0) {
        if (!this.db) return [];
        return await this.db.all(
            'SELECT * FROM moderation_cases WHERE guild_id = ? ORDER BY case_id DESC LIMIT ? OFFSET ?',
            [guildId, limit, offset]
        );
    }

    async updateCaseReason(guildId, caseId, newReason) {
        if (!this.db) return false;
        const res = await this.db.run(
            'UPDATE moderation_cases SET reason = ? WHERE guild_id = ? AND case_id = ?',
            [newReason, guildId, caseId]
        );
        return (res.changes || 0) > 0;
    }

    async getUserWarns(guildId, userId) {
        if (!this.db) return [];
        return await this.db.all(
            "SELECT * FROM moderation_cases WHERE guild_id = ? AND user_id = ? AND action = 'warn' AND active = 1 ORDER BY case_id ASC",
            [guildId, userId]
        );
    }

    async clearUserWarns(guildId, userId, caseId = null) {
        if (!this.db) return 0;
        let res;
        if (caseId) {
            res = await this.db.run(
                "UPDATE moderation_cases SET active = 0 WHERE guild_id = ? AND user_id = ? AND case_id = ? AND action = 'warn'",
                [guildId, userId, caseId]
            );
        } else {
            res = await this.db.run(
                "UPDATE moderation_cases SET active = 0 WHERE guild_id = ? AND user_id = ? AND action = 'warn' AND active = 1",
                [guildId, userId]
            );
        }
        return res?.changes || 0;
    }

    async saveJailedUser(guildId, userId, roles, reason = null, moderatorId = null) {
        if (!this.db) return false;
        const rolesJson = Array.isArray(roles) ? JSON.stringify(roles) : String(roles);
        await this.db.run(
            `INSERT INTO jailed_users (guild_id, user_id, roles, jailed_at, reason, moderator_id)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(guild_id, user_id) DO UPDATE SET roles = excluded.roles, jailed_at = excluded.jailed_at, reason = excluded.reason, moderator_id = excluded.moderator_id`,
            [guildId, userId, rolesJson, Date.now(), reason, moderatorId]
        );
        return true;
    }

    async getJailedUser(guildId, userId) {
        if (!this.db) return null;
        const row = await this.db.get(
            'SELECT * FROM jailed_users WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (!row) return null;
        try {
            return {
                ...row,
                roles: JSON.parse(row.roles)
            };
        } catch {
            return { ...row, roles: [] };
        }
    }

    async removeJailedUser(guildId, userId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM jailed_users WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async getJailConfig(guildId) {
        if (!this.db) return null;
        return await this.db.get(
            'SELECT role_id AS roleId, channel_id AS channelId FROM guild_jail_config WHERE guild_id = ?',
            [guildId]
        );
    }

    async setJailConfig(guildId, roleId, channelId) {
        if (!this.db) return false;
        await this.db.run(
            `INSERT INTO guild_jail_config (guild_id, role_id, channel_id)
             VALUES (?, ?, ?)
             ON CONFLICT(guild_id) DO UPDATE SET role_id = excluded.role_id, channel_id = excluded.channel_id`,
            [guildId, roleId, channelId]
        );
        return true;
    }

    async getStaffRoles(guildId) {
        if (!this.db) return [];
        const rows = await this.db.all(
            'SELECT role_id FROM guild_staff_roles WHERE guild_id = ?',
            [guildId]
        );
        return rows.map(r => r.role_id);
    }

    async addStaffRole(guildId, roleId) {
        if (!this.db) return false;
        await this.db.run(
            'INSERT OR IGNORE INTO guild_staff_roles (guild_id, role_id) VALUES (?, ?)',
            [guildId, roleId]
        );
        return true;
    }

    async removeStaffRole(guildId, roleId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM guild_staff_roles WHERE guild_id = ? AND role_id = ?',
            [guildId, roleId]
        );
        return (res.changes || 0) > 0;
    }

    async isHardbanned(guildId, userId) {
        if (!this.db) return false;
        const row = await this.db.get(
            'SELECT 1 FROM guild_hardbans WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return !!row;
    }

    async setHardban(guildId, userId, moderatorId, reason) {
        if (!this.db) return false;
        await this.db.run(
            `INSERT OR REPLACE INTO guild_hardbans (guild_id, user_id, moderator_id, reason, timestamp)
             VALUES (?, ?, ?, ?, ?)`,
            [guildId, userId, moderatorId, reason || 'no reason provided', Date.now()]
        );
        return true;
    }

    async removeHardban(guildId, userId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM guild_hardbans WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async getForcenick(guildId, userId) {
        if (!this.db) return null;
        return await this.db.get(
            'SELECT nickname, set_by, timestamp FROM user_forcenicks WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
    }

    async setForcenick(guildId, userId, nickname, setBy) {
        if (!this.db) return false;
        await this.db.run(
            `INSERT OR REPLACE INTO user_forcenicks (guild_id, user_id, nickname, set_by, timestamp)
             VALUES (?, ?, ?, ?, ?)`,
            [guildId, userId, nickname, setBy, Date.now()]
        );
        return true;
    }

    async removeForcenick(guildId, userId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM user_forcenicks WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async setActiveMute(guildId, userId, expiresAt, reason = null, moderatorId = null) {
        if (!this.db) return false;
        await this.db.run(
            `INSERT OR REPLACE INTO guild_active_mutes (guild_id, user_id, expires_at, reason, moderator_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [guildId, userId, expiresAt, reason || 'no reason provided', moderatorId, Date.now()]
        );
        return true;
    }

    async getActiveMute(guildId, userId) {
        if (!this.db) return null;
        return await this.db.get(
            'SELECT * FROM guild_active_mutes WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
    }

    async removeActiveMute(guildId, userId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM guild_active_mutes WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async saveBlindedUser(guildId, userId, roles, reason = null, moderatorId = null) {
        if (!this.db) return false;
        const rolesJson = Array.isArray(roles) ? JSON.stringify(roles) : String(roles);
        await this.db.run(
            `INSERT INTO blinded_users (guild_id, user_id, roles, reason, moderator_id, blinded_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(guild_id, user_id) DO UPDATE SET roles = excluded.roles, reason = excluded.reason, moderator_id = excluded.moderator_id, blinded_at = excluded.blinded_at`,
            [guildId, userId, rolesJson, reason || 'no reason provided', moderatorId, Date.now()]
        );
        return true;
    }

    async getBlindedUser(guildId, userId) {
        if (!this.db) return null;
        const row = await this.db.get(
            'SELECT * FROM blinded_users WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (!row) return null;
        try {
            return {
                ...row,
                roles: JSON.parse(row.roles)
            };
        } catch {
            return { ...row, roles: [] };
        }
    }

    async getAllBlindedUsers(guildId) {
        if (!this.db) return [];
        const rows = await this.db.all(
            'SELECT * FROM blinded_users WHERE guild_id = ?',
            [guildId]
        );
        if (!rows || !rows.length) return [];
        return rows.map(row => {
            try {
                return {
                    ...row,
                    roles: JSON.parse(row.roles)
                };
            } catch {
                return { ...row, roles: [] };
            }
        });
    }

    async removeBlindedUser(guildId, userId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM blinded_users WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    // --- Uwu Lock & Mock Lock System (In-Memory Cache Accelerated) ---
    isUwuLocked(guildId, userId) {
        if (!guildId || !userId) return false;
        return this.uwuLocksCache.has(`${guildId}:${userId}`);
    }

    async setUwuLock(guildId, userId, lockedBy) {
        if (!guildId || !userId) return false;
        this.uwuLocksCache.add(`${guildId}:${userId}`);
        if (!this.db) return true;
        await this.db.run(
            `INSERT OR REPLACE INTO user_uwulocks (guild_id, user_id, locked_by, timestamp)
             VALUES (?, ?, ?, ?)`,
            [guildId, userId, lockedBy, Date.now()]
        );
        return true;
    }

    async removeUwuLock(guildId, userId) {
        if (!guildId || !userId) return false;
        this.uwuLocksCache.delete(`${guildId}:${userId}`);
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM user_uwulocks WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    isMockLocked(guildId, userId) {
        if (!guildId || !userId) return false;
        return this.mockLocksCache.has(`${guildId}:${userId}`);
    }

    async setMockLock(guildId, userId, lockedBy) {
        if (!guildId || !userId) return false;
        this.mockLocksCache.add(`${guildId}:${userId}`);
        if (!this.db) return true;
        await this.db.run(
            `INSERT OR REPLACE INTO user_mocklocks (guild_id, user_id, locked_by, timestamp)
             VALUES (?, ?, ?, ?)`,
            [guildId, userId, lockedBy, Date.now()]
        );
        return true;
    }

    async removeMockLock(guildId, userId) {
        if (!guildId || !userId) return false;
        this.mockLocksCache.delete(`${guildId}:${userId}`);
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM user_mocklocks WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    isNerdLocked(guildId, userId) {
        if (!guildId || !userId) return false;
        return this.nerdLocksCache.has(`${guildId}:${userId}`);
    }

    async setNerdLock(guildId, userId, lockedBy) {
        if (!guildId || !userId) return false;
        this.nerdLocksCache.add(`${guildId}:${userId}`);
        if (!this.db) return true;
        await this.db.run(
            `INSERT OR REPLACE INTO user_nerdlocks (guild_id, user_id, locked_by, timestamp)
             VALUES (?, ?, ?, ?)`,
            [guildId, userId, lockedBy, Date.now()]
        );
        return true;
    }

    async removeNerdLock(guildId, userId) {
        if (!guildId || !userId) return false;
        this.nerdLocksCache.delete(`${guildId}:${userId}`);
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM user_nerdlocks WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    isClownLocked(guildId, userId) {
        if (!guildId || !userId) return false;
        return this.clownLocksCache.has(`${guildId}:${userId}`);
    }

    async setClownLock(guildId, userId, lockedBy) {
        if (!guildId || !userId) return false;
        this.clownLocksCache.add(`${guildId}:${userId}`);
        if (!this.db) return true;
        await this.db.run(
            `INSERT OR REPLACE INTO user_clownlocks (guild_id, user_id, locked_by, timestamp)
             VALUES (?, ?, ?, ?)`,
            [guildId, userId, lockedBy, Date.now()]
        );
        return true;
    }

    async removeClownLock(guildId, userId) {
        if (!guildId || !userId) return false;
        this.clownLocksCache.delete(`${guildId}:${userId}`);
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM user_clownlocks WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async getSpeechLocks(guildId) {
        if (!this.db) return [];
        const [uwus, mocks, nerds, clowns] = await Promise.all([
            this.db.all('SELECT user_id, locked_by, timestamp, "uwu" as type FROM user_uwulocks WHERE guild_id = ?', [guildId]).catch(() => []),
            this.db.all('SELECT user_id, locked_by, timestamp, "mock" as type FROM user_mocklocks WHERE guild_id = ?', [guildId]).catch(() => []),
            this.db.all('SELECT user_id, locked_by, timestamp, "nerd" as type FROM user_nerdlocks WHERE guild_id = ?', [guildId]).catch(() => []),
            this.db.all('SELECT user_id, locked_by, timestamp, "clown" as type FROM user_clownlocks WHERE guild_id = ?', [guildId]).catch(() => [])
        ]);
        return [...uwus, ...mocks, ...nerds, ...clowns];
    }

    async removeAllSpeechLocks(guildId, userId) {
        if (!this.db) return false;
        const [r1, r2, r3, r4] = await Promise.all([
            this.db.run('DELETE FROM user_uwulocks WHERE guild_id = ? AND user_id = ?', [guildId, userId]),
            this.db.run('DELETE FROM user_mocklocks WHERE guild_id = ? AND user_id = ?', [guildId, userId]),
            this.db.run('DELETE FROM user_nerdlocks WHERE guild_id = ? AND user_id = ?', [guildId, userId]),
            this.db.run('DELETE FROM user_clownlocks WHERE guild_id = ? AND user_id = ?', [guildId, userId])
        ]);
        return (r1.changes || 0) > 0 || (r2.changes || 0) > 0 || (r3.changes || 0) > 0 || (r4.changes || 0) > 0;
    }

    // --- Cage System ---
    async saveCagedUser(guildId, userId, roles, lockedBy) {
        if (!this.db) return false;
        const rolesJson = Array.isArray(roles) ? JSON.stringify(roles) : String(roles);
        await this.db.run(
            `INSERT INTO caged_users (guild_id, user_id, roles, locked_by, timestamp)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(guild_id, user_id) DO UPDATE SET roles = excluded.roles, locked_by = excluded.locked_by, timestamp = excluded.timestamp`,
            [guildId, userId, rolesJson, lockedBy, Date.now()]
        );
        return true;
    }

    async getCagedUser(guildId, userId) {
        if (!this.db) return null;
        const row = await this.db.get(
            'SELECT * FROM caged_users WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (!row) return null;
        try {
            return {
                ...row,
                roles: JSON.parse(row.roles)
            };
        } catch {
            return { ...row, roles: [] };
        }
    }

    async removeCagedUser(guildId, userId) {
        if (!this.db) return false;
        const res = await this.db.run(
            'DELETE FROM caged_users WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        return (res.changes || 0) > 0;
    }

    async getCageConfig(guildId) {
        if (!this.db) return null;
        return await this.db.get(
            'SELECT role_id AS roleId, channel_id AS channelId FROM guild_cage_config WHERE guild_id = ?',
            [guildId]
        );
    }

    async setCageConfig(guildId, roleId, channelId) {
        if (!this.db) return false;
        await this.db.run(
            `INSERT INTO guild_cage_config (guild_id, role_id, channel_id)
             VALUES (?, ?, ?)
             ON CONFLICT(guild_id) DO UPDATE SET role_id = excluded.role_id, channel_id = excluded.channel_id`,
            [guildId, roleId, channelId]
        );
        return true;
    }

    async clearCageConfig(guildId) {
        if (!this.db) return false;
        await this.db.run('DELETE FROM guild_cage_config WHERE guild_id = ?', [guildId]);
        return true;
    }

    // --- Support Server Perks & Daily Free Uses ---
    async isSupportMember(client, userId) {
        if (!client || !userId) return false;
        const config = require('../../../config.js');
        const guildId = config.supportGuildId;
        if (!guildId) return false;
        const supportGuild = client.guilds?.cache.get(guildId);
        if (!supportGuild) return false;
        let member = supportGuild.members.cache.get(userId);
        if (!member) {
            member = await supportGuild.members.fetch(userId).catch(() => null);
        }
        return !!member;
    }

    async hasClaimedSupportJoinBonus(userId) {
        if (!this.db || !userId) return false;
        const row = await this.db.get('SELECT join_bonus_claimed FROM user_support_perks WHERE user_id = ?', [userId]);
        return row ? (row.join_bonus_claimed === 1) : false;
    }

    async claimSupportJoinBonus(userId) {
        if (!this.db || !userId) return false;
        await this.db.run(
            `INSERT INTO user_support_perks (user_id, join_bonus_claimed, join_bonus_timestamp)
             VALUES (?, 1, ?)
             ON CONFLICT(user_id) DO UPDATE SET join_bonus_claimed = 1, join_bonus_timestamp = excluded.join_bonus_timestamp`,
            [userId, Date.now()]
        );
        return true;
    }

    async getDailyCommandUseDate(userId, commandName) {
        if (!this.db || !userId || !commandName) return null;
        const row = await this.db.get(
            'SELECT last_daily_date FROM user_daily_command_uses WHERE user_id = ? AND command = ?',
            [userId, commandName]
        );
        return row ? row.last_daily_date : null;
    }

    async recordDailyCommandUse(userId, commandName, dateStr) {
        if (!this.db || !userId || !commandName) return false;
        await this.db.run(
            `INSERT INTO user_daily_command_uses (user_id, command, last_daily_date)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id, command) DO UPDATE SET last_daily_date = excluded.last_daily_date`,
            [userId, commandName, dateStr]
        );
        return true;
    }

    // --- Member Quota & Daily Retention Engine ---
    async getOrUpdateMemberQuota(userId, commandKey, baseLimit, maxQuota) {
        if (!this.db || !userId || !commandKey) return { quota: 0, canUse: false };
        const today = new Date().toISOString().slice(0, 10);

        let row = await this.db.get(
            'SELECT quota, last_replenish_date FROM user_command_quotas WHERE user_id = ? AND command = ?',
            [userId, commandKey]
        );

        if (!row) {
            const initialQuota = Math.min(baseLimit, maxQuota);
            await this.db.run(
                `INSERT INTO user_command_quotas (user_id, command, quota, last_replenish_date)
                 VALUES (?, ?, ?, ?)`,
                [userId, commandKey, initialQuota, today]
            );
            return { quota: initialQuota, canUse: initialQuota > 0 };
        }

        let currentQuota = row.quota;
        const lastDate = row.last_replenish_date;

        if (lastDate !== today) {
            const msPerDay = 86400000;
            const daysPassed = Math.max(1, Math.floor((new Date(today) - new Date(lastDate)) / msPerDay));
            const replenishedQuota = Math.min(maxQuota, currentQuota + daysPassed);

            await this.db.run(
                `UPDATE user_command_quotas SET quota = ?, last_replenish_date = ?
                 WHERE user_id = ? AND command = ?`,
                [replenishedQuota, today, userId, commandKey]
            );
            currentQuota = replenishedQuota;
        }

        return { quota: currentQuota, canUse: currentQuota > 0 };
    }

    async consumeMemberQuota(userId, commandKey) {
        if (!this.db || !userId || !commandKey) return 0;
        const row = await this.db.get(
            'SELECT quota FROM user_command_quotas WHERE user_id = ? AND command = ?',
            [userId, commandKey]
        );
        if (!row || row.quota <= 0) return 0;
        const newQuota = row.quota - 1;
        await this.db.run(
            'UPDATE user_command_quotas SET quota = ? WHERE user_id = ? AND command = ?',
            [newQuota, userId, commandKey]
        );
        return newQuota;
    }

    // --- Leveling & Server Progression Engine ---
    async getLevelingSettings(guildId) {
        if (!guildId) return null;
        if (this.levelingSettingsCache.has(guildId)) {
            return this.levelingSettingsCache.get(guildId);
        }

        const defaultSettings = {
            guild_id: guildId,
            enabled: 1,
            channel_id: null,
            multiplier: 1.0,
            ignored_channels: [],
            ignored_roles: [],
            stack_roles: 1
        };

        if (!this.db) return defaultSettings;

        try {
            const row = await this.db.get('SELECT * FROM leveling_settings WHERE guild_id = ?', [guildId]);
            if (!row) {
                this.levelingSettingsCache.set(guildId, defaultSettings);
                return defaultSettings;
            }

            let ignoredChannels = [];
            let ignoredRoles = [];
            try { ignoredChannels = JSON.parse(row.ignored_channels || '[]'); } catch (_) {}
            try { ignoredRoles = JSON.parse(row.ignored_roles || '[]'); } catch (_) {}

            const settings = {
                guild_id: row.guild_id,
                enabled: row.enabled !== undefined ? Number(row.enabled) : 1,
                channel_id: row.channel_id || null,
                multiplier: row.multiplier !== undefined ? Number(row.multiplier) : 1.0,
                ignored_channels: Array.isArray(ignoredChannels) ? ignoredChannels : [],
                ignored_roles: Array.isArray(ignoredRoles) ? ignoredRoles : [],
                stack_roles: row.stack_roles !== undefined ? Number(row.stack_roles) : 1
            };

            this.levelingSettingsCache.set(guildId, settings);
            return settings;
        } catch (_) {
            return defaultSettings;
        }
    }

    async setLevelingSettings(guildId, settings) {
        if (!this.db || !guildId) return false;
        const current = await this.getLevelingSettings(guildId);
        const updated = { ...current, ...settings, guild_id: guildId };

        const ignoredChStr = JSON.stringify(updated.ignored_channels || []);
        const ignoredRoStr = JSON.stringify(updated.ignored_roles || []);

        await this.db.run(
            `INSERT INTO leveling_settings (guild_id, enabled, channel_id, multiplier, ignored_channels, ignored_roles, stack_roles)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(guild_id) DO UPDATE SET
                enabled = excluded.enabled,
                channel_id = excluded.channel_id,
                multiplier = excluded.multiplier,
                ignored_channels = excluded.ignored_channels,
                ignored_roles = excluded.ignored_roles,
                stack_roles = excluded.stack_roles`,
            [
                guildId,
                updated.enabled ? 1 : 0,
                updated.channel_id || null,
                updated.multiplier || 1.0,
                ignoredChStr,
                ignoredRoStr,
                updated.stack_roles ? 1 : 0
            ]
        );

        this.levelingSettingsCache.set(guildId, updated);
        return updated;
    }

    async getUserLevel(guildId, userId) {
        const defaultUser = {
            guild_id: guildId,
            user_id: userId,
            xp: 0,
            level: 0,
            messages: 0,
            voice_seconds: 0,
            last_xp_at: 0
        };
        if (!this.db || !guildId || !userId) return defaultUser;

        const row = await this.db.get(
            'SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (!row) return defaultUser;

        return {
            guild_id: row.guild_id,
            user_id: row.user_id,
            xp: Number(row.xp || 0),
            level: Number(row.level || 0),
            messages: Number(row.messages || 0),
            voice_seconds: Number(row.voice_seconds || 0),
            last_xp_at: Number(row.last_xp_at || 0)
        };
    }

    async getUserLevelRank(guildId, userId) {
        if (!this.db || !guildId || !userId) return 1;
        const userRow = await this.db.get(
            'SELECT xp FROM user_levels WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (!userRow) {
            const countRow = await this.db.get(
                'SELECT COUNT(*) as count FROM user_levels WHERE guild_id = ?',
                [guildId]
            );
            return (countRow?.count || 0) + 1;
        }

        const rankRow = await this.db.get(
            'SELECT COUNT(*) + 1 as rank FROM user_levels WHERE guild_id = ? AND xp > ?',
            [guildId, userRow.xp]
        );
        return rankRow?.rank || 1;
    }

    async addMessageXp(guildId, userId, xpToAdd) {
        if (!this.db || !guildId || !userId || xpToAdd <= 0) {
            return { oldLevel: 0, newLevel: 0, leveledUp: false, xp: 0, level: 0, messages: 0, voice_seconds: 0 };
        }

        const existing = await this.db.get(
            'SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );

        const now = Date.now();
        if (existing) {
            const oldLevel = Number(existing.level || 0);
            const newXp = Number(existing.xp || 0) + xpToAdd;
            const newMessages = Number(existing.messages || 0) + 1;
            const progress = LevelingHelper.getLevelFromTotalXp(newXp);
            const newLevel = progress.level;
            const leveledUp = newLevel > oldLevel;

            await this.db.run(
                `UPDATE user_levels SET xp = ?, level = ?, messages = ?, last_xp_at = ?
                 WHERE guild_id = ? AND user_id = ?`,
                [newXp, newLevel, newMessages, now, guildId, userId]
            );

            return {
                oldLevel,
                newLevel,
                leveledUp,
                xp: newXp,
                level: newLevel,
                messages: newMessages,
                voice_seconds: Number(existing.voice_seconds || 0)
            };
        } else {
            const newXp = xpToAdd;
            const progress = LevelingHelper.getLevelFromTotalXp(newXp);
            const newLevel = progress.level;
            const leveledUp = newLevel > 0;

            await this.db.run(
                `INSERT INTO user_levels (guild_id, user_id, xp, level, messages, voice_seconds, last_xp_at)
                 VALUES (?, ?, ?, ?, 1, 0, ?)`,
                [guildId, userId, newXp, newLevel, now]
            );

            return {
                oldLevel: 0,
                newLevel,
                leveledUp,
                xp: newXp,
                level: newLevel,
                messages: 1,
                voice_seconds: 0
            };
        }
    }

    async addVoiceXp(guildId, userId, xpToAdd, seconds) {
        if (!this.db || !guildId || !userId) {
            return { oldLevel: 0, newLevel: 0, leveledUp: false, xp: 0, level: 0, messages: 0, voice_seconds: 0 };
        }

        const existing = await this.db.get(
            'SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );

        const now = Date.now();
        if (existing) {
            const oldLevel = Number(existing.level || 0);
            const newXp = Number(existing.xp || 0) + (xpToAdd > 0 ? xpToAdd : 0);
            const newVoice = Number(existing.voice_seconds || 0) + seconds;
            const progress = LevelingHelper.getLevelFromTotalXp(newXp);
            const newLevel = progress.level;
            const leveledUp = newLevel > oldLevel;

            await this.db.run(
                `UPDATE user_levels SET xp = ?, level = ?, voice_seconds = ?
                 WHERE guild_id = ? AND user_id = ?`,
                [newXp, newLevel, newVoice, guildId, userId]
            );

            return {
                oldLevel,
                newLevel,
                leveledUp,
                xp: newXp,
                level: newLevel,
                messages: Number(existing.messages || 0),
                voice_seconds: newVoice
            };
        } else {
            const newXp = xpToAdd > 0 ? xpToAdd : 0;
            const progress = LevelingHelper.getLevelFromTotalXp(newXp);
            const newLevel = progress.level;
            const leveledUp = newLevel > 0;

            await this.db.run(
                `INSERT INTO user_levels (guild_id, user_id, xp, level, messages, voice_seconds, last_xp_at)
                 VALUES (?, ?, ?, ?, 0, ?, ?)`,
                [guildId, userId, newXp, newLevel, seconds, now]
            );

            return {
                oldLevel: 0,
                newLevel,
                leveledUp,
                xp: newXp,
                level: newLevel,
                messages: 0,
                voice_seconds: seconds
            };
        }
    }

    async setUserLevel(guildId, userId, xp, level = null) {
        if (!this.db || !guildId || !userId) return false;
        const finalXp = Math.max(0, Math.floor(xp || 0));
        const finalLevel = level !== null ? Math.max(0, Math.floor(level)) : LevelingHelper.getLevelFromTotalXp(finalXp).level;

        await this.db.run(
            `INSERT INTO user_levels (guild_id, user_id, xp, level, messages, voice_seconds, last_xp_at)
             VALUES (?, ?, ?, ?, 0, 0, ?)
             ON CONFLICT(guild_id, user_id) DO UPDATE SET
                xp = excluded.xp,
                level = excluded.level`,
            [guildId, userId, finalXp, finalLevel, Date.now()]
        );
        return true;
    }

    async resetUserLevel(guildId, userId) {
        if (!this.db || !guildId || !userId) return false;
        await this.db.run('DELETE FROM user_levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        return true;
    }

    async resetGuildLevels(guildId) {
        if (!this.db || !guildId) return false;
        await this.db.run('DELETE FROM user_levels WHERE guild_id = ?', [guildId]);
        return true;
    }

    async getLevelLeaderboard(guildId, limit = 10, offset = 0) {
        if (!this.db || !guildId) return [];
        const rows = await this.db.all(
            'SELECT user_id, xp, level, messages, voice_seconds FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?',
            [guildId, limit, offset]
        );
        return rows || [];
    }

    async getLevelLeaderboardCount(guildId) {
        if (!this.db || !guildId) return 0;
        const row = await this.db.get(
            'SELECT COUNT(*) as count FROM user_levels WHERE guild_id = ?',
            [guildId]
        );
        return row?.count || 0;
    }

    async getLevelRewards(guildId) {
        if (!this.db || !guildId) return [];
        const rows = await this.db.all(
            'SELECT level, role_id FROM level_rewards WHERE guild_id = ? ORDER BY level ASC',
            [guildId]
        );
        return rows || [];
    }

    async addLevelReward(guildId, level, roleId) {
        if (!this.db || !guildId || level === undefined || !roleId) return false;
        await this.db.run(
            'INSERT OR REPLACE INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)',
            [guildId, Math.max(1, Math.floor(level)), roleId]
        );
        return true;
    }

    async removeLevelReward(guildId, level, roleId = null) {
        if (!this.db || !guildId || level === undefined) return false;
        if (roleId) {
            await this.db.run(
                'DELETE FROM level_rewards WHERE guild_id = ? AND level = ? AND role_id = ?',
                [guildId, level, roleId]
            );
        } else {
            await this.db.run(
                'DELETE FROM level_rewards WHERE guild_id = ? AND level = ?',
                [guildId, level]
            );
        }
        return true;
    }

    // --- Customizable Moderation Invoke Responses Engine ---
    getInvoke(guildId, action, type) {
        if (!guildId || !action || !type) return null;
        const guildMap = this.invokesCache.get(guildId);
        if (!guildMap) return null;
        return guildMap.get(`${action.toLowerCase()}:${type.toLowerCase()}`) || null;
    }

    async getGuildInvokes(guildId) {
        if (!this.db || !guildId) return [];
        try {
            return await this.db.all(
                'SELECT action, type, content, updated_at FROM guild_invokes WHERE guild_id = ? ORDER BY action ASC, type ASC',
                [guildId]
            ) || [];
        } catch (_) {
            return [];
        }
    }

    async setInvoke(guildId, action, type, content) {
        if (!this.db || !guildId || !action || !type) return false;
        const normAction = action.toLowerCase();
        const normType = type.toLowerCase();
        const now = Math.floor(Date.now() / 1000);

        await this.db.run(`
            INSERT INTO guild_invokes (guild_id, action, type, content, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(guild_id, action, type) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
        `, [guildId, normAction, normType, content, now]);

        if (!this.invokesCache.has(guildId)) {
            this.invokesCache.set(guildId, new Map());
        }
        this.invokesCache.get(guildId).set(`${normAction}:${normType}`, content);
        return true;
    }

    async deleteInvoke(guildId, action, type = null) {
        if (!this.db || !guildId || !action) return false;
        const normAction = action.toLowerCase();
        const guildMap = this.invokesCache.get(guildId);

        if (type) {
            const normType = type.toLowerCase();
            await this.db.run(
                'DELETE FROM guild_invokes WHERE guild_id = ? AND action = ? AND type = ?',
                [guildId, normAction, normType]
            );
            if (guildMap) guildMap.delete(`${normAction}:${normType}`);
        } else {
            await this.db.run(
                'DELETE FROM guild_invokes WHERE guild_id = ? AND action = ?',
                [guildId, normAction]
            );
            if (guildMap) {
                guildMap.delete(`${normAction}:message`);
                guildMap.delete(`${normAction}:dm`);
            }
        }
        return true;
    }

    async clearGuildInvokes(guildId) {
        if (!this.db || !guildId) return false;
        await this.db.run('DELETE FROM guild_invokes WHERE guild_id = ?', [guildId]);
        this.invokesCache.delete(guildId);
        return true;
    }

    async addMusicHistory(guildId, track) {
        if (!this.db || !guildId || !track) return;
        try {
            await this.db.run(
                `INSERT INTO music_history (guild_id, title, url, author, duration, requester_id, played_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    guildId,
                    track.title || 'unknown track',
                    track.url || '',
                    track.author || 'youtube',
                    track.duration || 0,
                    track.requester?.id || null,
                    Date.now()
                ]
            );
        } catch (_) {}
    }

    async getMusicHistory(guildId, limit = 20) {
        if (!this.db || !guildId) return [];
        try {
            return await this.db.all(
                `SELECT * FROM music_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?`,
                [guildId, limit]
            );
        } catch (_) {
            return [];
        }
    }

    // ──────────────────────── GUILD COUNTERS ────────────────────────
    async addGuildCounter(guildId, channelId, counterType, format) {
        if (!this.db) return;
        await this.db.run(
            `INSERT OR REPLACE INTO guild_counters (guild_id, channel_id, counter_type, channel_name_format, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [guildId, channelId, counterType, format, Date.now()]
        );
    }

    async removeGuildCounter(channelId) {
        if (!this.db) return;
        await this.db.run(`DELETE FROM guild_counters WHERE channel_id = ?`, [channelId]);
    }

    async getGuildCounters(guildId) {
        if (!this.db) return [];
        return await this.db.all(`SELECT * FROM guild_counters WHERE guild_id = ?`, [guildId]) || [];
    }

    async getAllGuildCounters() {
        if (!this.db) return [];
        return await this.db.all(`SELECT * FROM guild_counters`) || [];
    }

    // ──────────────────────── STICKY MESSAGES ────────────────────────
    async setSticky(guildId, channelId, content, createdBy) {
        this.stickiesCache.set(channelId, {
            guild_id: guildId,
            channel_id: channelId,
            content,
            last_message_id: null,
            created_by: createdBy,
            created_at: Date.now()
        });
        if (!this.db) return;
        await this.db.run(
            `INSERT OR REPLACE INTO guild_stickies (guild_id, channel_id, content, last_message_id, created_by, created_at)
             VALUES (?, ?, ?, NULL, ?, ?)`,
            [guildId, channelId, content, createdBy, Date.now()]
        );
    }

    async updateStickyLastMessage(channelId, messageId) {
        const cached = this.stickiesCache.get(channelId);
        if (cached) cached.last_message_id = messageId;
        if (!this.db) return;
        await this.db.run(`UPDATE guild_stickies SET last_message_id = ? WHERE channel_id = ?`, [messageId, channelId]);
    }

    async getSticky(channelId) {
        if (!channelId) return null;
        if (this.stickiesCache.has(channelId)) {
            return this.stickiesCache.get(channelId);
        }
        if (!this.db) return null;
        const row = await this.db.get(`SELECT * FROM guild_stickies WHERE channel_id = ?`, [channelId]);
        if (row) this.stickiesCache.set(channelId, row);
        return row || null;
    }

    async removeSticky(channelId) {
        this.stickiesCache.delete(channelId);
        if (!this.db) return;
        await this.db.run(`DELETE FROM guild_stickies WHERE channel_id = ?`, [channelId]);
    }

    async getGuildStickies(guildId) {
        if (!this.db) return [];
        return await this.db.all(`SELECT * FROM guild_stickies WHERE guild_id = ?`, [guildId]) || [];
    }

    async clearJailConfig(guildId) {
        if (!this.db) return false;
        await this.db.run('DELETE FROM guild_jail_config WHERE guild_id = ?', [guildId]);
        return true;
    }

    async clearStaffRoles(guildId) {
        if (!this.db) return false;
        await this.db.run('DELETE FROM guild_staff_roles WHERE guild_id = ?', [guildId]);
        return true;
    }

    // --- Reminders System ---
    async addReminder(userId, channelId, guildId, messageId, reason, triggerAt) {
        if (!this.db) return null;
        const now = Date.now();
        const res = await this.db.run(
            'INSERT INTO reminders (user_id, channel_id, guild_id, message_id, reason, trigger_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, channelId, guildId || null, messageId || null, reason, triggerAt, now]
        );
        return res?.lastID || null;
    }

    async getUserReminders(userId) {
        if (!this.db) return [];
        return await this.db.all('SELECT * FROM reminders WHERE user_id = ? ORDER BY trigger_at ASC', [userId]) || [];
    }

    async deleteReminder(id, userId) {
        if (!this.db) return false;
        const res = await this.db.run('DELETE FROM reminders WHERE id = ? AND user_id = ?', [id, userId]);
        return (res?.changes || 0) > 0;
    }

    async getDueReminders() {
        if (!this.db) return [];
        const now = Date.now();
        return await this.db.all('SELECT * FROM reminders WHERE trigger_at <= ? ORDER BY trigger_at ASC', [now]) || [];
    }

    async deleteReminderById(id) {
        if (!this.db) return false;
        await this.db.run('DELETE FROM reminders WHERE id = ?', [id]);
        return true;
    }

    /*
        User Saved Playlists Management
        ✦ ───────────────────────────── ✦
    */
    async createPlaylist(userId, name) {
        if (!this.db) return null;
        const now = Date.now();
        const cleanName = name.trim().toLowerCase();
        try {
            const res = await this.db.run(
                'INSERT INTO user_playlists (user_id, name, created_at) VALUES (?, ?, ?)',
                [userId, cleanName, now]
            );
            return res?.lastID || null;
        } catch (_) {
            return null;
        }
    }

    async getPlaylist(userId, name) {
        if (!this.db) return null;
        const cleanName = name.trim().toLowerCase();
        return await this.db.get(
            'SELECT * FROM user_playlists WHERE user_id = ? AND name = ?',
            [userId, cleanName]
        );
    }

    async getUserPlaylists(userId) {
        if (!this.db) return [];
        return await this.db.all(
            `SELECT p.*, COUNT(t.id) as track_count 
             FROM user_playlists p 
             LEFT JOIN user_playlist_tracks t ON p.id = t.playlist_id 
             WHERE p.user_id = ? 
             GROUP BY p.id 
             ORDER BY p.created_at DESC`,
            [userId]
        ) || [];
    }

    async deletePlaylist(userId, name) {
        if (!this.db) return false;
        const cleanName = name.trim().toLowerCase();
        const p = await this.getPlaylist(userId, cleanName);
        if (!p) return false;
        await this.db.run('DELETE FROM user_playlist_tracks WHERE playlist_id = ?', [p.id]);
        const res = await this.db.run('DELETE FROM user_playlists WHERE id = ?', [p.id]);
        return (res?.changes || 0) > 0;
    }

    async addTrackToPlaylist(playlistId, track) {
        if (!this.db) return null;
        const now = Date.now();
        const res = await this.db.run(
            'INSERT INTO user_playlist_tracks (playlist_id, title, url, duration, author, added_at) VALUES (?, ?, ?, ?, ?, ?)',
            [playlistId, track.title, track.url, track.duration || 0, track.author || 'unknown', now]
        );
        return res?.lastID || null;
    }

    async removeTrackFromPlaylist(playlistId, trackIndex) {
        if (!this.db) return false;
        const tracks = await this.getPlaylistTracks(playlistId);
        if (trackIndex < 1 || trackIndex > tracks.length) return false;
        const target = tracks[trackIndex - 1];
        const res = await this.db.run('DELETE FROM user_playlist_tracks WHERE id = ?', [target.id]);
        return (res?.changes || 0) > 0;
    }

    async getPlaylistTracks(playlistId) {
        if (!this.db) return [];
        return await this.db.all(
            'SELECT * FROM user_playlist_tracks WHERE playlist_id = ? ORDER BY id ASC',
            [playlistId]
        ) || [];
    }

    async getUserBadges(userId) {
        if (!this.db || !userId) return [];
        return await this.db.all('SELECT badge_id, granted_at FROM user_badges WHERE user_id = ? ORDER BY granted_at ASC', [userId]) || [];
    }

    async hasUserBadge(userId, badgeId) {
        if (!this.db || !userId || !badgeId) return false;
        const row = await this.db.get('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?', [userId, badgeId]);
        return Boolean(row);
    }

    async grantUserBadge(userId, badgeId) {
        if (!this.db || !userId || !badgeId) return false;
        const now = Math.floor(Date.now() / 1000);
        const res = await this.db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_id, granted_at) VALUES (?, ?, ?)', [userId, badgeId, now]);
        return (res?.changes || 0) > 0;
    }

    async revokeUserBadge(userId, badgeId) {
        if (!this.db || !userId || !badgeId) return false;
        const res = await this.db.run('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?', [userId, badgeId]);
        const prof = await this.getUserProfile(userId);
        if (prof?.featured_badge === badgeId) {
            await this.db.run('UPDATE user_profiles SET featured_badge = NULL WHERE user_id = ?', [userId]);
        }
        return (res?.changes || 0) > 0;
    }

    async setFeaturedBadge(userId, badgeId) {
        if (!this.db || !userId) return false;
        await this.ensureUserProfile(userId);
        await this.db.run('UPDATE user_profiles SET featured_badge = ? WHERE user_id = ?', [badgeId || null, userId]);
        return true;
    }

    async getFeaturedBadge(userId) {
        if (!this.db || !userId) return null;
        const row = await this.db.get('SELECT featured_badge FROM user_profiles WHERE user_id = ?', [userId]);
        return row?.featured_badge || null;
    }
}

module.exports = DatabaseManager;
