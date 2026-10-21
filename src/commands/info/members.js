const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ThumbnailBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class MembersCommand {
    constructor() {
        this.name = 'members';
        this.aliases = ['membercount', 'mc', 'users'];
        this.description = 'display total member count and presence breakdown.';
        this.syntax = ',members';
        this.example = ',members';
        this.category = 'info';
        this.cooldown = 2;
    }

    async execute(message) {
        const guild = message.guild;
        if (!guild) {
            return message.reply(build.warnBox('nothing found', 'this command must be used in a server.'));
        }

        const totalMembers = guild.memberCount || 0;
        const cachedMembers = guild.members.cache;
        const memberList = typeof cachedMembers.values === 'function' ? Array.from(cachedMembers.values()) : [];
        const bots = memberList.filter(m => m.user?.bot).length;
        const humans = Math.max(0, totalMembers - bots);

        const online = memberList.filter(m => m.presence && m.presence.status !== 'offline').length;
        const offline = Math.max(0, totalMembers - online);

        const boosts = guild.premiumSubscriptionCount || 0;
        const boostTier = guild.premiumTier || 0;

        const humanPct = totalMembers > 0 ? ((humans / totalMembers) * 100).toFixed(0) : '0';
        const botPct = totalMembers > 0 ? ((bots / totalMembers) * 100).toFixed(0) : '0';

        const e = config.emojis || {};
        const eOnline = e.harm_online || '•';
        const eOffline = e.harm_offline || '•';
        const eBoost = e.boost || '•';
        const eMembers = e.members || '•';

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

        const lines = [
            `**total** \`${totalMembers.toLocaleString()}\` members`,
            `**humans** \`${humans.toLocaleString()}\` (${humanPct}%) · **bots** \`${bots.toLocaleString()}\` (${botPct}%)`,
            `**presence** ${eOnline} \`${online.toLocaleString()}\` online · ${eOffline} \`${offline.toLocaleString()}\` offline`,
            `**boosters** ${eBoost} \`${boosts}\` boosts · tier \`${boostTier}\``
        ];

        const textContent =
            `### [members](${supportUrl})\n` +
            `-# member metrics and population statistics for **${guild.name.toLowerCase()}**.\n\n` +
            lines.join('\n');

        const bannerAttachment = build.getAssetAttachment('info.png') || build.getAssetAttachment('banner.png');
        const files = bannerAttachment ? [bannerAttachment] : [];

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(textContent));

        const guildIcon = guild.iconURL({ dynamic: true, size: 512 });
        if (guildIcon) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
        }

        const container = new ContainerBuilder()
            .addSectionComponents(section);

        if (bannerAttachment) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachment.name}`)
                )
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small)
        );

        try {
            return await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(textContent);

            if (guildIcon) fallbackEmbed.setThumbnail(guildIcon);
            if (bannerAttachment) fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);

            return await message.reply({
                embeds: [fallbackEmbed],
                files
            }).catch(() => {});
        }
    }
}

module.exports = MembersCommand;
