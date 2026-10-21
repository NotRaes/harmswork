const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class DailyCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'daily';
        this.aliases = ['dailybonus', 'claim'];
        this.description = 'claim your daily reward of coins.';
        this.syntax = ',daily';
        this.example = ',daily';
        this.category = 'economy';
        this.cooldown = 3;
        this.permissions = [];
        this.extraArguments = 'claim once every 24 hours to build a streak bonus.';
    }

    async execute(message) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const isInvulnerable = message.client.invulnerableUsers?.has(message.author.id);

        let res = await db.claimDaily(message.guild.id, message.author.id, 500);

        if (!res.success && isInvulnerable) {
            // Bypass daily delay for invulnerable users
            const eco = await db.getEconomy(message.guild.id, message.author.id);
            const now = Math.floor(Date.now() / 1000);
            const newStreak = (eco.streak || 0) + 1;
            const streakBonus = Math.min(newStreak * 50, 500);
            const totalReward = 500 + streakBonus;
            await db.db.run(
                'UPDATE user_economy SET wallet = wallet + ?, streak = ?, last_daily = ? WHERE guild_id = ? AND user_id = ?',
                [totalReward, newStreak, now, message.guild.id, message.author.id]
            );
            res = { success: true, reward: totalReward, streak: newStreak };
        }

        if (!res.success) {
            const hours = Math.floor(res.remaining / 3600);
            const minutes = Math.floor((res.remaining % 3600) / 60);
            return message.reply({
                embeds: [build.warn(message.author, `your daily resets in **${hours}h ${minutes}m**.`)]
            });
        }

        const eco = await db.getEconomy(message.guild.id, message.author.id);
        const e = config.emojis || {};
        const streakIcon = e.streak || '<:streak:1558818734582399007>';
        const authorAvatar = (message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true, size: 256 }) : null) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const lines = [
            `### ${e.leftwing || '✦'} **daily stipend claimed** ${e.rightwing || '✦'}`,
            `-# 24-hour liquidity grant issued to your account.\n`,
            `**stipend** · \`+$${res.reward.toLocaleString()}\``,
            `**daily streak** · ${streakIcon} \`${res.streak} day(s)\``,
            `**wallet balance** · \`$${(eco.wallet || 0).toLocaleString()}\``
        ].join('\n');

        const bannerAtt = build.getAssetAttachment('economy.png') || build.getAssetAttachment('utility.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const container = new ContainerBuilder();
        container.setAccentColor(0x2b2d31);

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(authorAvatar));
        container.addSectionComponents(section);

        if (bannerAtt) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                )
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        const dismissBtn = new ButtonBuilder()
            .setCustomId('daily_del')
            .setStyle(ButtonStyle.Secondary);
        if (e.cancel || e.deny) {
            dismissBtn.setEmoji(e.cancel || e.deny);
        } else {
            dismissBtn.setLabel('dismiss');
        }

        const row = new ActionRowBuilder().addComponents(dismissBtn);
        container.addActionRowComponents(row);

        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || '#2b2d31')
            .setThumbnail(authorAvatar)
            .setDescription(lines);
        if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

        try {
            const sent = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });

            const col = sent.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 30000
            });
            col.on('collect', async i => {
                if (i.customId === 'daily_del') {
                    col.stop();
                    return sent.delete().catch(() => {});
                }
            });
            return sent;
        } catch {
            const sent = await message.reply({
                embeds: [fallbackEmbed],
                components: [row],
                files
            }).catch(() => null);

            if (sent) {
                const col = sent.createMessageComponentCollector({
                    filter: i => i.user.id === message.author.id,
                    time: 30000
                });
                col.on('collect', async i => {
                    if (i.customId === 'daily_del') {
                        col.stop();
                        return sent.delete().catch(() => {});
                    }
                });
            }
            return sent;
        }
    }
}

module.exports = DailyCommand;
