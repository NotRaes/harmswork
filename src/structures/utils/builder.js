const path = require('path');
const fs = require('fs');
const {
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const config = require('../../config');
const defaultColor = config.colors?.c || '#0A0A0C';
const color = defaultColor;
const defaultAccent = typeof defaultColor === 'string' ? parseInt(defaultColor.replace('#', ''), 16) : (defaultColor || 0x0A0A0C);

/*
 *  Discord Components V2 Fluent Builder — Harm
 *  fluent builder for modern Components V2 containers with automatic EmbedBuilder fallback.
 */
class V2Builder {
    constructor({ accent = defaultAccent } = {}) {
        this.accent = typeof accent === 'string' ? parseInt(accent.replace('#', ''), 16) : accent;
        this.elements = [];
        this.actionRows = [];
        this.files = [];
        this._header = null;
        this._banner = null;
    }

    setAccent(accentColor) {
        this.accent = typeof accentColor === 'string' ? parseInt(accentColor.replace('#', ''), 16) : accentColor;
        return this;
    }

    setHeader(title, subtitle = null, url = null, thumbnail = null) {
        this._header = { title, subtitle, url, thumbnail };
        return this;
    }

    addText(content) {
        if (!content) return this;
        const text = Array.isArray(content) ? content.join('\n') : String(content);
        this.elements.push({ type: 'text', text });
        return this;
    }

    addSubtext(lines) {
        if (!lines) return this;
        const arr = Array.isArray(lines) ? lines : [lines];
        const text = arr.map(l => l.startsWith('-# ') ? l : `-# ${l}`).join('\n');
        this.elements.push({ type: 'text', text });
        return this;
    }

    addCode(language, code) {
        this.elements.push({ type: 'text', text: `\`\`\`${language}\n${code}\n\`\`\`` });
        return this;
    }

    addSection(content, thumbnail = null) {
        const text = Array.isArray(content) ? content.join('\n') : String(content);
        this.elements.push({ type: 'section', text, thumbnail });
        return this;
    }

    addDivider(spacing = SeparatorSpacingSize.Small) {
        this.elements.push({ type: 'divider', spacing });
        return this;
    }

    setBanner(urlOrAttachment, position = 'bottom') {
        if (!urlOrAttachment) return this;
        if (typeof urlOrAttachment === 'string') {
            this._banner = urlOrAttachment;
        } else if (urlOrAttachment.name) {
            this._banner = `attachment://${urlOrAttachment.name}`;
            this.addFile(urlOrAttachment);
        }
        this._bannerPosition = position;
        return this;
    }

    addFile(attachment) {
        if (attachment) this.files.push(attachment);
        return this;
    }

    addRow(...components) {
        if (!components.length) return this;
        const row = new ActionRowBuilder();
        for (const c of components) {
            if (Array.isArray(c)) row.addComponents(...c);
            else row.addComponents(c);
        }
        this.actionRows.push(row);
        return this;
    }

    addButton({ label, style = ButtonStyle.Secondary, customId, url, emoji, disabled = false }) {
        const btn = new ButtonBuilder().setStyle(style).setDisabled(disabled);
        if (label) btn.setLabel(label);
        if (customId) btn.setCustomId(customId);
        if (url) {
            btn.setURL(url);
            btn.setStyle(ButtonStyle.Link);
        }
        if (emoji) btn.setEmoji(emoji);

        let lastRow = this.actionRows[this.actionRows.length - 1];
        if (!lastRow || lastRow.components.length >= 5 || lastRow.components[0]?.data?.type === 3) {
            lastRow = new ActionRowBuilder();
            this.actionRows.push(lastRow);
        }
        lastRow.addComponents(btn);
        return this;
    }

    addSelect({ customId, placeholder = 'choose an option...', options = [] }) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder);

        for (const opt of options) {
            const o = new StringSelectMenuOptionBuilder()
                .setLabel(opt.label)
                .setValue(opt.value);
            if (opt.description) o.setDescription(opt.description);
            if (opt.emoji) o.setEmoji(opt.emoji);
            if (opt.default) o.setDefault(opt.default);
            menu.addOptions(o);
        }

        const row = new ActionRowBuilder().addComponents(menu);
        this.actionRows.push(row);
        return this;
    }

    toContainer() {
        const container = new ContainerBuilder();
        if (this.accent !== null && this.accent !== undefined) {
            container.setAccentColor(this.accent);
        }

        if (this._banner && this._bannerPosition === 'top') {
            const gallery = new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(this._banner)
            );
            container.addMediaGalleryComponents(gallery);
        }

        if (this._header) {
            const { title, subtitle, url, thumbnail } = this._header;
            const heading = url ? `### [${title}](${url})` : `### ${title}`;
            const headerContent = subtitle ? `${heading}\n-# ${subtitle}` : heading;

            if (thumbnail) {
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail))
                );
            } else {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));
            }
        }

        for (const el of this.elements) {
            if (el.type === 'text') {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(el.text));
            } else if (el.type === 'section') {
                const sec = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(el.text)
                );
                if (el.thumbnail) {
                    sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(el.thumbnail));
                }
                container.addSectionComponents(sec);
            } else if (el.type === 'divider') {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(el.spacing || SeparatorSpacingSize.Small)
                );
            }
        }

        if (this._banner && this._bannerPosition !== 'top') {
            const gallery = new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(this._banner)
            );
            container.addMediaGalleryComponents(gallery);
        }

        if (this.actionRows.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            for (const row of this.actionRows) {
                container.addActionRowComponents(row);
            }
        }

        return container;
    }

    toEmbed() {
        const embed = new EmbedBuilder().setColor(this.accent || defaultAccent);
        const parts = [];

        if (this._header) {
            const { title, subtitle, url } = this._header;
            const heading = url ? `### [${title}](${url})` : `### ${title}`;
            parts.push(subtitle ? `${heading}\n-# ${subtitle}` : heading);
            if (this._header.thumbnail) embed.setThumbnail(this._header.thumbnail);
        }

        for (const el of this.elements) {
            if (el.type === 'text' || el.type === 'section') {
                parts.push(el.text);
            }
        }

        if (parts.length > 0) embed.setDescription(parts.join('\n\n'));
        if (this._banner) embed.setImage(this._banner);

        return embed;
    }

    toPayload() {
        return {
            components: [this.toContainer()],
            files: this.files,
            allowedMentions: { repliedUser: false },
            flags: MessageFlags.IsComponentsV2
        };
    }

    async send(target, { reply = true } = {}) {
        if (this.actionRows.length > 0) {
            const embed = this.toEmbed();
            const payload = {
                embeds: [embed],
                components: this.actionRows,
                files: this.files,
                allowedMentions: { repliedUser: false }
            };
            if (reply && typeof target.reply === 'function') {
                return await target.reply(payload).catch(() => {});
            }
            if (typeof target.send === 'function') {
                return await target.send(payload).catch(() => {});
            }
            if (typeof target.channel?.send === 'function') {
                return await target.channel.send(payload).catch(() => {});
            }
        }

        try {
            const payload = this.toPayload();
            if (reply && typeof target.reply === 'function') {
                return await target.reply(payload);
            }
            if (typeof target.send === 'function') {
                return await target.send(payload);
            }
            if (typeof target.channel?.send === 'function') {
                return await target.channel.send(payload);
            }
        } catch (_) {
            const fallbackEmbed = this.toEmbed();
            const fallbackPayload = {
                embeds: [fallbackEmbed],
                components: this.actionRows,
                files: this.files,
                allowedMentions: { repliedUser: false }
            };
            if (reply && typeof target.reply === 'function') {
                return await target.reply(fallbackPayload).catch(() => {});
            }
            if (typeof target.send === 'function') {
                return await target.send(fallbackPayload).catch(() => {});
            }
            if (typeof target.channel?.send === 'function') {
                return await target.channel.send(fallbackPayload).catch(() => {});
            }
        }
    }
}

