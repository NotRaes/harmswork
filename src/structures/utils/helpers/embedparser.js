const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ThumbnailBuilder,
    MessageFlags
} = require('discord.js');
const build = require('../builder.js');
const config = require('../../../config.js');

/**
 * Universal Embed & Message Parser for Harm.
 * Allows any custom message command (such as onjoin, welcome, dms, etc.)
 * to accept:
 *  1. Raw JSON copied from ,embed (or Discohook)
 *  2. Saved embed references via {embed:name} or embed:name
 *  3. Embed tag script syntax: {title: ...}{desc: ...}{color: ...}
 *  4. Standard markdown text
 *  5. Authentic Harm-style welcomedm cards (Components V2 + Embed fallback)
 *
 * All formats dynamically resolve {user}, {guild}, {inviter}, and {channels} placeholders.
 */
const BUILTIN_TEMPLATES = {
    welcomedm: {
        savedName: 'welcomedm',
        content: null,
        title: 'you were pinged in these channels',
        titleUrl: config.supportInvite || 'https://discord.gg/hCQhTmPf2G',
        description:
            `-# welcome to **{guild.name}**!\n` +
            `-# you were pinged so you can find the important places quickly:\n\n` +
            `{channels}\n\n` +
            `-# **quickstart**:\n` +
            `-# • check out the server rules\n` +
            `-# • grab your roles and notifications\n` +
            `-# • say hello in general chat!`,
        color: '#0A0A0C',
        author: {
            name: 'harm • on-join notification',
            iconURL: null,
            url: config.supportInvite || 'https://discord.gg/hCQhTmPf2G'
        },
        images: {
            thumbnail: '{guild.icon}',
            image: null
        },
        footer: {
            text: 'harm • aesthetic essentials'
        },
        fields: [],
        buttons: [
            {
                label: 'join discord',
                url: config.supportInvite || 'https://discord.gg/hCQhTmPf2G',
                emoji: '<:discord_logo:1529300434374758481>'
            }
        ]
    },
    welcome: {
        savedName: 'welcome',
        content: 'welcome to {guild.name}, {user}!',
        title: 'welcome to {guild.name}!',
        titleUrl: null,
        description:
            `-# thanks for joining **{guild.name}**!\n` +
            `-# you are member **#{guild.count}**.\n\n` +
            `-# **quickstart**:\n` +
            `-# • read the rules to keep things peaceful\n` +
            `-# • customize your roles and profile\n` +
            `-# • say hello in chat!`,
        color: '#0A0A0C',
        author: null,
        footer: {
            text: 'harm • aesthetic essentials'
        },
        images: {
            thumbnail: '{user.avatar}',
            image: null
        },
        fields: [],
        buttons: []
    },
    leave: {
        savedName: 'leave',
        content: null,
        title: 'goodbye from {guild.name}',
        titleUrl: null,
        description:
            `-# **{user.name}** has left the server.\n` +
            `-# we are now down to **{guild.count}** members.`,
        color: '#0A0A0C',
        author: null,
        footer: {
            text: 'harm • aesthetic essentials'
        },
        images: {
            thumbnail: '{user.avatar}',
            image: null
        },
        fields: [],
        buttons: []
    }
};

class EmbedParser {
    static getTemplates() {
        return BUILTIN_TEMPLATES;
    }

