const { EmbedBuilder } = require('discord.js');
const config = require('../../../config.js');

class InvokeHelper {
    static VALID_ACTIONS = [
        'warn',
        'jail',
        'unjail',
        'kick',
        'ban',
        'unban',
        'timeout',
        'untimeout',
        'softban',
        'hardban'
    ];

    static VALID_TYPES = ['message', 'dm'];

    static ACTION_ALIASES = {
        warns: 'warn',
        warning: 'warn',
        warned: 'warn',
        jail: 'jail',
        jailed: 'jail',
        unjail: 'unjail',
        unjailed: 'unjail',
        kick: 'kick',
        kicked: 'kick',
        ban: 'ban',
        banned: 'ban',
        unban: 'unban',
        unbanned: 'unban',
        timeout: 'timeout',
        timedout: 'timeout',
        mute: 'timeout',
        muted: 'timeout',
        untimeout: 'untimeout',
        unmute: 'untimeout',
        unmuted: 'untimeout',
        softban: 'softban',
        softbanned: 'softban',
        hardban: 'hardban',
        hardbanned: 'hardban'
    };

    /**
     * Normalizes an action string (e.g. "banned" -> "ban", "mute" -> "timeout")
     */
    static normalizeAction(action) {
        if (!action || typeof action !== 'string') return null;
        const clean = action.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
        return this.ACTION_ALIASES[clean] || (this.VALID_ACTIONS.includes(clean) ? clean : null);
    }

    /**
     * Replaces all placeholders across a string using the context object.
     */
    static replaceVariables(text, context = {}) {
        if (!text || typeof text !== 'string') return text || '';

        const user = context.user || context.targetUser || null;
        const member = context.member || context.targetMember || null;
        const moderator = context.moderator || null;
        const guild = context.guild || null;
        const reason = context.reason || 'no reason provided';
        const action = context.action || 'moderation';
        const durationStr = context.durationStr || context.duration || 'permanent';
        const caseId = context.caseId !== undefined && context.caseId !== null ? context.caseId : 0;

        let result = text;

        // 1. User variables
        if (user) {
            const userId = user.id || '';
            const username = user.username || '';
            const displayName = user.displayName || user.globalName || username;
            const tag = user.tag || username;
            const avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ dynamic: true, size: 1024 }) : '';
            const createdAt = user.createdTimestamp ? `<t:${Math.floor(user.createdTimestamp / 1000)}:f>` : 'unknown';
            const joinedAt = member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>` : 'unknown';
            const topRole = member?.roles?.highest?.name || 'none';

            let roleList = 'none';
            if (member?.roles?.cache && guild) {
                const values = typeof member.roles.cache.values === 'function'
                    ? Array.from(member.roles.cache.values())
                    : (Array.isArray(member.roles.cache) ? member.roles.cache : []);
                const roles = values.filter(r => r && r.id !== guild.id && r.name).map(r => r.name);
                if (roles.length > 0) roleList = roles.join(', ');
            }

            result = result
                .replace(/\{user\}/gi, `<@${userId}>`)
                .replace(/\{user\.mention\}/gi, `<@${userId}>`)
                .replace(/\{user\.name\}/gi, username)
                .replace(/\{user\.display_name\}/gi, displayName)
                .replace(/\{user\.tag\}/gi, tag)
                .replace(/\{user\.id\}/gi, userId)
                .replace(/\{user\.avatar\}/gi, avatarUrl)
                .replace(/\{user\.display_avatar\}/gi, avatarUrl)
                .replace(/\{user\.joined_at\}/gi, joinedAt)
                .replace(/\{user\.created_at\}/gi, createdAt)
                .replace(/\{user\.top_role\}/gi, topRole)
                .replace(/\{user\.role_list\}/gi, roleList)
                .replace(/\{user\.bot\}/gi, user.bot ? 'true' : 'false');
        }

        // 2. Moderator variables
        if (moderator) {
            const modId = moderator.id || '';
            const modUsername = moderator.username || '';
            const modDisplayName = moderator.displayName || moderator.globalName || modUsername;
            const modAvatar = typeof moderator.displayAvatarURL === 'function' ? moderator.displayAvatarURL({ dynamic: true, size: 1024 }) : '';

            result = result
                .replace(/\{moderator\}/gi, `<@${modId}>`)
                .replace(/\{moderator\.mention\}/gi, `<@${modId}>`)
                .replace(/\{moderator\.name\}/gi, modUsername)
                .replace(/\{moderator\.display_name\}/gi, modDisplayName)
                .replace(/\{moderator\.id\}/gi, modId)
                .replace(/\{moderator\.avatar\}/gi, modAvatar);
        }

        // 3. Punishment variables
        result = result
            .replace(/\{reason\}/gi, reason)
            .replace(/\{action\}/gi, action.toLowerCase())
            .replace(/\{duration\}/gi, durationStr)
            .replace(/\{case\}/gi, `#${caseId}`)
            .replace(/\{case\.id\}/gi, caseId.toString());