class build {
    constructor() {
        this.embed = new EmbedBuilder().setColor(color);
        this.sections = [];
    }

    setStyledAuthor(title, iconURL = null) {

        this.embed.setAuthor({
            name: title,
            iconURL: iconURL || null
        });
        return this;
    }

    addSection(content, addSpacing = true) {
        if (addSpacing && this.sections.length > 0) {
            this.sections.push('');
        }

        if (Array.isArray(content)) {
            this.sections.push(...content.map(line => `${line}`));
        } else {
            this.sections.push(`${content}`);
        }
        return this;
    }

    addTitledSection(title, items, titleEmoji = null) {
        const sectionTitle = titleEmoji ? `${titleEmoji} **${title}**` : `**${title}**`;
        this.addSection(sectionTitle, this.sections.length > 0);
        this.addSection('', false);

        if (Array.isArray(items)) {
            items.forEach(item => {
                this.sections.push(`${item}`);
            });
        }
        return this;
    }

    addTitledSectionClean(title, items, titleEmoji = null, compact = false, noSpacingBefore = false) {
        if (!noSpacingBefore && this.sections.length > 0) {
            this.sections.push('');
        }

        const sectionTitle = titleEmoji ? `${titleEmoji} ${title}` : title;
        this.sections.push(sectionTitle);

        if (!compact) {
            this.sections.push('');
        }

        if (Array.isArray(items)) {
            items.forEach(item => {
                this.sections.push(`${item}`);
            });
        }
        return this;
    }

