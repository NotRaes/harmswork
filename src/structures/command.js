const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('./utils/builder.js');
const config = require('../config.js');
const { getAddonForCommand } = require('./utils/helpers/addonhelper.js');

/*
 *  command handler — harm
 *  streamlined class-based command system.
 *  commands only define: name, aliases (optional), description (optional),
 *  permissions (optional), cooldown (optional), ownerOnly (optional).
 */

const _levBuf = new Uint16Array(256);

function levenshtein(a, b) {
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    if (al > 255 || bl > 255) return Math.abs(al - bl);

    for (let j = 0; j <= bl; j++) _levBuf[j] = j;

    for (let i = 1; i <= al; i++) {
        let prev = i - 1;
        _levBuf[0] = i;
        const ai = a.charCodeAt(i - 1);
        for (let j = 1; j <= bl; j++) {
            const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
            const val = Math.min(_levBuf[j] + 1, _levBuf[j - 1] + 1, prev + cost);
            prev = _levBuf[j];
            _levBuf[j] = val;
        }
    }
    return _levBuf[bl];
}

class CommandHandler {
    constructor(bot, commandsPath, prefix) {
        this.bot = bot;
        this.commandsPath = commandsPath || path.join(__dirname, '../commands');
        this.prefix = prefix || ',';

        this.commands = new Map();
        this.aliases = new Map();
        this.cooldowns = new Map();
        this._mentionPrefixes = null;

        this._sweepTimer = setInterval(() => {
            const now = Date.now();
            for (const [, timestamps] of this.cooldowns) {
                for (const [uid, data] of timestamps) {
                    if (now >= data.expires) timestamps.delete(uid);
                }
            }
        }, 60_000);
    }

    loadCommands() {
        try {
            const entries = fs.readdirSync(this.commandsPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const catPath = path.join(this.commandsPath, entry.name);
                const files = fs.readdirSync(catPath, { withFileTypes: true });
                for (const file of files) {
                    if (!file.isFile() || !file.name.endsWith('.js')) continue;
                    this.loadCommand(entry.name, file.name);
                }
            }
            console.log(`loaded ${this.commands.size} commands and ${this.aliases.size} aliases.`);
        } catch (err) {
            console.error('unable to load commands>', err);
        }
    }

    loadCommand(category, file) {
        const filePath = path.resolve(this.commandsPath, category, file);
        try {
            const CommandClass = require(filePath);
            const cmd = new CommandClass(this.bot);

            cmd.__filename = filePath;
            cmd.category = cmd.category || category;
            cmd._isClientFirst = /^\s*(async\s+)?execute\s*\(\s*client\b/.test(typeof cmd.execute === 'function' ? cmd.execute.toString() : '');
            cmd._addonName = getAddonForCommand(cmd.name, cmd.category);

            this.commands.set(cmd.name, cmd);

            if (Array.isArray(cmd.aliases)) {
                for (const alias of cmd.aliases) {
                    this.aliases.set(alias, cmd.name);
                }
            }
            return true;
        } catch (err) {
            console.warn(`unable to load command from ${filePath}>`, err.message);
            return false;
        }
    }

    reloadCommand(commandName) {
        const cmd = this.resolve(commandName);
        if (!cmd) return false;

        const filePath = cmd.__filename;
        delete require.cache[require.resolve(filePath)];
        this.commands.delete(cmd.name);

        if (Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) this.aliases.delete(alias);
        }

        return this.loadCommand(cmd.category, path.basename(filePath));
    }

    resolve(name) {
        return this.commands.get(name) || this.commands.get(this.aliases.get(name)) || null;
    }