        // 4. Server variables
        if (guild) {
            const guildName = guild.name || 'server';
            const guildId = guild.id || '';
            const memberCount = (guild.memberCount || 0).toString();
            const ownerId = guild.ownerId || '';
            const boostCount = (guild.premiumSubscriptionCount || 0).toString();
            const boostTier = (guild.premiumTier || 0).toString();
            const iconUrl = typeof guild.iconURL === 'function' ? (guild.iconURL({ dynamic: true, size: 1024 }) || '') : '';
            const bannerUrl = typeof guild.bannerURL === 'function' ? (guild.bannerURL({ dynamic: true, size: 1024 }) || '') : '';
            const channelsCount = (guild.channels?.cache?.size || 0).toString();
            const rolesCount = (guild.roles?.cache?.size || 0).toString();

            result = result
                .replace(/\{guild\.name\}/gi, guildName)
                .replace(/\{server\.name\}/gi, guildName)
                .replace(/\{guild\.id\}/gi, guildId)
                .replace(/\{server\.id\}/gi, guildId)
                .replace(/\{guild\.count\}/gi, memberCount)
                .replace(/\{server\.count\}/gi, memberCount)
                .replace(/\{guild\.owner_id\}/gi, ownerId)
                .replace(/\{server\.owner_id\}/gi, ownerId)
                .replace(/\{guild\.boost_count\}/gi, boostCount)
                .replace(/\{guild\.boost_tier\}/gi, boostTier)
                .replace(/\{guild\.icon\}/gi, iconUrl)
                .replace(/\{guild\.banner\}/gi, bannerUrl)
                .replace(/\{guild\.channels_count\}/gi, channelsCount)
                .replace(/\{guild\.roles_count\}/gi, rolesCount);
        }

