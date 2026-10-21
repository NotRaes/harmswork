const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const BadgeHelper = require('../../structures/utils/helpers/badgehelper.js');

class BadgesCommand {
    constructor() {
        this.name = 'badges';
        this.aliases = ['achievements', 'badge', 'showcase'];
        this.description = 'browse and showcase your harm badges and milestone achievements.';
        this.syntax = ',badges [@user]';
        this.example = ',badges @user';
        this.category = 'info';
        this.cooldown = 3;
    }

    async resolveTargetUser(message, arg) {
        if (!arg) return message.author;
        if (message.mentions?.users?.size > 0) {
            return message.mentions.users.first();
        }
        const clean = arg.replace(/[<@!>]/g, '').trim();
        if (/^\d{17,20}$/.test(clean)) {
            try {
                return await message.client.users.fetch(clean);
            } catch (_) {}
        }
        if (message.client.db?.getUserProfileByUid && /^\d{1,10}$/.test(clean)) {
            const p = await message.client.db.getUserProfileByUid(clean);
            if (p?.user_id) {
                try {
                    return await message.client.users.fetch(p.user_id);
                } catch (_) {}
            }
        }
        return null;
    }

    async execute(message, args) {
        const db = message.client.db;
        const sub = (args?.[0] || '').toLowerCase();

        // 1. Direct Equip Shortcut: ,badges equip <badge_name> or ,badges clear
        if (sub === 'equip' || sub === 'set' || sub === 'clear' || sub === 'remove') {
            const badgeArg = (sub === 'clear' || sub === 'remove') ? 'none' : (args[1] || '').toLowerCase().trim();
            if (!badgeArg) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,badges equip <badge_name|clear>`')] });
            }

            if (badgeArg === 'none' || badgeArg === 'clear' || badgeArg === 'remove') {
                if (db) await db.setFeaturedBadge(message.author.id, null);
                return message.reply({ embeds: [build.approved(message.author, 'cleared your featured profile badge.')] });
            }

            const cleanId = badgeArg.replace(/\s+/g, '_');
            const targetBadge = BadgeHelper.getBadge(cleanId);
            if (!targetBadge) {
                return message.reply({ embeds: [build.warn(message.author, `unknown badge \`${badgeArg}\`. run \`,badges\` to view your unlocked badges.`)] });
            }

            const badgeData = await BadgeHelper.syncAndGetBadges(message.client, message.author, message.guild?.id || 'global');
            const hasBadge = badgeData.unlocked.some(b => b.id === targetBadge.id);
            if (!hasBadge) {
                return message.reply({ embeds: [build.deny(message.author, `you have not unlocked the **${targetBadge.name}** badge yet.`)] });
            }

            if (db) await db.setFeaturedBadge(message.author.id, targetBadge.id);
            return message.reply({ embeds: [build.approved(message.author, `equipped ${targetBadge.emoji} **${targetBadge.name}** as your featured profile badge.`)] });
        }

        // 2. Resolve Target User
        let targetUser = message.author;
        if (args && args.length > 0) {
            const resolved = await this.resolveTargetUser(message, args[0]);
            if (resolved) {
                targetUser = resolved;
            }
        }

        if (targetUser.bot) {
            return message.reply({ embeds: [build.warn(message.author, 'bots do not have harm badge profiles.')] });
        }

        const isSelf = targetUser.id === message.author.id;
        const guildId = message.guild?.id || 'global';
        const isOwner = config.owners?.includes(targetUser.id);

        let badgeData = await BadgeHelper.syncAndGetBadges(message.client, targetUser, guildId);

        const bannerAtt = isOwner
            ? (build.getAssetAttachment('owner.png') || build.getAssetAttachment('banner.png'))
            : build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const buildUI = (disabled = false) => {
            const userLink = `https://discord.com/users/${targetUser.id}`;
            const displayName = (targetUser.globalName || targetUser.displayName || targetUser.username || 'user').toLowerCase();
            const avatarUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });

            const unlockedCount = badgeData.unlocked.length;
            const totalCount = badgeData.catalog.length;
            const featuredBadge = badgeData.featured;
            const featuredLine = featuredBadge ? `${featuredBadge.emoji} \`${featuredBadge.name}\`` : '`none equipped`';

            const lines = [
                `### [${displayName} • achievements](${userLink})`,
                `-# unlocked \`${unlockedCount} of ${totalCount}\` badges · featured: ${featuredLine}\n`
            ];

            if (badgeData.unlocked.length > 0) {
                lines.push(`-# **unlocked showcase**`);
                for (const b of badgeData.unlocked.slice(0, 8)) {
                    lines.push(`-# ${b.emoji} **${b.name}** — ${b.description}`);
                }
                if (badgeData.unlocked.length > 8) {
                    lines.push(`-# + \`${badgeData.unlocked.length - 8}\` more unlocked badges`);
                }
            } else {
                lines.push(`-# **unlocked showcase** · \`no badges unlocked yet\``);
            }

            const lockedBadges = badgeData.catalog.filter(b => !b.unlocked);
            if (lockedBadges.length > 0) {
                lines.push(`\n-# **milestones in progress**`);
                for (const b of lockedBadges.slice(0, 4)) {
                    lines.push(`-# \`[locked]\` **${b.name}** — ${b.requirement}`);
                }
            }

            const bodyContent = lines.join('\n');

            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c ? parseInt(config.colors.c.replace('#', ''), 16) : 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
            container.addSectionComponents(section);

            if (bannerAtt) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`))
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            const componentsRows = [];

            if (isSelf && badgeData.unlocked.length > 0 && !disabled) {
                const options = [
                    {
                        label: 'clear featured badge',
                        value: 'none',
                        description: 'do not showcase any featured badge next to your name'
                    },
                    ...badgeData.unlocked.slice(0, 24).map(b => ({
                        label: b.name.slice(0, 100),
                        value: b.id,
                        description: b.description.slice(0, 100)
                    }))
                ];

                const selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('badges_select_featured')
                        .setPlaceholder('choose featured badge to equip...')
                        .addOptions(options)
                );
                container.addActionRowComponents(selectRow);
                componentsRows.push(selectRow);
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(avatarUrl)
                .setDescription(bodyContent);

            if (bannerAtt) {
                embed.setImage(`attachment://${bannerAtt.name}`);
            }

            return { container, embed, componentsRows };
        };

        const { container, embed, componentsRows } = buildUI();

        let replyMsg = null;
        try {
            replyMsg = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { repliedUser: false }
            });
        } catch (_) {
            replyMsg = await message.reply({
                embeds: [embed],
                components: componentsRows,
                files,
                allowedMentions: { repliedUser: false }
            }).catch(() => null);
        }

        if (!replyMsg || componentsRows.length === 0) return;

        const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'only the command author can control this menu.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            collector.resetTimer?.();

            if (i.isStringSelectMenu() && i.customId === 'badges_select_featured') {
                const selected = i.values[0];
                if (selected === 'none') {
                    if (db) await db.setFeaturedBadge(message.author.id, null);
                } else {
                    const valid = badgeData.unlocked.find(b => b.id === selected);
                    if (valid && db) {
                        await db.setFeaturedBadge(message.author.id, valid.id);
                    }
                }
                badgeData = await BadgeHelper.syncAndGetBadges(message.client, targetUser, guildId);
                const { container: updatedContainer, embed: updatedEmb, componentsRows: updatedRows } = buildUI();
                try {
                    await i.update({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
                } catch (_) {
                    await i.update({ embeds: [updatedEmb], components: updatedRows }).catch(() => {});
                }
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'deleted') return;
            try {
                const { container: finalContainer, embed: finalEmb, componentsRows: finalRows } = buildUI(true);
                try {
                    await replyMsg.edit({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 });
                } catch (_) {
                    await replyMsg.edit({ embeds: [finalEmb], components: finalRows, skipV2: true }).catch(() => {});
                }
            } catch (_) {}
        });
    }
}

module.exports = BadgesCommand;
