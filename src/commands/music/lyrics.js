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
const https = require('https');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function cleanTrackTitle(title) {
    if (!title) return '';
    return title
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\b(official audio|official video|music video|lyrics|lyric video|audio|hd|4k|remastered)\b/gi, '')
        .replace(/[-|–]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fetchJson(url) {
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'HarmDiscordBot/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function getLyrics(trackName, artistName) {
    const cleanTitle = cleanTrackTitle(trackName);
    const cleanArtist = artistName ? artistName.replace(/ - topic/gi, '').trim() : '';

    // 1. Try exact match from lrclib
    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
    if (cleanArtist) url += `&artist_name=${encodeURIComponent(cleanArtist)}`;

    let res = await fetchJson(url);
    if (res && (res.plainLyrics || res.syncedLyrics)) {
        return res;
    }

    // 2. Fallback to search query
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim())}`;
    const searchRes = await fetchJson(searchUrl);
    if (Array.isArray(searchRes) && searchRes.length > 0) {
        return searchRes[0];
    }

    return null;
}

class LyricsCommand {
    constructor() {
        this.name = 'lyrics';
        this.aliases = ['lyric', 'ly'];
        this.description = 'display full static lyrics for the current song or search.';
        this.category = 'music';
        this.cooldown = 3;
    }

    async execute(message, args) {
        const queue = message.client.music?.getQueue(message.guild?.id);
        let trackName = '';
        let artistName = '';
        let thumbnail = null;

        if (args.length > 0) {
            trackName = args.join(' ');
        } else if (queue && queue.current) {
            trackName = queue.current.title;
            artistName = queue.current.author;
            thumbnail = queue.current.thumbnail;
        } else {
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,lyrics <song name>` or play a song first.')]
            });
        }

        const searchingMsg = await message.reply({
            embeds: [build.say(message.author, `searching lyrics for \`${trackName.slice(0, 60).toLowerCase()}\`...`)]
        }).catch(() => null);

        const lyricsData = await getLyrics(trackName, artistName);
        if (!lyricsData || (!lyricsData.plainLyrics && !lyricsData.syncedLyrics)) {
            const failEmbed = [build.warn(message.author, `no lyrics found for \`${trackName.slice(0, 60).toLowerCase()}\`.`)];
            if (searchingMsg) return searchingMsg.edit({ embeds: failEmbed }).catch(() => {});
            return message.reply({ embeds: failEmbed });
        }

        const songTitle = (lyricsData.trackName || trackName).toLowerCase();
        const songArtist = (lyricsData.artistName || artistName || 'unknown artist').toLowerCase();

        // Extract full plain text lines
        const rawText = lyricsData.plainLyrics || lyricsData.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '');
        const rawLines = rawText.split('\n');

        const linesPerPage = 22;
        const totalPages = Math.max(1, Math.ceil(rawLines.length / linesPerPage));
        let currentPage = 1;

        const bannerAttachment = build.getAssetAttachment('music.png');
        const files = bannerAttachment ? [bannerAttachment] : [];
        const e = config.emojis || {};

        const buildContent = () => {
            const startIndex = (currentPage - 1) * linesPerPage;
            const pageLines = rawLines.slice(startIndex, startIndex + linesPerPage);

            let desc = `### [${songTitle}](https://discord.gg/hCQhTmPf2G)\n` +
                `-# **artist** \`${songArtist}\` · **page** \`${currentPage}/${totalPages}\` · **lyrics**\n\n`;

            for (const line of pageLines) {
                const cleanLine = line.trim();
                if (!cleanLine) {
                    desc += '\n';
                } else {
                    desc += `-# ${cleanLine.toLowerCase()}\n`;
                }
            }

            return desc;
        };

        const buildButtons = () => {
            const buttons = [];
            if (totalPages > 1) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('ly_prev')
                        .setEmoji(e.harm_left || '<:harm_left:1560309043657052240>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage <= 1),
                    new ButtonBuilder()
                        .setCustomId('ly_page')
                        .setLabel(`${currentPage} / ${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('ly_next')
                        .setEmoji(e.harm_right || '<:harm_right:1560309045720649819>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage >= totalPages)
                );
            }
            return buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];
        };

        const renderPayload = () => {
            const desc = buildContent();
            const actionRows = buildButtons();

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );

                const thumb = thumbnail || message.guild?.iconURL({ dynamic: true, size: 256 }) || message.client.user?.displayAvatarURL({ dynamic: true, size: 256 });
                if (thumb) {
                    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb));
                }
                container.addSectionComponents(section);

                if (bannerAttachment) {
                    container.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL('attachment://music.png')
                        )
                    );
                }

                if (actionRows.length > 0) {
                    container.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    );
                    for (const row of actionRows) container.addActionRowComponents(row);
                }

                return {
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                };
            } catch (_) {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(desc);
                if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
                if (thumbnail) fallbackEmbed.setThumbnail(thumbnail);

                return {
                    embeds: [fallbackEmbed],
                    components: actionRows,
                    files
                };
            }
        };

        const initialPayload = renderPayload();
        let replyMsg = null;
        if (searchingMsg) {
            replyMsg = await searchingMsg.edit(initialPayload).catch(() => null);
        } else {
            replyMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!replyMsg || totalPages <= 1) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 90_000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    embeds: [build.deny(i.user, 'only the command invoker can flip pages.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'ly_prev') {
                currentPage = Math.max(1, currentPage - 1);
            } else if (i.customId === 'ly_next') {
                currentPage = Math.min(totalPages, currentPage + 1);
            }

            const updatedPayload = renderPayload();
            await i.update(updatedPayload).catch(() => {});
        });

        collector.on('end', async () => {
            try {
                const disabledRows = buildButtons().map(r => {
                    r.components.forEach(c => c.setDisabled(true));
                    return r;
                });
                const desc = buildContent();
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(desc);
                if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
                if (thumbnail) fallbackEmbed.setThumbnail(thumbnail);

                await replyMsg.edit({
                    embeds: [fallbackEmbed],
                    components: disabledRows,
                    skipV2: true
                }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = LyricsCommand;