    addStatus(label, value, emoji = null) {
        const statusEmoji = emoji;
        const statusLine = `${statusEmoji} **${label}:** \`${value}\``;
        this.sections.push(`${statusLine}`);
        return this;
    }

    addHighlight(text, emoji = null) {
        const highlight = emoji ? `${emoji} *${text}*` : `*${text}*`;
        this.sections.push(`${highlight}`);
        return this;
    }

    addSeparator() {
        this.sections.push('');
        return this;
    }

    setStyledFooter(text, iconURL = null) {

        this.embed.setFooter({
            text: text,
            iconURL: iconURL || null
        });
        return this;
    }

    addThumbnail(url) {
        if (url) this.embed.setThumbnail(url);
        return this;
    }

    setImage(url) {
        if (url) this.embed.setImage(url);
        return this;
    }

    addTimestamp() {
        this.embed.setTimestamp();
        return this;
    }

    build() {
        if (this.sections.length > 0) {
            this.embed.setDescription(this.sections.join('\n'));
        }
        return this.embed;
    }

    static panel({
        title,
        titleUrl = null,
        subtitle = null,
        thumbnail = null,
        accentColor = defaultAccent,
        sections = [],
        media = [],
        actionRows = []
    } = {}) {
        const container = new ContainerBuilder();
        if (accentColor !== null && accentColor !== undefined) {
            container.setAccentColor(accentColor);
        }

        if (title) {
            const heading = titleUrl ? `### [${title}](${titleUrl})` : `### ${title}`;
            const headerContent = subtitle ? `${heading}\n-# ${subtitle}` : heading;
            if (thumbnail) {
                const headerSection = new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
                container.addSectionComponents(headerSection);
            } else {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(headerContent)
                );
            }
        }

