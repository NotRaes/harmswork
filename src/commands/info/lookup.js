const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class LookupCommand {
    constructor() {
        this.name = 'lookup';
        this.aliases = ['whois', 'find', 'check', 'intel'];
        this.description = 'retrieve comprehensive intelligence and telemetry on any user or server.';
        this.syntax = ',lookup [@user | user_id | server_id]';
        this.example = ',lookup @user\n,lookup 123456789012345678';
        this.category = 'info';
        this.cooldown = 2;
    }

    async execute(message, args) {
        const client = message.client;
        const bannerAtt = build.getAssetAttachment('info.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        // Determine target
        let query = args.join(' ').trim();
        let targetType = 'none';
        let targetUser = null;
        let targetMember = null;
        let targetGuild = null;

        if (!query) {
            // Default to author if in guild, or current guild
            targetMember = message.member;
            targetUser = message.author;
            targetType = 'user';
        } else {
            // 1. Check for user mention
            const mentionMatch = query.match(/^<@!?(\d{17,20})>$/);
            if (mentionMatch) {
                targetUser = await client.users.fetch(mentionMatch[1]).catch(() => null);
                if (targetUser) {
                    targetType = 'user';
                    targetMember = message.guild?.members.cache.get(targetUser.id) || null;
                }
            }

            // 2. Check for Snowflake ID
            if (!targetType || targetType === 'none') {
                const snowflakeMatch = query.match(/^(\d{17,20})$/);
                if (snowflakeMatch) {
                    const id = snowflakeMatch[1];
                    // Try fetch user first
                    targetUser = await client.users.fetch(id).catch(() => null);
                    if (targetUser) {
                        targetType = 'user';
                        targetMember = message.guild?.members.cache.get(targetUser.id) || null;
                    } else {
                        // Try fetch guild
                        targetGuild = client.guilds.cache.get(id) || await client.guilds.fetch(id).catch(() => null);
                        if (targetGuild) {
                            targetType = 'guild';
                        }
                    }
                }
            }

            // 3. Search Member by Name in Guild
            if ((!targetType || targetType === 'none') && message.guild) {
                const lower = query.toLowerCase();
                targetMember = message.guild.members.cache.find(m =>
                    m.user.username.toLowerCase() === lower ||
                    m.displayName.toLowerCase() === lower ||
                    m.user.tag?.toLowerCase() === lower
                );
                if (targetMember) {
                    targetUser = targetMember.user;
                    targetType = 'user';
                }
            }

            // 4. Search Guild by Name in Cache
            if (!targetType || targetType === 'none') {
                const lower = query.toLowerCase();
                targetGuild = client.guilds.cache.find(g => g.name.toLowerCase() === lower || g.name.toLowerCase().includes(lower));
                if (targetGuild) {
                    targetType = 'guild';
                }
            }
        }

        if (!targetType || targetType === 'none') {
            return message.reply({
                embeds: [build.warn(message.author, `unable to find any user or server matching \`${query.slice(0, 80)}\`.\n-# syntax: \`,lookup [@user | user_id | server_id]\``)]
            });
        }

        // ──────────────────────── RENDER USER INTELLIGENCE ────────────────────────
        if (targetType === 'user' && targetUser) {
            const createdSec = Math.floor(targetUser.createdTimestamp / 1000);
            const joinedSec = targetMember?.joinedTimestamp ? Math.floor(targetMember.joinedTimestamp / 1000) : null;
            const avatarURL = targetUser.displayAvatarURL({ size: 512, dynamic: true });
            const userBadges = targetUser.flags ? targetUser.flags.toArray().map(f => f.toLowerCase().replace(/_/g, ' ')).join(', ') : 'none';

            let extraInfo = '';
            if (targetMember) {
                const rolesCount = targetMember.roles.cache.filter(r => r.id !== message.guild.id).size;
                const highestRole = targetMember.roles.highest.id !== message.guild.id ? `<@&${targetMember.roles.highest.id}>` : 'none';
                extraInfo = `\n-# **joined:** <t:${joinedSec}:f> (<t:${joinedSec}:R>)\n` +
                            `-# **highest role:** ${highestRole} · **roles:** \`${rolesCount}\``;
            }

            const headerText = `### [${(targetUser.tag || targetUser.username).toLowerCase()}](https://discord.com/users/${targetUser.id})\n` +
                `-# **id:** \`${targetUser.id}\` · **bot:** \`${targetUser.bot ? 'yes' : 'no'}\`\n` +
                `-# **created:** <t:${createdSec}:f> (<t:${createdSec}:R>)` +
                extraInfo +
                (userBadges !== 'none' ? `\n-# **badges:** \`${userBadges}\`` : '');

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL));
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

                return await message.reply({
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(avatarURL)
                    .setDescription(headerText);
                if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);
                return await message.reply({ embeds: [embed], files });
            }
        }

        // ──────────────────────── RENDER GUILD INTELLIGENCE ────────────────────────
        if (targetType === 'guild' && targetGuild) {
            const createdSec = Math.floor(targetGuild.createdTimestamp / 1000);
            const iconURL = targetGuild.iconURL({ size: 512, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
            const ownerId = targetGuild.ownerId || 'unknown';
            const memberCount = targetGuild.memberCount || targetGuild.members?.cache?.size || 0;
            const channelCount = targetGuild.channels?.cache?.size || 0;
            const rolesCount = targetGuild.roles?.cache?.size || 0;
            const boosts = targetGuild.premiumSubscriptionCount || 0;
            const tier = targetGuild.premiumTier || 0;

            const headerText = `### [${targetGuild.name.toLowerCase()}](https://discord.gg/hCQhTmPf2G)\n` +
                `-# **id:** \`${targetGuild.id}\` · **owner:** <@${ownerId}> (\`${ownerId}\`)\n` +
                `-# **created:** <t:${createdSec}:f> (<t:${createdSec}:R>)\n` +
                `-# **members:** \`${memberCount.toLocaleString()}\` · **channels:** \`${channelCount}\` · **roles:** \`${rolesCount}\`\n` +
                `-# **boost level:** \`tier ${tier}\` (\`${boosts}\` boosts)`;

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL));
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

                return await message.reply({
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(iconURL)
                    .setDescription(headerText);
                if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);
                return await message.reply({ embeds: [embed], files });
            }
        }
    }
}

module.exports = LookupCommand;
