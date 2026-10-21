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
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

async function searchImages(query, isNsfw = false) {
    try {
        const cleanQuery = query.trim();
        // 1. Obtain search token (vqd) from DuckDuckGo
        const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });
        const tokenHtml = await tokenRes.text();
        const vqd = tokenHtml.match(/vqd=([\d-]+)/)?.[1];
        if (!vqd) return [];

        // SafeSearch parameter: 1 = strict/moderate (safe for regular channels), -1 = off
        const safeSearchParam = isNsfw ? '-1' : '1';

        // 2. Fetch multi-provider image results
        const imgUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(cleanQuery)}&o=json&p=${safeSearchParam}&s=0&u=bing&f=,,,&l=us-en&vqd=${vqd}`;
        const imgRes = await fetch(imgUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': 'https://duckduckgo.com/'
            }
        });
        const data = await imgRes.json();
        if (!data || !Array.isArray(data.results)) return [];

        return data.results
            .filter(r => r.image && typeof r.image === 'string' && r.image.startsWith('http'))
            .map(r => ({
                title: r.title ? r.title.replace(/<\/?b>/gi, '').trim() : 'untitled image',
                url: r.image,
                sourceUrl: r.url || r.image,
                width: r.width || 0,
                height: r.height || 0,
                source: r.source || 'web'
            }));
    } catch (_) {
        return [];
    }
}

class ImageCommand {
    constructor() {
        this.name = 'image';
        this.aliases = ['img', 'pic', 'imagesearch', 'photo'];
        this.description = 'search through web providers for high-resolution images based on a query.';
        this.syntax = ',image <query>';
        this.example = ',image minimalist neon wallpaper';
        this.category = 'utility';
        this.cooldown = 3;
    }

    async execute(message, args) {
        if (!args || args.length === 0) {
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,image <query>` (e.g. `,image neon city wallpaper`)')]
            });
        }

        const query = args.join(' ').trim();
        const searchingMsg = await message.reply({
            embeds: [build.say(message.author, `searching images for \`${query.slice(0, 60).toLowerCase()}\`...`)]
        }).catch(() => null);

        const isNsfw = Boolean(message.channel?.nsfw);
        const results = await searchImages(query, isNsfw);

        if (!results || results.length === 0) {
            const failEmbed = [build.warn(message.author, `no images found for \`${query.slice(0, 60).toLowerCase()}\`.`)];
            if (searchingMsg) return searchingMsg.edit({ embeds: failEmbed }).catch(() => {});
            return message.reply({ embeds: failEmbed });
        }

        const maxResults = Math.min(results.length, 15);
        let currentIndex = 0;
        const e = config.emojis || {};

        const buildPayload = (index) => {
            const item = results[index];
            const cleanTitle = (item.title || 'untitled').slice(0, 75).toLowerCase();
            const domain = item.source ? item.source.toLowerCase() : 'web';
            const dimText = (item.width && item.height) ? `\`${item.width}×${item.height}\`` : '`hd`';

            const desc = `### [image search • ${query.toLowerCase()}](${item.sourceUrl})\n` +
                `-# **title** ${cleanTitle}\n` +
                `-# **source** \`${domain}\` · **dimensions** ${dimText} · **result** \`${index + 1}/${maxResults}\``;

            const buttons = [];
            if (maxResults > 1) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('img_prev')
                        .setEmoji(e.harm_left || '<:harm_left:1560309043657052240>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(index <= 0),
                    new ButtonBuilder()
                        .setCustomId('img_count')
                        .setLabel(`${index + 1} / ${maxResults}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('img_next')
                        .setEmoji(e.harm_right || '<:harm_right:1560309045720649819>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(index >= maxResults - 1)
                );
            }

            buttons.push(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('open image')
                    .setURL(item.url)
            );

            const row = new ActionRowBuilder().addComponents(buttons);

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                container.addSectionComponents(section);

                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(item.url)
                    )
                );

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                container.addActionRowComponents(row);

                return {
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                };
            } catch (_) {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(desc)
                    .setImage(item.url);

                return {
                    embeds: [fallbackEmbed],
                    components: [row]
                };
            }
        };

        const initialPayload = buildPayload(currentIndex);
        let replyMsg = null;
        if (searchingMsg) {
            replyMsg = await searchingMsg.edit(initialPayload).catch(() => null);
        } else {
            replyMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!replyMsg || maxResults <= 1) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 60_000 // 60s active browser
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    embeds: [build.deny(i.user, 'only the command invoker can browse these images.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'img_prev' && currentIndex > 0) {
                currentIndex--;
            } else if (i.customId === 'img_next' && currentIndex < maxResults - 1) {
                currentIndex++;
            }

            const updatedPayload = buildPayload(currentIndex);
            await i.update(updatedPayload).catch(() => {});
        });

        collector.on('end', async () => {
            try {
                const item = results[currentIndex];
                const cleanTitle = (item.title || 'untitled').slice(0, 75).toLowerCase();
                const domain = item.source ? item.source.toLowerCase() : 'web';
                const dimText = (item.width && item.height) ? `\`${item.width}×${item.height}\`` : '`hd`';

                const desc = `### [image search • ${query.toLowerCase()}](${item.sourceUrl})\n` +
                    `-# **title** ${cleanTitle}\n` +
                    `-# **source** \`${domain}\` · **dimensions** ${dimText} · **result** \`${currentIndex + 1}/${maxResults}\``;

                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(desc)
                    .setImage(item.url);

                const finalRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('open image')
                        .setURL(item.url)
                );

                await replyMsg.edit({
                    embeds: [fallbackEmbed],
                    components: [finalRow],
                    skipV2: true
                }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = ImageCommand;
