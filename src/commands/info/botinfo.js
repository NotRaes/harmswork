const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder,
    version: djsVersion
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class BotInfoCommand {
    constructor() {
        this.name = 'botinfo';
        this.aliases = ['bi', 'about', 'info'];
        this.description = 'view harm system statistics and live telemetry.';
        this.syntax = ',botinfo';
        this.example = ',botinfo';
        this.category = 'info';
        this.cooldown = 2;
    }

    async execute(message) {
        const client = message.client;
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const botAvatar = client.user?.displayAvatarURL({ dynamic: true, size: 1024 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const guildsCount = (client.guilds?.cache?.size || 0).toLocaleString();
        let usersTotal = 0;
        if (client.guilds?.cache?.values) {
            for (const g of client.guilds.cache.values()) {
                usersTotal += (g.memberCount || 0);
            }
        }
        const usersCount = usersTotal.toLocaleString();
        const ping = Math.max(1, Math.round(client.ws?.ping || 0));
        const uptimeTimestamp = Math.floor((Date.now() - (client.uptime || 0)) / 1000);
        const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

        const developers = (config.owners || ['837940598287237161'])
            .map(id => `<@${id}>`)
            .join(' · ');

        const content = [
            `### [harm](${supportUrl})`,
            `-# minimalist discord bot built for high-tier aesthetic communities.\n`,
            `-# **servers** \`${guildsCount}\` · **users** \`${usersCount}\` · **latency** \`${ping}ms\``,
            `-# **system** \`node ${process.version}\` · \`d.js v${djsVersion}\` · \`${memoryUsage} mb\``,
            `-# **uptime** <t:${uptimeTimestamp}:R> · **developers** ${developers}`
        ].join('\n');

        const bannerAttachment = build.getAssetAttachment('banner.png') || build.getAssetAttachment('info.png');
        const files = bannerAttachment ? [bannerAttachment] : [];

        // Components V2 Minimalist Hero Card (No Buttons)
        const container = new ContainerBuilder();
        container.setAccentColor(typeof config.colors?.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors?.c || 0x0A0A0C));

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
                files
            }).catch(() => {});
        }
    }
}

module.exports = BotInfoCommand;