    async handleMessage(message) {
        if (message.author.bot) return;

        const content = message.content;
        if (!content) return;

        const guildPrefix = (message.guild && this.bot.db)
            ? (this.bot.db.getGuildPrefix(message.guild.id) || this.prefix)
            : this.prefix;

        let activePrefix = null;

        if (content.startsWith(guildPrefix)) {
            activePrefix = guildPrefix;
        } else {
            if (!this._mentionPrefixes && this.bot.user) {
                this._mentionPrefixes = [
                    `<@${this.bot.user.id}> `,
                    `<@!${this.bot.user.id}> `,
                    `<@${this.bot.user.id}>`,
                    `<@!${this.bot.user.id}>`
                ];
                this._botMentionRegex = new RegExp(`<@!?${this.bot.user.id}>`, 'g');
            }
            if (this._mentionPrefixes) {
                for (const mp of this._mentionPrefixes) {
                    if (content.startsWith(mp)) {
                        activePrefix = mp;
                        break;
                    }
                }
            }
            if (!activePrefix) return;
        }

        const raw = content.slice(activePrefix.length);
        const input = raw.trimStart();
        const isMention = Boolean(this._mentionPrefixes?.includes(activePrefix));
        const contentWithoutBotMentions = isMention
            ? content.replace(this._botMentionRegex || new RegExp(`<@!?${this.bot.user?.id}>`, 'g'), '').trim()
            : null;

        if (!input || (isMention && !contentWithoutBotMentions)) {
            if (isMention) {
                if (this.bot.state) {
                    const allowed = await this.bot.state.checkMentionCooldown(message.author.id, message.channel.id, 10000);
                    if (!allowed) return;
                } else {
                    if (!this._mentionCooldowns) this._mentionCooldowns = new Map();
                    const cooldownKey = `${message.author.id}:${message.channel.id}`;
                    const now = Date.now();
                    const lastUsed = this._mentionCooldowns.get(cooldownKey) || 0;
                    if (now - lastUsed < 10000) {
                        return; // silently ignore mention spam
                    }
                    this._mentionCooldowns.set(cooldownKey, now);
                }

                const clientId = this.bot.user?.id || config.clientId || '1490995846626545674';
                const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${config.invitePermissions || '1376435694838'}&scope=bot%20applications.commands`;
                const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const bannerAtt = build.getAssetAttachment('banner.png');
                const files = bannerAtt ? [bannerAtt] : [];
                const botAvatar = this.bot.user?.displayAvatarURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

                if (bannerAtt) {
                    container.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                        )
                    );
                }

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );

                const guildName = message.guild?.name ? `**${message.guild.name}**` : 'this server';
                const section = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### [welcome to **harm**!](${supportUrl})\n` +
                            `-# thanks for using harm in ${guildName}!\n` +
                            `-# your prefix for this server is \`${guildPrefix}\` · type \`${guildPrefix}help\` for commands.\n\n` +
                            `-# **quickstart**:\n` +
                            `-# \`${guildPrefix}help\` — list of all available commands\n` +
                            `-# \`${guildPrefix}addon\` — enable optional modular addons\n` +
                            `-# \`${guildPrefix}prefix <new>\` — customize the server prefix\n` +
                            `-# **note:** **you** or *others* can also mention <@${clientId}> at any time if they forget the prefix.`
                        )
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(botAvatar)
                    );
                container.addSectionComponents(section);

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('join discord')
                        .setEmoji('<:discord_logo:1529300434374758481>')
                        .setURL(supportUrl),
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('invite harm')
                        .setEmoji(config.emojis?.harm || '<:harmsdio:1556221836507742278>')
                        .setURL(inviteUrl)
                );
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(0x0A0A0C)
                    .setThumbnail(botAvatar)
                    .setDescription(
                        `### [welcome to **harm**!](${supportUrl})\n` +
                        `-# thanks for using harm in ${guildName}!\n` +
                        `-# your prefix for this server is \`${guildPrefix}\` · type \`${guildPrefix}help\` for commands.\n\n` +
                        `-# **quickstart**:\n` +
                        `-# \`${guildPrefix}help\` — list of all available commands\n` +
                        `-# \`${guildPrefix}prefix <new>\` — customize the server prefix`
                    );
                if (bannerAtt) fallbackEmbed.setImage('attachment://banner.png');
                return message.reply({
                    embeds: [fallbackEmbed],
                    components: [row],
                    files,
                    allowedMentions: { repliedUser: false }
                }).catch(() => {});
            }
            return;
        }

        let commandName, args;
        const spaceIdx = input.indexOf(' ');
        if (spaceIdx === -1) {
            commandName = input.toLowerCase();
            args = [];
        } else {
            commandName = input.slice(0, spaceIdx).toLowerCase();
            const rest = input.slice(spaceIdx + 1).trimStart();
            if (!rest.includes('"') && !rest.includes("'")) {
                args = rest.split(/\s+/);
            } else {
                args = rest.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
                    ?.map(a => (a.charCodeAt(0) === 34 || a.charCodeAt(0) === 39) ? a.slice(1, -1) : a)
                    || [];
            }
        }

        const command = this.resolve(commandName);

        if (!command) {
            const subMatch = this.findParentCommandForSubcommand(commandName);
            if (subMatch) {
                return this._handleTypoSuggestion(message, commandName, `${subMatch.parent} ${subMatch.subcommand}`, args, activePrefix);
            }

            const suggestion = this.findClosest(commandName);
            if (!suggestion) return;

            return this._handleTypoSuggestion(message, commandName, suggestion, args, activePrefix);
        }

        if (args.length > 0) {
            const subSuggestion = this.findSubcommandMatch(command, args[0]);
            if (subSuggestion) {
                const restArgs = args.slice(1).join(' ');
                const fullSuggestion = `${command.name} ${subSuggestion}${restArgs ? ' ' + restArgs : ''}`;
                const replyPromise = message.reply({
                    embeds: [build.say(message.author, `did you mean \`${activePrefix}${fullSuggestion}\`?`)]
                });
                return replyPromise?.catch ? replyPromise.catch(() => null) : replyPromise;
            }
        }

        await this.dispatch(command, message, args, commandName);
    }

    async dispatch(command, message, args, commandName) {
        if (message.guild && this.bot.db) {
            if (command.name !== 'prefix' && command.name !== 'help') {
                if (this.bot.db.isCategoryDisabled?.(message.guild.id, command.category)) {
                    return message.reply(build.denyBox('unavailable', 'this category is currently disabled in this server.'));
                }
                if (this.bot.db.isCommandDisabled?.(message.guild.id, command.name)) {
                    return message.reply(build.denyBox('unavailable', 'this command is currently disabled in this server.'));
                }
            }
        }

        const isOwner = config.owners?.includes(message.author.id);

        if (this.bot.db?.isBlacklisted?.(message.author.id) && !isOwner) {
            const entry = this.bot.db.getBlacklistEntry?.(message.author.id);
            const reasonStr = (entry?.reason && entry.reason !== 'no reason provided') ? `\n-# reason: ${entry.reason}` : '';
            return message.reply(build.deny(message.author, `you are blacklisted from using harm.${reasonStr}`)).catch(() => {});
        }

        if (command.ownerOnly && !isOwner) {
            return message.reply(build.denyBox('restricted', 'this command is restricted to bot owners.'));
        }

        // --- Paid & Freeuses Verification ---
        if (command.paid && !isOwner) {
            let trackingKey = command.name;
            let displayCommandName = command.name;
            let baseFreeLimit = typeof command.freeuses === 'number'
                ? command.freeuses
                : (typeof command.freeUses === 'number' ? command.freeUses : 0);
            let maxQuota = typeof command.maxQuota === 'number' ? command.maxQuota : 5;

            // Subcommand-specific free uses & max quota (e.g. generate message vs generate quote)
            if (command.subcommandFreeuses) {
                let subKey = null;
                if (typeof command.resolveFreeuseSubcommand === 'function') {
                    subKey = command.resolveFreeuseSubcommand(message, args);
                } else if (args.length > 0) {
                    subKey = args[0].toLowerCase();
                }

                // If user didn't specify a subcommand or arguments (e.g. viewing help), don't paywall
                if (!subKey) {
                    baseFreeLimit = 0;
                } else if (command.subcommandFreeuses[subKey] !== undefined) {
                    trackingKey = `${command.name}:${subKey}`;
                    displayCommandName = `${command.name} ${subKey}`;
                    baseFreeLimit = command.subcommandFreeuses[subKey];
                    if (command.subcommandMaxQuota && command.subcommandMaxQuota[subKey] !== undefined) {
                        maxQuota = command.subcommandMaxQuota[subKey];
                    }
                }
            } else if (args.length === 0 && !message.reference && !message.attachments?.size) {
                // If command requires arguments and none were provided, let it proceed to show syntax warning without consuming a use
                baseFreeLimit = 0;
            }

            if (baseFreeLimit > 0) {
                const isPremium = (this.bot.db ? await this.bot.db.isUserPremium(message.author.id) : false)
                    || (message.guild && this.bot.db?.isGuildPremium ? await this.bot.db.isGuildPremium(message.guild.id) : false);

                if (!isPremium) {
                    const isMember = this.bot.db ? await this.bot.db.isSupportMember(this.bot, message.author.id) : false;
                    const premiumEmoji = config.emojis?.premium || '<:harm_premium:1558810882795114536>';
                    const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Link)
                            .setLabel('join discord')
                            .setEmoji('<:discord_logo:1529300434374758481>')
                            .setURL(supportUrl)
                    );

                    // ──────────────────── A. SERVER MEMBERS (DAILY REPLENISHING QUOTA UP TO MAX) ────────────────────
                    if (isMember && this.bot.db?.getOrUpdateMemberQuota) {
                        const quotaInfo = await this.bot.db.getOrUpdateMemberQuota(message.author.id, trackingKey, baseFreeLimit, maxQuota);

                        if (quotaInfo.canUse) {
                            // Consume 1 from active quota
                            await this.bot.db.consumeMemberQuota(message.author.id, trackingKey);
                        } else {
                            // Quota exhausted (0 / maxQuota)
                            const denyMsg = `you have reached your quota limit for \`${displayCommandName}\` (\`0/${maxQuota}\`).\n-# as a **member**, your quota replenishes by **+1 every day** you stay in our [**discord**](${supportUrl}), or upgrade to **harm premium** ${premiumEmoji} for unlimited access.`;
                            return message.reply({
                                embeds: [build.deny(message.author, denyMsg)],
                                components: [row]
                            });
                        }
                    }
                    // ──────────────────── B. NON-MEMBERS (FIXED TRIAL LIMIT) ────────────────────
                    else {
                        const currentLifetimeUses = (this.bot.db)
                            ? await this.bot.db.getUserCommandUses(message.author.id, trackingKey)
                            : 0;

                        if (currentLifetimeUses < baseFreeLimit) {
                            // Consume 1 trial use
                            if (this.bot.db?.incrementUserCommandUses) {
                                await this.bot.db.incrementUserCommandUses(message.author.id, trackingKey).catch(() => {});
                            }
                        } else {
                            // Trial exhausted
                            const denyMsg = `you have exhausted your \`${baseFreeLimit}\` free use${baseFreeLimit === 1 ? '' : 's'} for \`${displayCommandName}\`.\n-# join our [**discord**](${supportUrl}) as a **member** to get **1 free use every day** you stay (up to **${maxQuota} max quota**), or upgrade to **harm premium** ${premiumEmoji}.`;
                            return message.reply({
                                embeds: [build.deny(message.author, denyMsg)],
                                components: [row]
                            });
                        }
                    }
                }
            }
        }

        if (!isOwner && command.permissions?.length) {
            const member = message.member
                || message.guild?.members.cache.get(message.author.id)
                || (message.guild ? await message.guild.members.fetch(message.author.id).catch(() => null) : null);

            const hasAdmin = member?.permissions?.has(1n << 3n); // PermissionFlagsBits.Administrator
            if (!hasAdmin) {
                const hasPerms = (command.permissionMode === 'all')
                    ? command.permissions.every(p => member?.permissions?.has(p))
                    : command.permissions.some(p => member?.permissions?.has(p));

                if (!hasPerms) {
                    const permNames = command.permissions.map(p => {
                        return String(p).replace(/([A-Z])/g, ' $1').trim().toLowerCase();
                    });
                    const permStr = permNames.join(command.permissionMode === 'all' ? ' and ' : ' or ');
                    return message.reply(build.warnBox('permission denied', `you need \`${permStr}\` permission to use this command.`));
                }
            }
        }

        const invulnerable = this.bot.invulnerableUsers?.has(message.author.id);
        const cooldownSecs = command.cooldown || 2;

        if (!invulnerable) {
            if (this.bot.state) {
                const cd = await this.bot.state.checkCooldown(command.name, message.author.id, cooldownSecs);
                if (!cd.allowed) {
                    return message.reply(build.warnBox('cooldown', `please wait \`${cd.remaining}s\` before using this command again.`));
                }
            } else {
                if (!this.cooldowns.has(command.name)) {
                    this.cooldowns.set(command.name, new Map());
                }

                const now = Date.now();
                const timestamps = this.cooldowns.get(command.name);
                const cooldownMs = cooldownSecs * 1000;
                const existing = timestamps.get(message.author.id);

                if (existing && now < existing.expires) {
                    const left = ((existing.expires - now) / 1000).toFixed(1);
                    return message.reply(build.warnBox('cooldown', `please wait \`${left}s\` before using this command again.`));
                }

                timestamps.set(message.author.id, { used: now, expires: now + cooldownMs });
            }
        }

        // Modular Addon Enforcement Check
        if (message.guild && this.bot.db?.isAddonEnabled) {
            const addonName = command._addonName;
            if (addonName) {
                const sub = (args?.[0] || '').toLowerCase();
                // Never block setup, reset, or root overview/help commands so administrators can configure or fix features
                const isConfigAction = (addonName === 'voicemaster' && (sub === 'setup' || sub === 'reset' || sub === '' || sub === 'help'));

                if (!isConfigAction && !this.bot.db.isAddonEnabled(message.guild.id, addonName)) {
                    const prefix = (this.bot.db.getGuildPrefix) ? (this.bot.db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
                    return message.reply({
                        embeds: [build.warn(message.author, `the **${addonName}** addon is disabled in this server.\n-# an administrator can run \`${prefix}addon enable ${addonName}\` to activate it.`)]
                    });
                }
            }
        }

        if (this.bot.db?.trackCommand) {
            try {
                const trackRes = this.bot.db.trackCommand(command.name, message.author.id, message.guild?.id);
                if (trackRes?.catch) trackRes.catch(() => {});
            } catch (_) {}
        }

        const typingDelay = config.delay || 0;
        if (typingDelay > 0) {
            await message.channel.sendTyping().catch(() => {});
            await new Promise(r => setTimeout(r, typingDelay));
        }

        // Auto-ensure user profile & uid for command invoker (skip DB query if already cached)
        if (this.bot.db?.ensureUserProfile && !message.author.bot && !this.bot.db?.userProfilesCache?.has(message.author.id)) {
            this.bot.db.ensureUserProfile(message.author.id).catch(() => {});
        }

        try {
            if (command._isClientFirst) {
                await command.execute(this.bot, message, args);
            } else {
                await command.execute(message, args, commandName);
            }
        } catch (err) {
            console.error(`error in (${command.name}):`, err);
            if (err?.code === 50013 || err?.message?.toLowerCase().includes('missing permissions')) {
                message.reply(build.denyBox('missing permissions', 'i lack the required discord permissions to perform this action.')).catch(() => {});
            } else {
                message.reply(build.denyBox('error', `an error occurred while executing ${command.name}.`)).catch(() => {});
            }
        }
    }

    async _handleTypoSuggestion(message, typed, suggestion, args, activePrefix) {
        const full = `${activePrefix}${suggestion}${args.length ? ' ' + args.join(' ') : ''}`;

        const reply = await message.reply({
            embeds: [build.say(message.author, `did you mean \`${full}\`?`)]
        }).catch(() => null);

        if (!reply) return;

        setTimeout(() => {
            reply.delete().catch(() => {});
        }, 8_000);
    }

    findParentCommandForSubcommand(name) {
        if (!name) return null;
        const target = name.toLowerCase();

        // 1. Direct match or alias match on subcommands
        for (const [cmdName, cmd] of this.commands) {
            const subcommands = new Set();
            if (cmd.subcommandDetails) {
                for (const key of Object.keys(cmd.subcommandDetails)) {
                    if (key !== 'execute') subcommands.add(key.toLowerCase());
                }
            }
            if (Array.isArray(cmd.subcommands)) {
                for (const s of cmd.subcommands) {
                    const words = s.trim().split(/\s+/);
                    if (words.length > 1) {
                        const subWord = words[1].toLowerCase().replace(/[<[].*$/, '');
                        if (subWord) subcommands.add(subWord);
                    }
                }
            }

            if (subcommands.has(target)) {
                return { parent: cmd.name, subcommand: target };
            }

            // Common abbreviations
            if (cmd.name === 'games') {
                if (target === 'ttt') return { parent: 'games', subcommand: 'tictactoe' };
                if (target === 'c4') return { parent: 'games', subcommand: 'connect4' };
            }
        }

        // 2. Fuzzy match against subcommands
        let best = null;
        let bestDist = Infinity;
        for (const [cmdName, cmd] of this.commands) {
            const subcommands = new Set();
            if (cmd.subcommandDetails) {
                for (const key of Object.keys(cmd.subcommandDetails)) {
                    if (key !== 'execute') subcommands.add(key.toLowerCase());
                }
            }
            if (Array.isArray(cmd.subcommands)) {
                for (const s of cmd.subcommands) {
                    const words = s.trim().split(/\s+/);
                    if (words.length > 1) {
                        const subWord = words[1].toLowerCase().replace(/[<[].*$/, '');
                        if (subWord) subcommands.add(subWord);
                    }
                }
            }

            for (const sub of subcommands) {
                const dist = this._matchScore(target, sub);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { parent: cmd.name, subcommand: sub };
                }
            }
        }

        const maxAllowed = target.length <= 3 ? 1 : (target.length <= 6 ? 2 : 3);
        if (best && bestDist <= maxAllowed) {
            return best;
        }

        return null;
    }

    findClosest(name) {
        if (!name) return null;
        const target = name.toLowerCase();

        let best = null;
        let bestDist = Infinity;

        for (const [cmdName, cmd] of this.commands) {
            const d1 = this._matchScore(target, cmdName);
            if (d1 < bestDist) { bestDist = d1; best = cmdName; }

            if (cmd.aliases) {
                for (const alias of cmd.aliases) {
                    const d2 = this._matchScore(target, alias);
                    if (d2 < bestDist) { bestDist = d2; best = alias; }
                }
            }
        }

        const maxAllowed = target.length <= 2 ? 2 : Math.max(3, Math.floor(target.length * 0.5));
        return bestDist <= maxAllowed ? best : null;
    }

    _matchScore(target, candidate) {
        if (candidate === target) return -1;
        if (candidate.startsWith(target) || target.startsWith(candidate)) {
            return Math.abs(candidate.length - target.length);
        }
        return levenshtein(target, candidate);
    }

    findSubcommandMatch(command, arg) {
        if (!arg || !command) return null;
        const target = arg.toLowerCase();
        if (target.startsWith('<') || target.startsWith('@') || /^\d+$/.test(target)) return null;

        const subcommands = new Set();
        if (command.subcommandDetails) {
            for (const key of Object.keys(command.subcommandDetails)) {
                if (key !== 'execute') subcommands.add(key.toLowerCase());
            }
        }
        if (Array.isArray(command.subcommands)) {
            for (const s of command.subcommands) {
                const words = s.trim().split(/\s+/);
                if (words.length > 1) {
                    const subWord = words[1].toLowerCase().replace(/[<[].*$/, '');
                    if (subWord) subcommands.add(subWord);
                } else if (words.length === 1 && words[0].toLowerCase() !== command.name.toLowerCase()) {
                    subcommands.add(words[0].toLowerCase());
                }
            }
        }

        if (subcommands.size === 0) return null;
        if (subcommands.has(target)) return null;

        // 1. Intelligent intent & synonym mapping
        const SYNONYMS = {
            'reset': ['clear', 'delete', 'remove', 'disable', 'off'],
            'clear': ['reset', 'delete', 'remove'],
            'delete': ['remove', 'clear', 'reset', 'del', 'rm'],
            'remove': ['delete', 'clear', 'reset', 'del', 'rm'],
            'del': ['delete', 'remove'],
            'rm': ['delete', 'remove'],
            'add': ['create', 'new', 'enable', 'on', 'setup'],
            'create': ['add', 'new', 'setup'],
            'new': ['create', 'add'],
            'setup': ['create', 'add'],
            'show': ['list', 'all', 'view'],
            'view': ['list', 'show', 'all'],
            'list': ['show', 'view', 'all'],
            'sync': ['update', 'refresh'],
            'refresh': ['update', 'sync'],
            'update': ['sync', 'refresh'],
            'enable': ['on', 'activate'],
            'disable': ['off', 'deactivate'],
            'on': ['enable'],
            'off': ['disable'],
            'status': ['info', 'details', 'view'],
            'info': ['status', 'details', 'view'],
            'details': ['status', 'info']
        };

        if (SYNONYMS[target]) {
            for (const syn of SYNONYMS[target]) {
                if (subcommands.has(syn)) {
                    return syn;
                }
            }
        }

        // 2. Prefix & substring match (e.g. "del" -> "delete", "crea" -> "create")
        for (const sub of subcommands) {
            if (sub.length >= 3 && (sub.startsWith(target) || (target.length >= 3 && target.startsWith(sub)))) {
                return sub;
            }
        }

        // 3. Levenshtein edit distance with friendly tolerance
        let best = null;
        let bestDist = Infinity;
        for (const sub of subcommands) {
            const d = levenshtein(target, sub);
            if (d < bestDist) {
                bestDist = d;
                best = sub;
            }
        }

        const maxAllowed = target.length <= 4 ? 2 : (target.length <= 8 ? 3 : 4);
        if (best && bestDist <= maxAllowed) {
            return best;
        }
        return null;
    }
}

module.exports = CommandHandler;