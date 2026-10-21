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

function formatDuration(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '0:00';
    const s = Math.floor(sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

class HistoryCommand {
    constructor() {
        this.name = 'history';
        this.aliases = ['prevsongs', 'recent', 'played'];
        this.description = 'display recently played songs in this server.';
        this.category = 'music';
        this.cooldown = 2;
    }

    async execute(message, args) {
        const db = message.client.db;
        let historyItems = [];

        if (db && typeof db.getMusicHistory === 'function') {
            historyItems = await db.getMusicHistory(message.guild.id, 25);
        }

        // Fallback to active queue memory history if DB is empty
        if ((!historyItems || historyItems.length === 0) && message.client.music) {
            const queue = message.client.music.getQueue(message.guild.id);
            if (queue && queue.history && queue.history.length > 0) {
                historyItems = queue.history.map(t => ({
                    title: t.title,
                    url: t.url,
                    author: t.author,
                    duration: t.duration,
                    requester_id: t.requester?.id,
                    played_at: Date.now()
                })).reverse();
            }
        }

        if (!historyItems || historyItems.length === 0) {
            return message.reply({
                embeds: [build.warn(message.author, 'no playback history found for this server yet.')]
            });
        }

        const pageSize = 8;
        const totalPages = Math.max(1, Math.ceil(historyItems.length / pageSize));
        let currentPage = 1;

        if (args[0] && !isNaN(args[0])) {
            const p = parseInt(args[0], 10);
            if (p >= 1 && p <= totalPages) currentPage = p;
        }

        const bannerAttachment = build.getAssetAttachment('music.png');
        const files = bannerAttachment ? [bannerAttachment] : [];
        const e = config.emojis || {};

        const buildPayload = (page) => {
            const startIdx = (page - 1) * pageSize;
            const endIdx = Math.min(startIdx + pageSize, historyItems.length);
            const pageItems = historyItems.slice(startIdx, endIdx);

            let desc = `### [playback history](https://discord.gg/hCQhTmPf2G)\n` +
                `-# showing recently played tracks in **${message.guild.name.toLowerCase()}**.\n\n`;

            pageItems.forEach((item, i) => {
                const idx = startIdx + i + 1;
                const durFormatted = item.duration ? formatDuration(item.duration) : '0:00';
                const requesterTag = item.requester_id ? `<@${item.requester_id}>` : 'unknown';
                const timeTag = item.played_at ? `<t:${Math.floor(item.played_at / 1000)}:R>` : '';
                desc += `-# \`${idx}.\` [${item.title.toLowerCase()}](${item.url}) ─ \`${durFormatted}\` · ${requesterTag} ${timeTag}\n`;
            });

            desc += `\n-# **page ${page} of ${totalPages}** · use \`,play <url>\` to replay any track.`;

            const rows = totalPages > 1 ? [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('hist_prev')
                        .setEmoji(e.harm_left || '<:harm_left:1560309043657052240>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1),
                    new ButtonBuilder()
                        .setCustomId('hist_page')
                        .setLabel(`${page} / ${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('hist_next')
                        .setEmoji(e.harm_right || '<:harm_right:1560309045720649819>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages)
                )
            ] : [];

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );

                const thumb = message.guild.iconURL({ dynamic: true, size: 256 }) || message.client.user?.displayAvatarURL({ dynamic: true, size: 256 });
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

                if (rows.length > 0) {
                    container.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    );
                    for (const r of rows) container.addActionRowComponents(r);
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
                if (thumb) fallbackEmbed.setThumbnail(thumb);

                return {
                    embeds: [fallbackEmbed],
                    components: rows,
                    files
                };
            }
        };

        const initialPayload = buildPayload(currentPage);
        const replyMsg = await message.reply(initialPayload).catch(() => null);

        if (!replyMsg || totalPages <= 1) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 60_000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    embeds: [build.deny(i.user, 'only the command invoker can control this menu.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'hist_prev') {
                currentPage = Math.max(1, currentPage - 1);
            } else if (i.customId === 'hist_next') {
                currentPage = Math.min(totalPages, currentPage + 1);
            }

            const updatedPayload = buildPayload(currentPage);
            await i.update(updatedPayload).catch(() => {});
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('hist_prev').setEmoji(e.harm_left || '<:harm_left:1560309043657052240>').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('hist_page').setLabel(`${currentPage} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('hist_next').setEmoji(e.harm_right || '<:harm_right:1560309045720649819>').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                const startIdx = (currentPage - 1) * pageSize;
                const pageTracks = tracks.slice(startIdx, startIdx + pageSize);
                let desc = `### [playback history](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# **server** \`${message.guild.name.toLowerCase()}\` · **page** \`${currentPage}/${totalPages}\` · **tracks** \`${tracks.length}\`\n\n`;
                desc += pageTracks.map((t, idx) => `\`${startIdx + idx + 1}.\` [${t.title}](https://discord.gg/hCQhTmPf2G) · \`${t.durationFormatted || 'live'}\``).join('\n');

                const thumb = message.guild.iconURL({ dynamic: true, size: 256 }) || message.client.user?.displayAvatarURL({ dynamic: true, size: 256 });
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(desc);
                if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
                if (thumb) fallbackEmbed.setThumbnail(thumb);

                await replyMsg.edit({
                    embeds: [fallbackEmbed],
                    components: [disabledRow],
                    skipV2: true
                }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = HistoryCommand;
