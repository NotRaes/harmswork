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

class QueueCommand {
    constructor() {
        this.name = 'queue';
        this.aliases = ['q', 'list'];
        this.description = 'display the current music queue and upcoming tracks.';
        this.category = 'music';
        this.cooldown = 2;
    }

    async execute(message, args) {
        const queue = message.client.music?.getQueue(message.guild.id);
        if (!queue || (!queue.current && queue.tracks.length === 0)) {
            return message.reply({
                embeds: [build.warn(message.author, 'the queue is currently empty.')]
            });
        }

        const pageSize = 8;
        const totalPages = Math.max(1, Math.ceil(queue.tracks.length / pageSize));
        let currentPage = 1;

        if (args[0] && !isNaN(args[0])) {
            const requestedPage = parseInt(args[0], 10);
            if (requestedPage >= 1 && requestedPage <= totalPages) {
                currentPage = requestedPage;
            }
        }

        const totalQueueDurationSec = queue.tracks.reduce((acc, t) => acc + (t.duration || 0), 0) +
            (queue.current?.duration ? (queue.current.duration - queue.getPlaybackDuration()) : 0);

        const bannerAttachment = build.getAssetAttachment('music.png');
        const files = bannerAttachment ? [bannerAttachment] : [];
        const e = config.emojis || {};

        const buildPayload = (page) => {
            const startIndex = (page - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, queue.tracks.length);
            const pageTracks = queue.tracks.slice(startIndex, endIndex);

            let desc = '';
            if (queue.current) {
                const elapsedFormatted = formatDuration(queue.getPlaybackDuration());
                const durFormatted = queue.current.duration ? formatDuration(queue.current.duration) : 'live';
                desc += `### [music queue](${queue.current.url})\n` +
                    `-# **now playing**: [${queue.current.title.toLowerCase()}](${queue.current.url}) ─ \`${elapsedFormatted} / ${durFormatted}\`\n\n`;
            } else {
                desc += `### [music queue](https://discord.gg/hCQhTmPf2G)\n`;
            }

            if (pageTracks.length > 0) {
                desc += `**upcoming tracks**:\n`;
                pageTracks.forEach((t, i) => {
                    const idx = startIndex + i + 1;
                    const dur = t.duration ? formatDuration(t.duration) : 'live';
                    desc += `-# \`${idx}.\` [${t.title.toLowerCase()}](${t.url}) ─ \`${dur}\` · <@${t.requester.id}>\n`;
                });
            } else {
                desc += `-# no upcoming tracks in queue. use \`,play <query>\` to add more.\n`;
            }

            desc += `\n-# **${queue.tracks.length} track(s)** · **est. remaining**: \`${formatDuration(totalQueueDurationSec)}\` · **loop**: \`${queue.loop}\` · **page ${page}/${totalPages}**`;

            const rows = totalPages > 1 ? [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('q_prev')
                        .setEmoji(e.harm_left || '<:harm_left:1560309043657052240>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1),
                    new ButtonBuilder()
                        .setCustomId('q_page')
                        .setLabel(`${page} / ${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('q_next')
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

                const thumbUrl = queue.current?.thumbnail || message.guild.iconURL({ dynamic: true, size: 256 }) || message.client.user?.displayAvatarURL({ dynamic: true, size: 256 });
                if (thumbUrl) {
                    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
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
                if (queue.current?.thumbnail) fallbackEmbed.setThumbnail(queue.current.thumbnail);

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

            if (i.customId === 'q_prev') {
                currentPage = Math.max(1, currentPage - 1);
            } else if (i.customId === 'q_next') {
                currentPage = Math.min(totalPages, currentPage + 1);
            }

            const updatedPayload = buildPayload(currentPage);
            await i.update(updatedPayload).catch(() => {});
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('q_prev').setEmoji(e.harm_left || '<:harm_left:1560309043657052240>').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('q_page').setLabel(`${currentPage} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('q_next').setEmoji(e.harm_right || '<:harm_right:1560309045720649819>').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                const startIdx = (currentPage - 1) * pageSize;
                const pageTracks = tracks.slice(startIdx, startIdx + pageSize);
                let desc = `### [music queue](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# **loop** \`${queue.loop || 'off'}\` · **tracks** \`${tracks.length}\` · **page** \`${currentPage}/${totalPages}\`\n\n`;
                if (queue.current) {
                    desc += `**now playing:** [${queue.current.title}](https://discord.gg/hCQhTmPf2G)\n\n`;
                }
                desc += pageTracks.map((t, idx) => `\`${startIdx + idx + 1}.\` [${t.title}](https://discord.gg/hCQhTmPf2G) · \`${t.durationFormatted || 'live'}\``).join('\n');

                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors?.c || '#0A0A0C')
                    .setDescription(desc);
                if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
                if (queue.current?.thumbnail) fallbackEmbed.setThumbnail(queue.current.thumbnail);

                await replyMsg.edit({
                    embeds: [fallbackEmbed],
                    components: [disabledRow],
                    skipV2: true
                }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = QueueCommand;