        if (sections && Array.isArray(sections)) {
            for (const sec of sections) {
                if (!sec) continue;
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                const content = Array.isArray(sec) ? sec.join('\n') : sec;
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(content)
                );
            }
        }

        if (media && Array.isArray(media) && media.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            const mediaGallery = new MediaGalleryBuilder();
            for (const url of media) {
                if (url) mediaGallery.addItems(new MediaGalleryItemBuilder().setURL(url));
            }
            container.addMediaGalleryComponents(mediaGallery);
        }

        if (actionRows && Array.isArray(actionRows) && actionRows.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            for (const row of actionRows) {
                container.addActionRowComponents(row);
            }
        }

        return container;
    }

    static async help(message, command) {
        const client = message.client || message.guild?.client;
        const prefix = (message.guild && client?.db) ? (client.db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
        const botAvatar = (client?.user || message.guild?.members?.me?.user)?.displayAvatarURL({ size: 1024, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const cmdName = command.name ? command.name.toLowerCase() : 'command';
        const title = cmdName.toLowerCase();
        const desc = command.description || 'no description provided.';

        const aliasesText = (command.aliases && command.aliases.length > 0)
            ? command.aliases.join(', ')
            : 'none';
        const permissionsText = (command.permissions && command.permissions.length > 0)
            ? command.permissions.map(p => p.toLowerCase()).join(', ')
            : 'none';

        const isCf = cmdName === 'coinflip' || cmdName === 'cf' || command.name === 'coinflip' || command.hideHint;
        const subcommands = Array.isArray(command.subcommands)
            ? command.subcommands.filter(s => Boolean(s) && s.trim().toLowerCase() !== cmdName.toLowerCase() && s.trim().toLowerCase() !== `${cmdName} ${cmdName}`)
            : [];
        const hasSubcommands = subcommands.length > 0;

        let syntaxText = command.syntax || `${prefix}${cmdName}`;
        if (!syntaxText.startsWith(prefix)) syntaxText = `${prefix}${syntaxText}`;

        let exampleText = command.example || syntaxText;
        if (!exampleText.startsWith(prefix)) exampleText = `${prefix}${exampleText}`;

        // Page count:
        // Page 0: Main command overview
        // Page 1: Subcommands list
        // Pages 2..(subcommands.length + 1): Individual subcommand details
        const totalPages = hasSubcommands ? (2 + subcommands.length) : 1;
        let currentPage = 0;
        let dropdownOpen = false;

        const cat = (command.category || 'help').toLowerCase();
        const bannerAttachment = build.getAssetAttachment(`${cat}.png`) || build.getAssetAttachment('help.png');
        const files = bannerAttachment ? [bannerAttachment] : [];

        const buildPageEmbed = (pageIdx) => {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || defaultAccent)
                .setThumbnail(botAvatar);

            if (pageIdx === 0) {
                // Page 0: Main command overview
                const premEmoji = config.emojis?.premium || '<:harm_premium:1558810882795114536>';
                const tierBadge = command.paid
                    ? ` • **tier:** premium ${premEmoji}${command.freeuses ? ` (${command.freeuses} free uses)` : ''}`
                    : '';

                const ansiCode = `\`\`\`ansi\n\u001b[0;32msyntax:\u001b[0m  ${syntaxText}\n\u001b[0;31mexample:\u001b[0m ${exampleText}\n\`\`\``;
                embed.setDescription(
                    `## ${title.toLowerCase()}\n${desc.toLowerCase()}\n\n` +
                    `**aliases:** ${aliasesText} • **permissions:** ${permissionsText}${tierBadge}\n\n` +
                    ansiCode
                );
            } else if (pageIdx === 1) {
                // Page 1: Subcommands list
                const formattedList = subcommands.map(s => {
                    const clean = s.replace(new RegExp('^' + cmdName + '\\s*', 'i'), '').trim();
                    return `  • ${prefix}${cmdName} ${clean}`;
                }).join('\n');

                const ansiCode = `\`\`\`ansi\n\u001b[0;32msyntax:\u001b[0m  ${prefix}${cmdName} <subcommand>\n\u001b[0;31msubcommands (${subcommands.length}):\u001b[0m\n${formattedList}\n\`\`\``;
                embed.setDescription(
                    `## ${title.toLowerCase()} subcommands\nall available subcommands for ${cmdName}.\n\n` +
                    `**total subcommands:** \`${subcommands.length}\` • **permissions:** ${permissionsText}\n\n` +
                    ansiCode
                );
            } else {
                // Pages 2..N: Specific subcommand details
                const subIdx = pageIdx - 2;
                const rawSub = subcommands[subIdx];
                const cleanSub = rawSub.replace(new RegExp('^' + cmdName + '\\s*', 'i'), '').trim();
                const subTitle = `${title.toLowerCase()}: ${cleanSub.split(/\s+/)[0]}`;

                let subSyntax = `${prefix}${rawSub.startsWith(cmdName) ? rawSub : `${cmdName} ${cleanSub}`}`;
                let subExample = subSyntax;

                const ansiCode = `\`\`\`ansi\n\u001b[0;32msyntax:\u001b[0m  ${subSyntax}\n\u001b[0;31mexample:\u001b[0m ${exampleText}\n\`\`\``;
                embed.setDescription(
                    `## ${subTitle.toLowerCase()}\nsubcommand of ${cmdName.toLowerCase()}.\n\n` +
                    `**command:** ${cmdName} • **subcommand:** \`${cleanSub.split(/\s+/)[0]}\`\n\n` +
                    ansiCode +
                    `\n\n-# **subcommand ${subIdx + 1} of ${subcommands.length}** • parameters in \`<>\` are required, \`[]\` are optional.`
                );
            }

            if (bannerAttachment) {
                embed.setImage(`attachment://${bannerAttachment.name}`);
            }

            return embed;
        };

        const buildNavRow = (disabled = false) => {
            if (!hasSubcommands) return null;
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_prev')
                    .setEmoji(config.emojis.al)
                    .setDisabled(disabled)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('help_next')
                    .setEmoji(config.emojis.ar)
                    .setDisabled(disabled)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('help_close')
                    .setEmoji(config.emojis.cancel)
                    .setDisabled(disabled)
                    .setStyle(ButtonStyle.Secondary)
            );
        };

        try {
            const initialEmbed = buildPageEmbed(currentPage);
            const navRow = buildNavRow(false);
            const sendOptions = {
                embeds: [initialEmbed],
                files,
                allowedMentions: { repliedUser: false }
            };
            if (navRow) sendOptions.components = [navRow];

            const replyMsg = await message.reply(sendOptions);

            if (!hasSubcommands) return replyMsg;

            const collector = replyMsg.createMessageComponentCollector({
                time: 30000
            });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: 'only the command author can control this menu.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }

                if (i.customId === 'help_prev') {
                    currentPage = (currentPage - 1 + totalPages) % totalPages;
                } else if (i.customId === 'help_next') {
                    currentPage = (currentPage + 1) % totalPages;
                } else if (i.customId === 'help_close') {
                    collector.stop('closed');
                    return replyMsg.delete().catch(() => {});
                }

                collector.resetTimer?.();

                await i.update({
                    embeds: [buildPageEmbed(currentPage)],
                    components: [buildNavRow(false)]
                }).catch(() => {});
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'deleted' || reason === 'closed') return;
                await replyMsg.edit({
                    embeds: [buildPageEmbed(currentPage)],
                    components: [buildNavRow(true)],
                    skipV2: true
                }).catch(() => {});
            });

            return replyMsg;
        } catch (err) {
            console.error('[build.help] failed:', err);
            let fallbackDesc = `## ${title.toLowerCase()}\n${desc.toLowerCase()}\n\n` +
                `**aliases:** ${aliasesText} • **permissions:** ${permissionsText}\n\n` +
                `\`\`\`ansi\n\u001b[0;32msyntax:\u001b[0m  ${syntaxText}\n\u001b[0;31mexample:\u001b[0m ${exampleText}\n\`\`\``;

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || defaultAccent)
                .setDescription(fallbackDesc);
            return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
        }
    }

    static async helpSubcommand(message, command, subMatch) {
        const client = message.client || message.guild?.client;
        const prefix = (message.guild && client?.db) ? (client.db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
        const botAvatar = (client?.user || message.guild?.members?.me?.user)?.displayAvatarURL({ size: 1024, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const cmdName = command.name ? command.name.toLowerCase() : 'command';
        const cleanSub = subMatch.toLowerCase().startsWith(cmdName) ? subMatch.toLowerCase() : `${cmdName} ${subMatch.toLowerCase()}`;
        const subOnly = subMatch.toLowerCase().replace(new RegExp('^' + cmdName + '\\s*', 'i'), '').trim();
        const subTitle = `${cmdName} ${subOnly}`.trim();

        const details = command.subcommandDetails?.[subOnly] ||
                        command.subcommandDetails?.[cleanSub] ||
                        command.subcommandDescriptions?.[subOnly] ||
                        command.subcommandDescriptions?.[cleanSub];

        let desc = command.description || 'no description provided.';
        let syntax = `${prefix}${cleanSub}`;
        let example = `${prefix}${cleanSub}`;

        if (typeof details === 'string') {
            desc = details;
        } else if (details && typeof details === 'object') {
            if (details.description) desc = details.description;
            if (details.syntax) syntax = details.syntax;
            if (details.example) example = details.example;
        }

        const permissionsText = (command.permissions && command.permissions.length > 0)
            ? command.permissions.map(p => p.toLowerCase()).join(', ')
            : 'none';

        const ansiContent = `\`\`\`ansi\n\u001b[0;32msyntax:\u001b[0m  ${syntax}\n\u001b[0;31mexample:\u001b[0m ${example}\n\`\`\``;
        const fallbackDesc = `## ${subTitle.toLowerCase()}\n${desc.toLowerCase()}\n\n` +
            `**command:** ${cmdName} • **permissions:** ${permissionsText}\n\n` +
            ansiContent;

        const cat = (command.category || 'help').toLowerCase();
        const bannerAttachment = build.getAssetAttachment(`${cat}.png`) || build.getAssetAttachment('help.png');
        const files = bannerAttachment ? [bannerAttachment] : [];

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || defaultAccent)
            .setThumbnail(botAvatar)
            .setDescription(fallbackDesc);

        if (bannerAttachment) {
            embed.setImage(`attachment://${bannerAttachment.name}`);
        }

        return message.reply({ embeds: [embed], files, allowedMentions: { repliedUser: false } });
    }

    static deny(user, message) {
        let title = 'denied';
        let text = message;
        if (!message) {
            text = user;
        } else if (typeof user === 'string' && !user.startsWith('<@')) {
            title = user.toLowerCase();
        }
        const cleanText = (typeof text === 'string' && !text.startsWith('<') && !text.startsWith('http') && !text.startsWith('`'))
            ? (text.charAt(0).toLowerCase() + text.slice(1))
            : text;
        return new EmbedBuilder()
            .setDescription(`${config.emojis.deny} **${title.toLowerCase()}** — ${cleanText}`)
            .setColor(defaultColor);
    }

    static warn(user, message) {
        let title = 'warning';
        let text = message;
        if (!message) {
            text = user;
        } else if (typeof user === 'string' && !user.startsWith('<@')) {
            title = user.toLowerCase();
        }
        const cleanText = (typeof text === 'string' && !text.startsWith('<') && !text.startsWith('http') && !text.startsWith('`'))
            ? (text.charAt(0).toLowerCase() + text.slice(1))
            : text;
        return new EmbedBuilder()
            .setDescription(`${config.emojis.warn} **${title.toLowerCase()}** — ${cleanText}`)
            .setColor(defaultColor);
    }

    static approved(user, message) {
        let title = 'success';
        let text = message;
        if (!message) {
            text = user;
        } else if (typeof user === 'string' && !user.startsWith('<@')) {
            title = user.toLowerCase();
        }
        const cleanText = (typeof text === 'string' && !text.startsWith('<') && !text.startsWith('http') && !text.startsWith('`'))
            ? (text.charAt(0).toLowerCase() + text.slice(1))
            : text;
        return new EmbedBuilder()
            .setDescription(`${config.emojis.approve} **${title.toLowerCase()}** — ${cleanText}`)
            .setColor(defaultColor);
    }

    static say(user, message) {
        const desc = user ? `<@${user.id || user}>**:** ${message}` : message;
        return new EmbedBuilder()
            .setDescription(desc)
            .setColor(defaultColor);
    }

    static sayBox(title, message) {
        return build.noticeBox('say', title, message);
    }

    static warnBox(title, message) {
        return build.noticeBox('warn', title, message);
    }

    static denyBox(title, message) {
        return build.noticeBox('deny', title, message);
    }

    static approvedBox(title, message) {
        return build.noticeBox('approve', title, message);
    }

    static noticeBox(type, title, message) {
        let t = title;
        let m = message;
        if (m === undefined) {
            m = t;
            t = null;
        }
        const emoji = type === 'warn' ? (config.emojis?.warn || '<:harm_warn:1558811265097531412>')
            : type === 'deny' ? (config.emojis?.deny || '<:harm_deny:1558811268608167939>')
            : type === 'approve' ? (config.emojis?.approve || '<:harm_tick:1558811267014066366>')
            : (config.emojis?.harm || '<:harmsdio:1556221836507742278>');
        const cleanTitle = t ? t.toLowerCase() : null;
        const cleanMsg = (typeof m === 'string' && !m.startsWith('<') && !m.startsWith('http') && !m.startsWith('`'))
            ? (m.charAt(0).toLowerCase() + m.slice(1))
            : m;
        const content = cleanTitle ? `${emoji} **${cleanTitle}** — ${cleanMsg}` : `${emoji} ${cleanMsg}`;
        const container = new ContainerBuilder();
        container.setAccentColor(defaultAccent);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
        );
        return {
            components: [container],
            allowedMentions: { repliedUser: false },
            flags: MessageFlags.IsComponentsV2
        };
    }

    static embedToContainer(embed, actionRows = []) {
        if (!embed) return null;
        if (embed._noticeBox && embed._noticeBox.components && embed._noticeBox.components[0]) {
            const c = embed._noticeBox.components[0];
            if (actionRows && actionRows.length > 0) {
                c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
                for (const r of actionRows) c.addActionRowComponents(r);
            }
            return c;
        }

        if (embed instanceof ContainerBuilder) return embed;
        if (embed && embed.data && embed.data.type === 17) return embed;

        const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
        if (!data || typeof data !== 'object') return null;

        const container = new ContainerBuilder();
        const accent = (data.color !== undefined && data.color !== null) ? data.color : defaultAccent;
        container.setAccentColor(accent);

        const authorName = data.author?.name ? String(data.author.name) : null;
        const authorUrl = data.author?.url;
        const authorText = authorName ? (authorUrl ? `[${authorName}](${authorUrl})` : authorName) : null;

        const titleText = data.title ? (data.url ? `### [${data.title}](${data.url})` : `### ${data.title}`) : null;

        const headerLines = [];
        if (authorText) headerLines.push(authorText);
        if (titleText) headerLines.push(titleText);
        const headerContent = headerLines.join('\n');

        const thumbUrl = data.thumbnail?.url || data.author?.icon_url;
        const desc = data.description ? String(data.description) : '';

        if (thumbUrl && headerContent) {
            const sec = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
            container.addSectionComponents(sec);
            if (desc) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
            }
        } else if (thumbUrl && desc) {
            const sec = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
            container.addSectionComponents(sec);
        } else {
            if (headerContent) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent));
            }
            if (desc) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));
            }
        }

        if (Array.isArray(data.fields) && data.fields.length > 0) {
            const fieldChunks = [];
            for (const f of data.fields) {
                if (f && f.name) {
                    fieldChunks.push(`**${f.name}**\n${f.value || ''}`);
                }
            }
            if (fieldChunks.length > 0) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldChunks.join('\n\n')));
            }
        }

        const footerParts = [];
        if (data.footer?.text) footerParts.push(data.footer.text);
        if (data.timestamp) {
            const unix = Math.floor(new Date(data.timestamp).getTime() / 1000);
            if (!isNaN(unix)) footerParts.push(`<t:${unix}:R>`);
        }
        if (footerParts.length > 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerParts.join(' • ')}`));
        }

        if (data.image?.url) {
            const gallery = new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(data.image.url)
            );
            container.addMediaGalleryComponents(gallery);
        }

        if (Array.isArray(actionRows) && actionRows.length > 0) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            for (const row of actionRows) {
                container.addActionRowComponents(row);
            }
        }

        if (!container.components || container.components.length === 0) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent('\u200B'));
        }

        return container;
    }

    static transformToV2Options(options, isEdit = false) {
        if (!options) return options;
        if (typeof options === 'string') return options;
        if (options.skipV2) return options;

        if (options instanceof EmbedBuilder) {
            options = { embeds: [options] };
        }

        // Already marked as Components V2?
        const hasV2Flag = typeof options.flags === 'number' && (options.flags & MessageFlags.IsComponentsV2) !== 0;
        if (hasV2Flag && Array.isArray(options.components) && options.components.length > 0) {
            return options;
        }

        // If options.components already has a Container
        if (Array.isArray(options.components) && options.components.some(c => (c instanceof ContainerBuilder) || c?.data?.type === 17)) {
            const ephemeralFlag = options.ephemeral ? MessageFlags.Ephemeral : 0;
            return {
                ...options,
                flags: (typeof options.flags === 'number' ? options.flags : 0) | MessageFlags.IsComponentsV2 | ephemeralFlag
            };
        }

        // Check if embeds exist
        if (Array.isArray(options.embeds) && options.embeds.length > 0) {
            const containers = [];
            const actionRows = Array.isArray(options.components) ? options.components : [];

            for (let i = 0; i < options.embeds.length; i++) {
                const emb = options.embeds[i];
                const isLast = (i === options.embeds.length - 1);
                const container = build.embedToContainer(emb, isLast ? actionRows : []);
                if (container) containers.push(container);
            }

            if (containers.length > 0) {
                const ephemeralFlag = options.ephemeral ? MessageFlags.Ephemeral : 0;
                const newFlags = (typeof options.flags === 'number' ? options.flags : 0) | MessageFlags.IsComponentsV2 | ephemeralFlag;
                const res = {
                    ...options,
                    components: containers,
                    flags: newFlags,
                    allowedMentions: options.allowedMentions || { repliedUser: false }
                };
                res.embeds = [];
                return res;
            }
        }

        // Check if options itself is a noticeBox (or has _noticeBox)
        if (options._noticeBox) {
            const ephemeralFlag = options.ephemeral ? MessageFlags.Ephemeral : 0;
            const newFlags = (typeof options.flags === 'number' ? options.flags : 0) | MessageFlags.IsComponentsV2 | ephemeralFlag;
            const res = {
                ...options._noticeBox,
                flags: newFlags,
                allowedMentions: options.allowedMentions || { repliedUser: false }
            };
            if (isEdit) res.embeds = [];
            return res;
        }

        return options;
    }

    // in-memory buffer cache — zero disk I/O and zero file descriptor allocations on subsequent calls
    static _assetBufferCache = new Map();

    static getAssetAttachment(filename) {
        if (build._assetBufferCache.has(filename)) {
            const cachedBuf = build._assetBufferCache.get(filename);
            return cachedBuf ? new AttachmentBuilder(cachedBuf, { name: filename }) : null;
        }

        const candidatePaths = [
            path.resolve(__dirname, 'assets/on add', filename),
            path.resolve(__dirname, 'assets/banners', filename),
            path.resolve(__dirname, 'assets', filename),
            path.resolve(__dirname, '../../../assets/on add', filename),
            path.resolve(__dirname, '../../../assets/banners', filename),
            path.resolve(__dirname, '../../../../assets/on add', filename)
        ];
        for (const candidate of candidatePaths) {
            if (fs.existsSync(candidate)) {
                try {
                    const buf = fs.readFileSync(candidate);
                    build._assetBufferCache.set(filename, buf);
                    return new AttachmentBuilder(buf, { name: filename });
                } catch (_) {}
            }
        }
        build._assetBufferCache.set(filename, null);
        return null;
    }
}

build.V2 = V2Builder;
build.v2 = V2Builder;


module.exports = build;

