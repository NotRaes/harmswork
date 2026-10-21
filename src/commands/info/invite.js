const {
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class InviteCommand {
    constructor() {
        this.name = 'invite';
        this.aliases = ['inv', 'botinvite', 'addbot'];
        this.description = 'get the invite link to add harm to your server.';
        this.syntax = ',invite';
        this.example = ',invite';
        this.category = 'info';
        this.cooldown = 2;
    }

    async execute(message) {
        const client = message.client;
        const clientId = client.user?.id || config.clientId || '1490995846626545674';
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${config.invitePermissions || '1376435694838'}&scope=bot%20applications.commands`;
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

        const bannerAttachment = build.getAssetAttachment('banner.png') || build.getAssetAttachment('info.png');
        const files = bannerAttachment ? [bannerAttachment] : [];
        const botAvatar = client.user?.displayAvatarURL({ dynamic: true, size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('invite harm')
                .setEmoji(config.emojis?.harm || '<:harmsdio:1556221836507742278>')
                .setURL(inviteUrl),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('join discord')
                .setEmoji('<:discord_logo:1529300434374758481>')
                .setURL(supportUrl)
        );

        const content = [
            `### [invite **harm**](${inviteUrl})`,
            `-# thanks for choosing harm for your server.`,
            `-# click below to authorize harm with granular permissions.`,
            `-# need help or perks? join our [**discord**](${supportUrl}).`
        ].join('\n');

        // Components V2 Hero Container (Standard A)
        const container = new ContainerBuilder();
        container.setAccentColor(typeof config.colors.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : 0x0A0A0C);

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar));
        container.addSectionComponents(section);

        if (bannerAttachment) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachment.name}`)
                )
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        container.addActionRowComponents(row);

        try {
            return await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(botAvatar)
                .setDescription(content);
            if (bannerAttachment) fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);

            return await message.reply({
                embeds: [fallbackEmbed],
                components: [row],
                files
            }).catch(() => {});
        }
    }
}

module.exports = InviteCommand;
