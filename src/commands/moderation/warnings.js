const {
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const { resolveUserOrMember } = require('../../structures/utils/helpers/modhelper.js');

class WarningsCommand {
    constructor() {
        this.name = 'warnings';
        this.aliases = ['warns'];
        this.description = 'view active warning infractions for a member.';
        this.syntax = ',warnings [@user]';
        this.example = ',warnings @user';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 3;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        let targetUser = message.author;
        let targetMember = message.member;

        if (args.length > 0) {
            const resolved = await resolveUserOrMember(message, args[0]);
            if (!resolved || !resolved.user) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
            }
            targetUser = resolved.user;
            targetMember = resolved.member;
        }

        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const warns = await client.db.getUserWarns(message.guild.id, targetUser.id);
        const targetDisplay = targetUser.tag || targetUser.username;

        if (!warns.length) {
            return message.reply({
                embeds: [build.approved(message.author, `**${targetDisplay}** has no active warnings.`)]
            });
        }

        const pageSize = 5;
        const totalPages = Math.ceil(warns.length / pageSize);
        let currentPage = 0;

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const avatarUrl = targetUser.displayAvatarURL({ size: 256 });

        const buildPage = (pageIdx) => {
            const start = pageIdx * pageSize;
            const slice = warns.slice(start, start + pageSize);

            const lines = slice.map((w, i) => {
                const relativeTime = `<t:${Math.floor(w.created_at / 1000)}:R>`;
                return `**#${w.case_id}** · ${relativeTime}\n` +
                       `-# **moderator:** <@${w.moderator_id}> (\`${w.moderator_tag || w.moderator_id}\`)\n` +
                       `-# **reason:** ${w.reason || 'no reason provided'}`;
            });

            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [active warnings](${supportUrl})\n` +
                        `-# viewing infraction records for **${targetDisplay}** (\`${targetUser.id}\`).\n\n` +
                        lines.join('\n\n') + '\n\n' +
                        `-# **page ${pageIdx + 1} of ${totalPages}** · total warnings: \`${warns.length}\``
                    )
                );

            if (avatarUrl) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
            }
            container.addSectionComponents(section);

            const components = [container];

            if (totalPages > 1) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('warns_prev')
                        .setLabel('previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === 0),
                    new ButtonBuilder()
                        .setCustomId('warns_next')
                        .setLabel('next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === totalPages - 1)
                );
                container.addActionRowComponents(row);
            }

            return {
                components: [container],
                flags: MessageFlags.IsComponentsV2
            };
        };

        const buildFallbackEmbed = (pageIdx) => {
            const start = pageIdx * pageSize;
            const slice = warns.slice(start, start + pageSize);
            const lines = slice.map((w) => {
                const relativeTime = `<t:${Math.floor(w.created_at / 1000)}:R>`;
                return `**#${w.case_id}** · ${relativeTime}\n` +
                       `**moderator:** <@${w.moderator_id}>\n` +
                       `**reason:** ${w.reason || 'no reason provided'}`;
            });

            const embed = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(
                    `### [active warnings](${supportUrl})\n` +
                    `viewing infraction records for **${targetDisplay}** (\`${targetUser.id}\`).\n\n` +
                    lines.join('\n\n') + '\n\n' +
                    `*page ${pageIdx + 1} of ${totalPages} · total warnings: ${warns.length}*`
                );
            if (avatarUrl) embed.setThumbnail(avatarUrl);

            const rows = [];
            if (totalPages > 1) {
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('warns_prev')
                        .setLabel('previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === 0),
                    new ButtonBuilder()
                        .setCustomId('warns_next')
                        .setLabel('next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === totalPages - 1)
                ));
            }
            return { embeds: [embed], components: rows };
        };

        const replyMsg = await message.reply(buildFallbackEmbed(currentPage)).catch(() => null);

        if (!replyMsg || totalPages <= 1) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command author can control this menu.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'warns_prev' && currentPage > 0) {
                currentPage--;
            } else if (i.customId === 'warns_next' && currentPage < totalPages - 1) {
                currentPage++;
            }

            await i.update(buildFallbackEmbed(currentPage)).catch(() => {});
        });

        collector.on('end', async () => {
            // Disable buttons on timeout
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('warns_prev').setLabel('previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('warns_next').setLabel('next').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                const pagePayload = buildFallbackEmbed(currentPage);
                await replyMsg.edit({ ...pagePayload, components: [disabledRow] }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = WarningsCommand;
