const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class LevelRewardsCommand {
    constructor() {
        this.name = 'levelrewards';
        this.aliases = ['rewards', 'levelroles', 'lvlroles'];
        this.description = 'view all configured server milestone role rewards.';
        this.category = 'leveling';
        this.cooldown = 3;
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply({ embeds: [build.deny(message.author, 'this command can only be used in a server.')] });
        }

        const db = message.client.db;
        const rewards = await db.getLevelRewards(message.guild.id);
        const settings = await db.getLevelingSettings(message.guild.id);

        if (!rewards || rewards.length === 0) {
            const prefix = (db.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
            return message.reply({
                embeds: [build.warn(message.author, `no level role rewards have been configured yet. admins can add rewards with \`${prefix}leveling reward add <level> <@role>\`.`)]
            });
        }

        const bannerAtt = build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];
        const guildIcon = message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const stackingText = settings.stack_roles === 1 ? 'enabled (retain all roles)' : 'disabled (highest role only)';
        const rewardsList = rewards.map(r => {
            const role = message.guild.roles.cache.get(r.role_id);
            const roleName = role ? role.name : 'deleted-role';
            return `**level ${r.level}** ─ <@&${r.role_id}> (\`${roleName}\`)`;
        }).join('\n');

        const content =
            `### [${message.guild.name} — **role rewards**](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
            `-# unlock milestone roles automatically as you gain levels and xp.\n` +
            `-# stacking mode: **${stackingText}**\n\n` +
            rewardsList;

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(content)
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

            return await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(content)
                .setThumbnail(guildIcon);
            if (bannerAtt) fallbackEmbed.setImage('attachment://banner.png');

            return await message.reply({
                embeds: [fallbackEmbed],
                files
            }).catch(() => {});
        }
    }
}

module.exports = LevelRewardsCommand;