    static getTemplate(name) {
        if (!name || typeof name !== 'string') return null;
        const clean = name.toLowerCase().trim();
        if (clean === 'welcomedm' || clean === 'pingdm' || clean === 'autoping') {
            return JSON.parse(JSON.stringify(BUILTIN_TEMPLATES.welcomedm));
        }
        if (clean === 'welcome' || clean === 'join') {
            return JSON.parse(JSON.stringify(BUILTIN_TEMPLATES.welcome));
        }
        if (clean === 'leave' || clean === 'goodbye') {
            return JSON.parse(JSON.stringify(BUILTIN_TEMPLATES.leave));
        }
        return null;
    }
    /**
     * Resolves all dynamic placeholders across a string
     */
    static replaceVariables(text, context = {}) {
        if (typeof text !== 'string') return text;

        const member = context.member || null;
        const user = context.user || member?.user || null;
        const guild = context.guild || member?.guild || null;
        const inviter = context.inviter || null;
        const channels = context.channels || null;

        let result = text;

        if (channels) {
            result = result.replace(/\{channels\}/gi, channels);
        }

        if (user) {
            result = result
                .replace(/\{user\}/gi, `<@${user.id}>`)
                .replace(/\{user\.mention\}/gi, `<@${user.id}>`)
                .replace(/\{user\.name\}/gi, user.username)
                .replace(/\{user\.tag\}/gi, user.tag || user.username)
                .replace(/\{user\.id\}/gi, user.id)
                .replace(/\{user\.avatar\}/gi, typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ dynamic: true }) : '')
                .replace(/\{user\.created_at\}/gi, user.createdTimestamp ? `<t:${Math.floor(user.createdTimestamp / 1000)}:R>` : '');
        }

        if (guild) {
            result = result
                .replace(/\{guild\}/gi, guild.name)
                .replace(/\{server\}/gi, guild.name)
                .replace(/\{guild\.name\}/gi, guild.name)
                .replace(/\{server\.name\}/gi, guild.name)
                .replace(/\{guild\.count\}/gi, (guild.memberCount || 0).toString())
                .replace(/\{server\.count\}/gi, (guild.memberCount || 0).toString())
                .replace(/\{membercount\}/gi, (guild.memberCount || 0).toString())
                .replace(/\{member_count\}/gi, (guild.memberCount || 0).toString())
                .replace(/\{guild\.id\}/gi, guild.id)
                .replace(/\{server\.id\}/gi, guild.id)
                .replace(/\{guild\.icon\}/gi, typeof guild.iconURL === 'function' ? (guild.iconURL({ dynamic: true }) || '') : '');
        }

        const inviterName = inviter?.username || 'vanity';
        const inviterMention = inviter?.id ? `<@${inviter.id}>` : 'vanity';
        result = result
            .replace(/\{inviter\}/gi, inviterMention)
            .replace(/\{inviter\.name\}/gi, inviterName)
            .replace(/\{inviter\.mention\}/gi, inviterMention);

        return result;
    }

    /**
     * Deep variable resolution for objects and arrays
     */
    static resolveObjectVariables(obj, context = {}) {
        if (!obj) return obj;
        if (typeof obj === 'string') return EmbedParser.replaceVariables(obj, context);
        if (Array.isArray(obj)) return obj.map(item => EmbedParser.resolveObjectVariables(item, context));
        if (typeof obj === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                out[k] = EmbedParser.resolveObjectVariables(v, context);
            }
            return out;
        }
        return obj;
    }

    /**
     * Converts a Harm embed state or Discord embed object into an EmbedBuilder
     */
    static buildEmbedFromState(rawState, context = {}) {
        const state = EmbedParser.resolveObjectVariables(rawState, context);
        const embed = new EmbedBuilder();
        let hasData = false;

        if (state.title) {
            embed.setTitle(state.title.slice(0, 256));
            hasData = true;
        }
        if (state.titleUrl || state.url) {
            embed.setURL(state.titleUrl || state.url);
        }
        if (state.description) {
            embed.setDescription(state.description.slice(0, 4096));
            hasData = true;
        }

        // Color handling
        if (state.color && state.color !== 'clear') {
            try {
                embed.setColor(state.color);
            } catch (_) {
                embed.setColor(config.colors.c || 0x0A0A0C);
            }
        } else {
            embed.setColor(config.colors.c || 0x0A0A0C);
        }

        if (state.author && state.author.name) {
            embed.setAuthor({
                name: state.author.name.slice(0, 256),
                iconURL: state.author.iconURL || state.author.icon_url || null,
                url: state.author.url || null
            });
            hasData = true;
        }

        const thumb = state.images?.thumbnail || state.thumbnail?.url || state.thumbnail;
        if (typeof thumb === 'string' && thumb.startsWith('http')) {
            embed.setThumbnail(thumb);
            hasData = true;
        }

        const img = state.images?.image || state.image?.url || state.image;
        if (typeof img === 'string' && img.startsWith('http')) {
            embed.setImage(img);
            hasData = true;
        }

        if (state.footer && (state.footer.text || typeof state.footer === 'string')) {
            const fText = typeof state.footer === 'string' ? state.footer : state.footer.text;
            embed.setFooter({
                text: fText.slice(0, 2048),
                iconURL: state.footer.iconURL || state.footer.icon_url || null
            });
            if (state.footer.timestamp) {
                embed.setTimestamp();
            }
            hasData = true;
        }

        if (Array.isArray(state.fields) && state.fields.length > 0) {
            for (const f of state.fields.slice(0, 25)) {
                if (f.name && f.value) {
                    embed.addFields({
                        name: f.name.slice(0, 256),
                        value: f.value.slice(0, 1024),
                        inline: Boolean(f.inline)
                    });
                    hasData = true;
                }
            }
        }

        return hasData ? embed : null;
    }

    /**
     * Parses embed tag / script syntax with nested brace support:
     * {title: my title}{description: my text}{color: #0A0A0C}{image: url}...
     */
    static parseTagSyntax(str, context = {}) {
        const state = {
            content: null,
            title: null,
            titleUrl: null,
            description: null,
            color: null,
            author: null,
            images: { thumbnail: null, image: null },
            footer: null,
            fields: []
        };

        const tagRegex = /\{([a-z0-9_-]+):\s*((?:[^{}]|\{[^{}]*\})*)\}/gi;
        let match;
        let hasTags = false;

        while ((match = tagRegex.exec(str)) !== null) {
            hasTags = true;
            const key = match[1].toLowerCase().trim();
            const val = EmbedParser.replaceVariables(match[2].trim(), context);

            if (key === 'content' || key === 'message') state.content = val;
            else if (key === 'title') state.title = val;
            else if (key === 'titleurl' || key === 'url') state.titleUrl = val;
            else if (key === 'desc' || key === 'description') state.description = val;
            else if (key === 'color' || key === 'colour') state.color = val;
            else if (key === 'image' || key === 'img') state.images.image = val;
            else if (key === 'thumb' || key === 'thumbnail') state.images.thumbnail = val;
            else if (key === 'footer') state.footer = { text: val };
            else if (key === 'author') state.author = { name: val };
            else if (key === 'field') {
                const parts = val.split('&&');
                if (parts.length >= 2) {
                    state.fields.push({
                        name: parts[0].trim(),
                        value: parts[1].trim(),
                        inline: parts[2]?.trim() === 'true'
                    });
                }
            }
        }

        if (!hasTags) return null;

        if (!state.content) {
            const remaining = str.replace(tagRegex, '').trim();
            if (remaining) state.content = EmbedParser.replaceVariables(remaining, context);
        }

        return state;
    }

    /**
     * Builds a signature Harm-style welcomedm card.
     * Modeled after the welcomedm standard:
     *  - Dark mode #0A0A0C
     *  - Wide glowing banner
     *  - Section with thumbnail accessory
     *  - Calm lowercase -# subtext
     *  - Action row link buttons
     *  - Components V2 with Embed fallback
     */
    static buildHarmStyleWelcomeDM(options = {}) {
        const {
            guild,
            user,
            title = 'you were pinged in these channels',
            description,
            channels = '',
            supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G',
            bannerName = 'banner.png',
            thumbnailUrl = null
        } = options;

        const guildName = guild?.name || 'the server';
        const serverUrl = guild?.id ? `https://discord.com/channels/${guild.id}` : supportUrl;

        let descBody = description;
        if (!descBody) {
            descBody =
                `welcome to **${guildName.toLowerCase()}**.\n` +
                `-# i pinged you in these channels so you can find the important places quickly:\n\n` +
                (channels || '-# • *(no channels specified)*');
        }

        const bannerAttachment = build.getAssetAttachment(bannerName) || build.getAssetAttachment('utility.png') || build.getAssetAttachment('banner.png');
        const files = [];
        if (bannerAttachment) files.push(bannerAttachment);

        let resolvedThumbnail = thumbnailUrl;
        if (!resolvedThumbnail && guild && typeof guild.iconURL === 'function' && guild.iconURL()) {
            resolvedThumbnail = guild.iconURL({ size: 1024, dynamic: true });
        }
        if (!resolvedThumbnail && guild?.client?.user?.displayAvatarURL) {
            resolvedThumbnail = guild.client.user.displayAvatarURL({ size: 1024, dynamic: true });
        }

        // 1. Components V2 Container
        const container = new ContainerBuilder();
        const accent = typeof config.colors.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors.c || 0x2b2d31);
        container.setAccentColor(accent);

        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### [${title.toLowerCase()}](${serverUrl})\n` +
                `${descBody}`
            )
        );

        if (resolvedThumbnail) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(resolvedThumbnail));
        }

        container.addSectionComponents(section);

        if (bannerAttachment) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachment.name}`)
                )
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('view server')
                .setEmoji(config.emojis?.harm || '<:harmsdio:1556221836507742278>')
                .setURL(serverUrl),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('support')
                .setEmoji('<:discord_logo:1529300434374758481>')
                .setURL(supportUrl)
        );
        container.addActionRowComponents(row);

        // 2. Embed Fallback
        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || '#2b2d31')
            .setTitle(title.toLowerCase())
            .setURL(serverUrl)
            .setDescription(descBody);

        if (resolvedThumbnail && !resolvedThumbnail.startsWith('attachment://')) {
            fallbackEmbed.setThumbnail(resolvedThumbnail);
        }
        if (bannerAttachment) {
            fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);
        }

        return {
            componentsV2: {
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            },
            embedFallback: {
                embeds: [fallbackEmbed],
                components: [row],
                files
            }
        };
    }

    /**
     * Master parser method: parses any raw message input into a ready-to-send Discord payload.
     * Supports:
     *   - JSON string (copied from ,embed or Discohook)
     *   - {embed:name} reference to saved embed in cases.db
     *   - Tag script format ({title: ...}{desc: ...})
     *   - Plain text markdown with variable replacement
     */
    static async parse(input, context = {}, db = null, guildId = null) {
        if (!input || typeof input !== 'string') {
            return { content: '' };
        }

        const trimmed = input.trim();

        // 1. Check for saved embed reference: {embed:name} or embed:name
        const embedRefMatch = trimmed.match(/^\{?embed:\s*([a-z0-9_-]+)\}?$/i);
        if (embedRefMatch) {
            const embedName = embedRefMatch[1].toLowerCase();
            let stateData = null;
            if (db && guildId) {
                const saved = await db.getEmbed(guildId, embedName);
                if (saved && saved.parsedData) {
                    stateData = saved.parsedData;
                }
            }
            if (!stateData) {
                stateData = EmbedParser.getTemplate(embedName);
            }
            if (stateData) {
                const embed = EmbedParser.buildEmbedFromState(stateData, context);
                const payload = {};
                if (embed) payload.embeds = [embed];
                if (stateData.content) {
                    payload.content = EmbedParser.replaceVariables(stateData.content, context);
                }
                return payload;
            }
        }

        // 2. Check for raw JSON format (copied from ,embed or Discohook)
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object') {
                    // Standard Discord API JSON: { content: "...", embeds: [ ... ] }
                    if (Array.isArray(parsed.embeds) && parsed.embeds.length > 0) {
                        const builtEmbeds = parsed.embeds
                            .map(em => EmbedParser.buildEmbedFromState(em, context))
                            .filter(Boolean);
                        const payload = {};
                        if (builtEmbeds.length > 0) payload.embeds = builtEmbeds;
                        if (parsed.content) {
                            payload.content = EmbedParser.replaceVariables(parsed.content, context);
                        }
                        return payload;
                    }

                    // Harm Embed State format: { title, description, color, ... }
                    const embed = EmbedParser.buildEmbedFromState(parsed, context);
                    const payload = {};
                    if (embed) payload.embeds = [embed];
                    if (parsed.content) {
                        payload.content = EmbedParser.replaceVariables(parsed.content, context);
                    }
                    if (payload.embeds || payload.content) return payload;
                }
            } catch (_) {
                // Not valid JSON, continue to tag or plain text parser
            }
        }

        // 3. Check for tag / script syntax: {title: ...}{desc: ...}
        const tagState = EmbedParser.parseTagSyntax(trimmed, context);
        if (tagState) {
            const embed = EmbedParser.buildEmbedFromState(tagState, context);
            const payload = {};
            if (embed) payload.embeds = [embed];
            if (tagState.content) {
                payload.content = EmbedParser.replaceVariables(tagState.content, context);
            }
            if (payload.embeds || payload.content) return payload;
        }

        // 4. Plain text markdown fallback
        const resolvedText = EmbedParser.replaceVariables(trimmed, context);
        return { content: resolvedText };
    }
}

module.exports = EmbedParser;
