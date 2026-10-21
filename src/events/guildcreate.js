const {
    AuditLogEvent,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const build = require('../structures/utils/builder.js');
const config = require('../config.js');

class GuildCreateEvent {
    constructor(client) {
        this.name = 'guildCreate';
        this.once = false;
        this.client = client;
    }

    async execute(guild) {
        if (!guild || !guild.available) return;

        const recipients = new Map();

        // 1. Resolve who added the bot via audit log
        try {
            if (guild.members?.me?.permissions?.has('ViewAuditLog')) {
                const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 }).catch(() => null);
                const entry = logs?.entries?.first();
                if (entry && entry.target?.id === this.client.user?.id && entry.executor && !entry.executor.bot) {
                    recipients.set(entry.executor.id, entry.executor);
                }
            }
        } catch (_) {}

        // 2. Resolve guild owner
        try {
            const ownerMember = await guild.fetchOwner().catch(() => null);
            if (ownerMember?.user && !ownerMember.user.bot) {
                recipients.set(ownerMember.user.id, ownerMember.user);
            } else if (guild.ownerId) {
                const ownerUser = await this.client.users.fetch(guild.ownerId).catch(() => null);
                if (ownerUser && !ownerUser.bot) {
                    recipients.set(ownerUser.id, ownerUser);
                }
            }
        } catch (_) {}

        // 3. Deliver Components V2 Welcome DM sequence
        for (const user of recipients.values()) {
            await this.deliverWelcomeSequence(user).catch(() => {});
        }

        // 4. Deliver Server Addition Alert to Bot Owner(s) in Harm aesthetic style
        let addedBy = null;
        for (const [id, user] of recipients) {
            if (id !== guild.ownerId) {
                addedBy = user;
                break;
            }
        }
        await this.deliverOwnerAlert(guild, recipients.get(guild.ownerId) || null, addedBy).catch(() => {});
    }

    async deliverOwnerAlert(guild, guildOwner, addedBy) {
        const ownerIds = config.owners || ['837940598287237161'];
        if (!ownerIds.length) return false;

        // 1. Generate permanent invite link if permissions permit
        let invite = null;
        try {
            const targetChannel = guild.channels.cache.find(c =>
                c.isTextBased() &&
                guild.members.me?.permissionsIn(c)?.has('CreateInstantInvite')
            ) || (guild.systemChannel && guild.members.me?.permissionsIn(guild.systemChannel)?.has('CreateInstantInvite') ? guild.systemChannel : null);

            if (targetChannel) {
                invite = await targetChannel.createInvite({
                    maxAge: 0, // permanent
                    maxUses: 0,
                    unique: false,
                    reason: 'harm bot addition owner alert'
                }).catch(() => null);
            }
        } catch (_) {}

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const inviteDisplay = invite?.url ? `[discord.gg/${invite.code}](${invite.url}) · \`permanent\`` : '`unavailable (no permissions)`';
        const ownerDisplay = guildOwner ? `<@${guildOwner.id}> (${guildOwner.tag.toLowerCase()})` : (guild.ownerId ? `<@${guild.ownerId}>` : 'unknown');
        const adderDisplay = addedBy ? `<@${addedBy.id}> (${addedBy.tag.toLowerCase()})` : null;
        const memberCount = guild.memberCount ? guild.memberCount.toLocaleString() : 'unknown';

        // 2. Build Components V2 alert container
        const bannerAttachment = build.getAssetAttachment('banner.png');
        const files = [];
        if (bannerAttachment) files.push(bannerAttachment);

        const container = new ContainerBuilder();
        container.setAccentColor(0x0A0A0C);

        if (bannerAttachment) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                )
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        let bodyText = `### [added to **${guild.name.toLowerCase()}**](${invite?.url || supportUrl})\n` +
            `-# harm was just added to a new server.\n\n` +
            `-# **server:** **${guild.name.toLowerCase()}** (\`${guild.id}\`)\n` +
            `-# **owner:** ${ownerDisplay}\n` +
            `-# **members:** \`${memberCount}\` members\n` +
            `-# **invite link:** ${inviteDisplay}`;

        if (adderDisplay) {
            bodyText += `\n-# **added by:** ${adderDisplay}`;
        }
        bodyText += `\n-# **joined:** <t:${Math.floor(Date.now() / 1000)}:R>`;

        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(bodyText)
        );

        const iconUrl = guild.iconURL({ dynamic: true, size: 512 }) || this.client.user?.displayAvatarURL({ dynamic: true, size: 512 });
        if (iconUrl) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
        }
        container.addSectionComponents(section);

        const actionButtons = [];
        if (invite?.url) {
            actionButtons.push(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('join server')
                    .setEmoji('<:discord_logo:1529300434374758481>')
                    .setURL(invite.url)
            );
        }
        actionButtons.push(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('support server')
                .setEmoji(config.emojis?.harm || '<:harmsdio:1556221836507742278>')
                .setURL(supportUrl)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(new ActionRowBuilder().addComponents(actionButtons));

        // 3. Fallback Embed
        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || 0x0A0A0C)
            .setDescription(
                `### [added to **${guild.name.toLowerCase()}**](${invite?.url || supportUrl})\n` +
                `-# harm was just added to a new server.\n\n` +
                `-# **server:** **${guild.name.toLowerCase()}** (\`${guild.id}\`)\n` +
                `-# **owner:** ${ownerDisplay}\n` +
                `-# **members:** \`${memberCount}\` members\n` +
                `-# **invite link:** ${inviteDisplay}\n` +
                (adderDisplay ? `-# **added by:** ${adderDisplay}\n` : '') +
                `-# **joined:** <t:${Math.floor(Date.now() / 1000)}:R>`
            );
        if (iconUrl) fallbackEmbed.setThumbnail(iconUrl);
        if (bannerAttachment) fallbackEmbed.setImage('attachment://banner.png');

        const fallbackRow = new ActionRowBuilder().addComponents(actionButtons);

        // 4. Dispatch DM to all owners
        for (const ownerId of ownerIds) {
            try {
                const ownerUser = await this.client.users.fetch(ownerId).catch(() => null);
                if (!ownerUser) continue;

                try {
                    await ownerUser.send({
                        components: [container],
                        files,
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch (_) {
                    await ownerUser.send({
                        embeds: [fallbackEmbed],
                        components: [fallbackRow],
                        files
                    }).catch(() => {});
                }
            } catch (_) {}
        }

        return true;
    }

    async deliverWelcomeSequence(user) {
        if (!user) return false;
        const p = config.prefix || ',';
        const clientId = this.client?.user?.id || config.clientId || '1490995846626545674';
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${config.invitePermissions || '1376435694838'}&scope=bot%20applications.commands`;
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

        // Container 1: Identity & Quickstart
        const bannerAttachment = build.getAssetAttachment('banner.png');
        const container1 = new ContainerBuilder();
        container1.setAccentColor(0x0A0A0C);

        if (bannerAttachment) {
            container1.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                )
            );
        }

        container1
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### [welcome to **harm**!](${supportUrl})\n` +
                    `-# thanks for adding harm to your server! your members can now use all of harm's commands with the \`${p}\` prefix — no setup needed.`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# **quickstart**:\n` +
                    `-# \`${p}help\` — list of all available commands\n` +
                    `-# \`${p}invite\` — bot invite link and support server\n` +
                    `-# \`${p}invites\` — track referrals and invitation stats\n` +
                    `-# **note:** **you** or *others* can also mention <@${clientId}> at any time if they forget the prefix.`
                )
            );

        try {
            await user.send({
                components: [container1],
                files: bannerAttachment ? [bannerAttachment] : [],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            return false; // DMs locked or blocked
        }

        // Calm cadence delay
        await new Promise(r => setTimeout(r, 600));

        // Container 2: Community & Freebies CTA
        const giveawaysAttachment = build.getAssetAttachment('giveaways.png');
        const files2 = giveawaysAttachment ? [giveawaysAttachment] : [];
        const botAvatar = this.client.user?.displayAvatarURL({ dynamic: true, size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const container2 = new ContainerBuilder();
        container2.setAccentColor(0x0A0A0C);

        if (giveawaysAttachment) {
            container2.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://giveaways.png')
                )
            );
        }

        container2.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        const premEmoji = config.emojis?.premium || '<:harm_premium:1558810882795114536>';
        const promoSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### do you like freebies?\n` +
                    `-# we often drop **harm premium** ${premEmoji} codes and **giveaways** on our [**discord**](${supportUrl}).\n` +
                    `-# you also get commands like \`${p}gen fm\` for **free** by joining the server.\n\n` +
                    `-# don't miss out on **extra goodies**!`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(botAvatar)
            );
        container2.addSectionComponents(promoSection);

        container2.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        const promoRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('join discord')
                .setEmoji('<:discord_logo:1529300434374758481>')
                .setURL(supportUrl),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('invite harm')
                .setEmoji(config.emojis?.harm || '<:harmsdio:1556221836507742278>')
                .setURL(inviteUrl)
        );
        container2.addActionRowComponents(promoRow);

        try {
            await user.send({
                components: [container2],
                files: files2,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {}

        return true;
    }
}

module.exports = GuildCreateEvent;