        return result;
    }

    /**
     * Parses an invoke string (which may contain text, {embed}, and $v blocks)
     * into a ready-to-send Discord payload: { content?: string, embeds?: [EmbedBuilder] }
     */
    static parseInvokeString(rawString, context = {}) {
        if (!rawString || typeof rawString !== 'string') {
            return { content: '' };
        }

        // Replace all variables first across raw input
        const processed = this.replaceVariables(rawString, context);

        // Check if an embed is requested
        const embedIdx = processed.indexOf('{embed}');
        if (embedIdx === -1) {
            return { content: processed.trim() };
        }

        const textBefore = processed.substring(0, embedIdx).trim();
        const embedRaw = processed.substring(embedIdx + '{embed}'.length).trim();

        const embed = new EmbedBuilder();
        embed.setColor(config.colors?.c || 0x0A0A0C);
        let hasEmbedData = false;

        // Split by $v or extract tag blocks
        let blocks = [];
        if (embedRaw.includes('$v')) {
            blocks = embedRaw.split('$v').map(b => b.trim()).filter(Boolean);
        } else {
            const matches = embedRaw.match(/\{([^{}]+)\}/g);
            if (matches) blocks = matches;
        }

        for (const block of blocks) {
            let clean = block;
            if (clean.startsWith('{') && clean.endsWith('}')) {
                clean = clean.slice(1, -1).trim();
            }

            const colonIdx = clean.indexOf(':');
            let key = '';
            let val = '';

            if (colonIdx === -1) {
                key = clean.toLowerCase();
            } else {
                key = clean.substring(0, colonIdx).trim().toLowerCase();
                val = clean.substring(colonIdx + 1).trim();
            }

            if (key === 'color' || key === 'colour') {
                try {
                    let hex = val.replace('#', '');
                    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                        embed.setColor(parseInt(hex, 16));
                    } else {
                        embed.setColor(val);
                    }
                    hasEmbedData = true;
                } catch (_) {}
            } else if (key === 'title') {
                if (val) {
                    embed.setTitle(val.slice(0, 256));
                    hasEmbedData = true;
                }
            } else if (key === 'url' || key === 'titleurl') {
                if (val && val.startsWith('http')) {
                    embed.setURL(val);
                }
            } else if (key === 'description' || key === 'desc') {
                if (val) {
                    embed.setDescription(val.slice(0, 4096));
                    hasEmbedData = true;
                }
            } else if (key === 'thumbnail' || key === 'thumb') {
                if (val && val.startsWith('http')) {
                    embed.setThumbnail(val);
                    hasEmbedData = true;
                }
            } else if (key === 'image' || key === 'img') {
                if (val && val.startsWith('http')) {
                    embed.setImage(val);
                    hasEmbedData = true;
                }
            } else if (key === 'timestamp') {
                embed.setTimestamp();
                hasEmbedData = true;
            } else if (key === 'footer') {
                if (val) {
                    const parts = val.split('|').map(s => s.trim());
                    const fText = parts[0] || '';
                    const fIcon = parts[1] && parts[1].startsWith('http') ? parts[1] : null;
                    if (fText) {
                        embed.setFooter({ text: fText.slice(0, 2048), iconURL: fIcon });
                        hasEmbedData = true;
                    }
                }
            } else if (key === 'author') {
                if (val) {
                    const parts = val.split('|').map(s => s.trim());
                    const aName = parts[0] || '';
                    const aIcon = parts[1] && parts[1].startsWith('http') ? parts[1] : null;
                    const aUrl = parts[2] && parts[2].startsWith('http') ? parts[2] : null;
                    if (aName) {
                        embed.setAuthor({ name: aName.slice(0, 256), iconURL: aIcon, url: aUrl });
                        hasEmbedData = true;
                    }
                }
            } else if (key === 'field') {
                if (val) {
                    const parts = val.split('|').map(s => s.trim());
                    const fName = parts[0] || 'field';
                    const fVal = parts[1] || 'value';
                    const fInline = parts[2] ? (parts[2].toLowerCase() === 'true' || parts[2] === 'inline') : false;
                    embed.addFields({
                        name: fName.slice(0, 256),
                        value: fVal.slice(0, 1024),
                        inline: fInline
                    });
                    hasEmbedData = true;
                }
            }
        }

        const payload = {};
        if (textBefore) payload.content = textBefore;
        if (hasEmbedData) payload.embeds = [embed];
        if (!payload.content && !payload.embeds) {
            payload.content = processed.trim();
        }

        return payload;
    }

    /**
     * Creates a default embed state for an action and type.
     */
    static createDefaultActionState(action = 'warn', type = 'message') {
        const normAction = this.normalizeAction(action) || 'warn';
        const isDM = type === 'dm';

        if (isDM) {
            return {
                savedName: `invoke_${normAction}_dm`,
                content: null,
                title: `you have been ${normAction}ed`,
                titleUrl: null,
                description: `you received a moderation infraction in **{guild.name}**.\n\n• **action:** {action}\n• **reason:** {reason}`,
                color: '#0A0A0C',
                author: null,
                images: { thumbnail: '{guild.icon}', image: null },
                footer: { text: '{guild.name} • case #{case.id}', iconURL: null },
                fields: [],
                buttons: []
            };
        }

        return {
            savedName: `invoke_${normAction}_msg`,
            content: '{user.mention}',
            title: `✦ ${normAction}ed`,
            titleUrl: null,
            description: `• **reason:** {reason}\n• **moderator:** {moderator.mention}`,
            color: '#0A0A0C',
            author: null,
            images: { thumbnail: '{user.display_avatar}', image: null },
            footer: { text: '{guild.name} • case #{case.id}', iconURL: null },
            fields: [],
            buttons: []
        };
    }

    /**
     * Parses a raw invoke string into an embed editor state.
     */
    static invokeStringToState(rawString, action = 'warn', type = 'message') {
        const state = this.createDefaultActionState(action, type);
        if (!rawString || typeof rawString !== 'string') return state;

        const embedIdx = rawString.indexOf('{embed}');
        if (embedIdx === -1) {
            state.content = rawString.trim();
            return state;
        }

        const textBefore = rawString.substring(0, embedIdx).trim();
        state.content = textBefore || null;

        const embedRaw = rawString.substring(embedIdx + '{embed}'.length).trim();
        let blocks = [];
        if (embedRaw.includes('$v')) {
            blocks = embedRaw.split('$v').map(b => b.trim()).filter(Boolean);
        } else {
            const matches = embedRaw.match(/\{([^{}]+)\}/g);
            if (matches) blocks = matches;
        }

        state.fields = [];
        for (const block of blocks) {
            let clean = block;
            if (clean.startsWith('{') && clean.endsWith('}')) {
                clean = clean.slice(1, -1).trim();
            }
            const colonIdx = clean.indexOf(':');
            let key = '';
            let val = '';
            if (colonIdx === -1) {
                key = clean.toLowerCase();
            } else {
                key = clean.substring(0, colonIdx).trim().toLowerCase();
                val = clean.substring(colonIdx + 1).trim();
            }

            if (key === 'color' || key === 'colour') {
                state.color = val;
            } else if (key === 'title') {
                state.title = val;
            } else if (key === 'url' || key === 'titleurl') {
                state.titleUrl = val;
            } else if (key === 'description' || key === 'desc') {
                state.description = val;
            } else if (key === 'thumbnail' || key === 'thumb') {
                if (!state.images) state.images = {};
                state.images.thumbnail = val;
            } else if (key === 'image' || key === 'img') {
                if (!state.images) state.images = {};
                state.images.image = val;
            } else if (key === 'footer') {
                const parts = val.split('|').map(s => s.trim());
                state.footer = { text: parts[0] || '', iconURL: parts[1] || null };
            } else if (key === 'author') {
                const parts = val.split('|').map(s => s.trim());
                state.author = { name: parts[0] || '', iconURL: parts[1] || null, url: parts[2] || null };
            } else if (key === 'field') {
                const parts = val.split('|').map(s => s.trim());
                state.fields.push({
                    name: parts[0] || 'field',
                    value: parts[1] || 'value',
                    inline: parts[2] ? (parts[2].toLowerCase() === 'true' || parts[2] === 'inline') : false
                });
            }
        }

        return state;
    }

    /**
     * Converts an embed state back into an invoke-compatible string format.
     */
    static stateToInvokeString(state) {
        if (!state) return '';
        const parts = ['{embed}'];
        if (state.color && state.color !== 'clear') {
            let col = state.color;
            if (typeof col === 'number') {
                col = '#' + col.toString(16).padStart(6, '0');
            }
            parts.push(`{color: ${col}}`);
        }
        if (state.title) {
            parts.push(`{title: ${state.title}}`);
        }
        if (state.titleUrl) {
            parts.push(`{url: ${state.titleUrl}}`);
        }
        if (state.description) {
            parts.push(`{description: ${state.description}}`);
        }
        if (state.images?.thumbnail) {
            parts.push(`{thumbnail: ${state.images.thumbnail}}`);
        }
        if (state.images?.image) {
            parts.push(`{image: ${state.images.image}}`);
        }
        if (state.author?.name) {
            const authorParts = [state.author.name];
            if (state.author.iconURL) authorParts.push(state.author.iconURL);
            if (state.author.url) authorParts.push(state.author.url);
            parts.push(`{author: ${authorParts.join(' | ')}}`);
        }
        if (state.footer?.text) {
            const footerParts = [state.footer.text];
            if (state.footer.iconURL) footerParts.push(state.footer.iconURL);
            parts.push(`{footer: ${footerParts.join(' | ')}}`);
        }
        if (state.fields && state.fields.length > 0) {
            for (const f of state.fields) {
                parts.push(`{field: ${f.name} | ${f.value}${f.inline ? ' | inline' : ''}}`);
            }
        }
        const embedBlock = parts.join('$v');
        if (state.content) {
            return `${state.content} ${embedBlock}`.trim();
        }
        return embedBlock;
    }
}

module.exports = InvokeHelper;
