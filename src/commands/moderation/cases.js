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

class CasesCommand {
    constructor() {
        this.name = 'cases';
        this.aliases = ['history', 'modlogs'];
        this.description = 'view full moderation history for a member or recent server incidents.';
        this.syntax = ',cases [@user]';
        this.example = ',cases @user';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 3;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        let cases = [];
        let titleContext = '';
        let targetAvatar = null;

        if (args.length > 0) {
            const resolved = await resolveUserOrMember(message, args[0]);
            if (!resolved || !resolved.user) {
                return message.reply({ embeds: [build.warn(message.author, 'unable to find that user.')] });
            }
            const targetUser = resolved.user;
            cases = await client.db.getUserCases(message.guild.id, targetUser.id);
            titleContext = `history for **${targetUser.tag || targetUser.username}** (\`${targetUser.id}\`)`;
            targetAvatar = targetUser.displayAvatarURL({ size: 256 });
        } else {
            cases = await client.db.getGuildCases(message.guild.id, 50);
            titleContext = `recent server moderation records for **${message.guild.name}**`;
            targetAvatar = message.guild.iconURL({ size: 256 });
        }

        if (!cases.length) {
            return message.reply({
                embeds: [build.approved(message.author, 'no moderation records found.')]
            });
        }

        const pageSize = 5;
        const totalPages = Math.ceil(cases.length / pageSize);
        let currentPage = 0;

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

        const buildPage = (pageIdx) => {
            const start = pageIdx * pageSize;
            const slice = cases.slice(start, start + pageSize);

            const lines = slice.map((c) => {
                const relTime = `<t:${Math.floor(c.created_at / 1000)}:R>`;
                const targetText = `<@${c.user_id}> (\`${c.user_tag || c.user_id}\`)`;
                const modText = `<@${c.moderator_id}>`;
                return `**#${c.case_id}** · \`${c.action}\` · ${relTime}\n` +
                       `-# **target:** ${targetText} · **mod:** ${modText}\n` +
                       `-# **reason:** ${c.reason || 'no reason provided'}`;
            });

            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [moderation history](${supportUrl})\n` +
                        `-# ${titleContext}.\n\n` +
                        lines.join('\n\n') + '\n\n' +
                        `-# **page ${pageIdx + 1} of ${totalPages}** · total cases: \`${cases.length}\``
                    )
                );

            if (targetAvatar) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(targetAvatar));
            }
            container.addSectionComponents(section);

            const components = [container];

            if (totalPages > 1) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('cases_prev')
                        .setLabel('previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(pageIdx === 0),
                    new ButtonBuilder()
                        .setCustomId('cases_next')
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
            const slice = cases.slice(start, start + pageSize);
            const lines = slice.map((c) => {
                const relTime = `<t:${Math.floor(c.created_at / 1000)}:R>`;
                return `**#${c.case_id}** · \`${c.action}\` · ${relTime}\n` +
                       `**target:** <@${c.user_id}> · **mod:** <@${c.moderator_id}>\n` +
                       `**reason:** ${c.reason || 'no reason provided'}`;
            });

            const embed = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(
                    `### [moderation history](${supportUrl})\n` +
                    `${titleContext}.\n\n` +
                    lines.join('\n\n') + '\n\n' +
                    `*page ${pageIdx + 1} of ${totalPages} · total cases: ${cases.length}*`
                );
            if (targetAvatar) embed.setThumbnail(targetAvatar);

            const rows = [];
            if (totalPages > 1) {
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('cases_prev').setLabel('previous').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === 0),
                    new ButtonBuilder().setCustomId('cases_next').setLabel('next').setStyle(ButtonStyle.Secondary).setDisabled(pageIdx === totalPages - 1)
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

            if (i.customId === 'cases_prev' && currentPage > 0) {
                currentPage--;
            } else if (i.customId === 'cases_next' && currentPage < totalPages - 1) {
                currentPage++;
            }

            await i.update(buildFallbackEmbed(currentPage)).catch(() => {});
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('cases_prev').setLabel('previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('cases_next').setLabel('next').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                const pagePayload = buildFallbackEmbed(currentPage);
                await replyMsg.edit({ ...pagePayload, components: [disabledRow] }).catch(() => {});
            } catch (_) {}
        });
    }
}

module.exports = CasesCommand;
