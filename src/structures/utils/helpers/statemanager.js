const EventEmitter = require('events');
let Redis = null;
try {
    Redis = require('ioredis');
} catch (_) {}

class StateManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.isRedis = false;
        this.redis = null;
        this.subRedis = null;
        this.memoryStore = new Map();
        this.memoryExpirations = new Map();

        // Background sweep for in-memory TTL expiration
        this._sweepInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, exp] of this.memoryExpirations) {
                if (now >= exp) {
                    this.memoryStore.delete(key);
                    this.memoryExpirations.delete(key);
                }
            }
        }, 30_000);
        this._sweepInterval.unref?.();
    }

    async init() {
        const redisUrl = process.env.REDIS_URL || this.config.redisUrl || 'redis://127.0.0.1:6379';

        if (Redis) {
            try {
                const client = new Redis(redisUrl, {
                    lazyConnect: true,
                    maxRetriesPerRequest: 1,
                    retryStrategy: () => null,
                    enableOfflineQueue: false
                });

                client.on('error', () => {
                    this.isRedis = false;
                });

                await client.connect();
                this.redis = client;
                this.isRedis = true;

                // Dedicated subscriber client for pub/sub events
                this.subRedis = new Redis(redisUrl, {
                    lazyConnect: true,
                    maxRetriesPerRequest: 1,
                    retryStrategy: () => null,
                    enableOfflineQueue: false
                });
                this.subRedis.on('error', () => {});
                await this.subRedis.connect().catch(() => {});

                this.subRedis.on('message', (channel, message) => {
                    try {
                        const parsed = JSON.parse(message);
                        this.emit(channel, parsed);
                    } catch (_) {
                        this.emit(channel, message);
                    }
                });

                console.log('[state] connected to redis store for distributed state synchronization.');
                return;
            } catch (_) {
                this.isRedis = false;
                if (this.redis) {
                    try { this.redis.disconnect(); } catch (_) {}
                    this.redis = null;
                }
            }
        }

        console.log('[state] running high-speed in-memory state manager (sub-1ms latency).');
    }

    // ──────────────────────── BASIC KEY-VALUE API ────────────────────────
    async get(key) {
        if (this.isRedis && this.redis) {
            try {
                const val = await this.redis.get(key);
                if (!val) return null;
                try { return JSON.parse(val); } catch (_) { return val; }
            } catch (_) {
                this.isRedis = false;
            }
        }

        const exp = this.memoryExpirations.get(key);
        if (exp && Date.now() >= exp) {
            this.memoryStore.delete(key);
            this.memoryExpirations.delete(key);
            return null;
        }
        return this.memoryStore.get(key) ?? null;
    }

    async set(key, value, ttlSeconds = null) {
        if (this.isRedis && this.redis) {
            try {
                const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
                if (ttlSeconds && ttlSeconds > 0) {
                    await this.redis.set(key, serialized, 'EX', Math.ceil(ttlSeconds));
                } else {
                    await this.redis.set(key, serialized);
                }
                return true;
            } catch (_) {
                this.isRedis = false;
            }
        }

        this.memoryStore.set(key, value);
        if (ttlSeconds && ttlSeconds > 0) {
            this.memoryExpirations.set(key, Date.now() + (ttlSeconds * 1000));
        } else {
            this.memoryExpirations.delete(key);
        }
        return true;
    }

    async del(key) {
        if (this.isRedis && this.redis) {
            try {
                await this.redis.del(key);
                return true;
            } catch (_) {
                this.isRedis = false;
            }
        }
        this.memoryStore.delete(key);
        this.memoryExpirations.delete(key);
        return true;
    }

    async incr(key, ttlSeconds = null) {
        if (this.isRedis && this.redis) {
            try {
                const count = await this.redis.incr(key);
                if (count === 1 && ttlSeconds) {
                    await this.redis.expire(key, Math.ceil(ttlSeconds));
                }
                return count;
            } catch (_) {
                this.isRedis = false;
            }
        }

        let curr = this.memoryStore.get(key) || 0;
        curr++;
        this.memoryStore.set(key, curr);
        if (curr === 1 && ttlSeconds) {
            this.memoryExpirations.set(key, Date.now() + (ttlSeconds * 1000));
        }
        return curr;
    }

    // ──────────────────────── PUB/SUB CHANNELS ────────────────────────
    async publish(channel, data) {
        if (this.isRedis && this.redis) {
            try {
                const message = typeof data === 'object' ? JSON.stringify(data) : String(data);
                await this.redis.publish(channel, message);
                return;
            } catch (_) {
                this.isRedis = false;
            }
        }
        this.emit(channel, data);
    }

    async subscribe(channel, handler) {
        if (this.isRedis && this.subRedis) {
            try {
                await this.subRedis.subscribe(channel);
            } catch (_) {}
        }
        this.on(channel, handler);
    }

    // ──────────────────────── SPECIALIZED BOT ACCELERATORS ────────────────────────
    async checkCooldown(commandName, userId, cooldownSeconds) {
        const key = `cd:${commandName}:${userId}`;
        const now = Date.now();
        const existing = await this.get(key);

        if (existing && existing.expires > now) {
            return {
                allowed: false,
                remaining: ((existing.expires - now) / 1000).toFixed(1)
            };
        }

        const expires = now + (cooldownSeconds * 1000);
        await this.set(key, { used: now, expires }, cooldownSeconds);
        return { allowed: true, remaining: 0 };
    }

    async checkMentionCooldown(userId, channelId, cooldownMs = 10000) {
        const key = `mention_cd:${userId}:${channelId}`;
        const now = Date.now();
        const lastUsed = await this.get(key);

        if (lastUsed && (now - lastUsed) < cooldownMs) {
            return false; // blocked
        }

        await this.set(key, now, Math.ceil(cooldownMs / 1000));
        return true; // allowed
    }
}

module.exports = StateManager;
