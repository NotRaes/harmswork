const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const LevelingHelper = require('../../structures/utils/helpers/levelinghelper.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class LevelsCommand {
    constructor() {
        this.name = 'levels';
        this.aliases = ['topxp', 'xptop', 'levelstop', 'xplb', 'rankstop'];
        this.description = 'view the server leveling and xp leaderboard.';
        this.category = 'leveling';
        this.cooldown = 4;
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply({ embeds: [build.deny(message.author, 'this command can only be used in a server.')] });
        }

        const db = message.client.db;
        const totalCount = await db.getLevelLeaderboardCount(message.guild.id);
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

        let currentPage = 1;
        if (args[0] && !isNaN(args[0])) {
            const requested = parseInt(args[0], 10);
            if (requested >= 1 && requested <= totalPages) {
                currentPage = requested;
            }
        }

        const bannerAtt = build.getAssetAttachment('banner.png');
        const guildIcon = message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const buildPageData = async (page) => {
            const offset = (page - 1) * pageSize;
            const rows = await db.getLevelLeaderboard(message.guild.id, pageSize, offset);

            let listContent = '';
            if (rows.length === 0) {
                listContent = '-# *no members have earned xp in this server yet.*';
            } else {
                listContent = rows.map((row, idx) => {
                    const rankNum = offset + idx + 1;
                    const voiceFormatted = LevelingHelper.formatVoiceTime(row.voice_seconds || 0);
                    return `\`${rankNum}.\` <@${row.user_id}> ─ **level ${row.level}** · \`${Number(row.xp).toLocaleString()} xp\` · ${row.messages} msgs · ${voiceFormatted} vc`;
                }).join('\n');
            }

            const headerContent =
                `### [${message.guild.name} — **levels**](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                `-# top active members ranked by cumulative server progression.\n\n` +
                listContent + `\n\n` +
                `-# **page ${page} of ${totalPages}** · ${totalCount.toLocaleString()} total ranked members`;

            // Action row buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('levels_prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(config.emojis?.harm_left || '<:harm_left:1560309043657052240>')
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId('levels_next')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(config.emojis?.harm_right || '<:harm_right:1560309045720649819>')
                    .setDisabled(page >= totalPages)
            );

            // Components V2 Container (bottom-anchored banner layout)
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(headerContent)
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(guildIcon)
                );
            container.addSectionComponents(section);

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

            container.addActionRowComponents(row);

            return { container, row, headerContent };
        };

        const { row, headerContent } = await buildPageData(currentPage);
        const files = bannerAtt ? [bannerAtt] : [];

        const initialEmbed = new EmbedBuilder()
            .setColor(0x0A0A0C)
            .setDescription(headerContent)
            .setThumbnail(guildIcon);
        if (bannerAtt) initialEmbed.setImage('attachment://banner.png');

        const replyMsg = await message.reply({
            embeds: [initialEmbed],
            components: [row],
            files
        }).catch(() => null);

        if (!replyMsg || totalPages <= 1) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 60_000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command author can control this menu.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'levels_prev') {
                if (currentPage > 1) currentPage--;
            } else if (i.customId === 'levels_next') {
                if (currentPage < totalPages) currentPage++;
            }

            const pageData = await buildPageData(currentPage);
            const pageEmbed = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(pageData.headerContent)
                .setThumbnail(guildIcon);
            if (bannerAtt) pageEmbed.setImage('attachment://banner.png');

            await i.update({
                embeds: [pageEmbed],
                components: [pageData.row]
            }).catch(() => {});
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('levels_prev_disabled')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(config.emojis?.harm_left || '<:harm_left:1560309043657052240>')
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('levels_next_disabled')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(config.emojis?.harm_right || '<:harm_right:1560309045720649819>')
                        .setDisabled(true)
                );

                const finalPage = await buildPageData(currentPage);
                const finalEmbed = new EmbedBuilder()
                    .setColor(0x0A0A0C)
                    .setDescription(finalPage.headerContent)
                    .setThumbnail(guildIcon);
                if (bannerAtt) finalEmbed.setImage('attachment://banner.png');

                await replyMsg.edit({
                    embeds: [finalEmbed],
                    components: [disabledRow]
                }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = LevelsCommand;
