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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const BadgeHelper = require('../../structures/utils/helpers/badgehelper.js');

class ProfileCommand {
    constructor() {
        this.name = 'profile';
        this.aliases = ['p', 'dossier', 'userprofile', 'bio', 'setbio'];
        this.description = 'interactive harm identity hub with bio, dossier, badges, and achievements.';
        this.syntax = ',profile [@user|uid]';
        this.example = ',profile @user';
        this.category = 'info';
        this.cooldown = 3;
        this.subcommands = ['bio', 'rep', 'badge', 'badges', 'grant', 'revoke'];
        this.subcommandDetails = {
            bio: {
                description: 'customize your personal bio displayed on your harm profile.',
                syntax: ',profile bio <text>',
                example: ',profile bio aesthetic developer'
            },
            rep: {
                description: 'give a reputation point to another server member (+1 rep).',
                syntax: ',profile rep @user',
                example: ',profile rep @user'
            },
            badge: {
                description: 'equip or remove a featured badge displayed next to your profile name.',
                syntax: ',profile badge <badge_name|clear>',
                example: ',profile badge developer'
            },
            badges: {
                description: 'view your full showcase of unlocked badges and milestones in progress.',
                syntax: ',profile badges [@user]',
                example: ',profile badges'
            },
            grant: {
                description: 'grant a badge to a member (owner only).',
                syntax: ',profile grant @user <badge_id>',
                example: ',profile grant @user early_adopter'
            },
            revoke: {
                description: 'revoke a badge from a member (owner only).',
                syntax: ',profile revoke @user <badge_id>',
                example: ',profile revoke @user early_adopter'
            }
        };
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

    async execute(message, args, commandName) {
        const db = message.client.db;
        const isCallerOwner = config.owners?.includes(message.author.id);
        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();

        // 1. Direct or Subcommand: ,bio <text> / ,setbio <text> / ,profile bio <text>
        if (invoked === 'bio' || invoked === 'setbio' || sub === 'bio' || sub === 'setbio') {
            const rawBio = (invoked === 'bio' || invoked === 'setbio') ? args.join(' ') : args.slice(1).join(' ');
            const newBio = rawBio.trim();
            if (!newBio) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,profile bio <text>`')] });
            }
            if (newBio.length > 160) {
                return message.reply({ embeds: [build.deny(message.author, 'your bio cannot exceed 160 characters.')] });
            }
            if (db) {
                await db.setUserBio(message.author.id, newBio);
            }
            return message.reply({ embeds: [build.approved(message.author, 'your profile bio has been updated.')] });
        }

        // 2. CLI Subcommand: ,profile rep @user
        if (sub === 'rep' || sub === 'reputation') {
            let target = null;
            if (args[1]) {
                target = await this.resolveTargetUser(message, args[1]);
            }
            if (!target) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,profile rep @user`')] });
            }
            if (target.id === message.author.id) {
                return message.reply({ embeds: [build.deny(message.author, 'you cannot give reputation to yourself.')] });
            }
            if (target.bot) {
                return message.reply({ embeds: [build.deny(message.author, 'bots cannot receive reputation.')] });
            }
            if (!db) {
                return message.reply({ embeds: [build.deny(message.author, 'database is currently unavailable.')] });
            }
            const res = await db.giveUserRep(message.guild?.id || 'global', message.author.id, target.id);
            if (!res.success) {
                if (res.reason === 'cooldown') {
                    const hours = Math.ceil(res.remaining / 3600);
                    return message.reply({ embeds: [build.warn(message.author, `you can give reputation again in \`${hours}h\`.`)] });
                }
                return message.reply({ embeds: [build.deny(message.author, 'could not give reputation right now.')] });
            }
            // Auto sync badges for recipient
            await BadgeHelper.syncAndGetBadges(message.client, target, message.guild?.id || 'global').catch(() => {});
            return message.reply({ embeds: [build.approved(message.author, `gave +1 rep to <@${target.id}> (now at \`${res.rep} rep\`).`)] });
        }

        // 3. CLI Subcommand: ,profile badge <badge_id|clear> or ,profile equip <badge_id|clear>
        if (sub === 'badge' || sub === 'equip') {
            const badgeArg = (args[1] || '').toLowerCase().trim();
            if (!badgeArg) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,profile badge <badge_id|clear>`')] });
            }
            if (badgeArg === 'clear' || badgeArg === 'none' || badgeArg === 'remove') {
                if (db) await db.setFeaturedBadge(message.author.id, null);
                return message.reply({ embeds: [build.approved(message.author, 'cleared your featured profile badge.')] });
            }

            const cleanId = badgeArg.replace(/\s+/g, '_');
            const targetBadge = BadgeHelper.getBadge(cleanId);
            if (!targetBadge) {
                return message.reply({ embeds: [build.warn(message.author, `unknown badge \`${badgeArg}\`. run \`,profile badges\` to view available badges.`)] });
            }

            const badgeData = await BadgeHelper.syncAndGetBadges(message.client, message.author, message.guild?.id || 'global');
            const hasBadge = badgeData.unlocked.some(b => b.id === targetBadge.id);
            if (!hasBadge) {
                return message.reply({ embeds: [build.deny(message.author, `you have not unlocked the **${targetBadge.name}** badge yet.`)] });
            }

            if (db) await db.setFeaturedBadge(message.author.id, targetBadge.id);
            return message.reply({ embeds: [build.approved(message.author, `equipped ${targetBadge.emoji} **${targetBadge.name}** as your featured badge.`)] });
        }

        // 4. Owner Subcommand: ,profile grant @user <badge_id>
        if (sub === 'grant') {
            if (!isCallerOwner) {
                return message.reply({ embeds: [build.deny(message.author, 'this subcommand is reserved for bot owners.')] });
            }
            if (!args[1] || !args[2]) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,profile grant @user <badge_id>`')] });
            }
            const target = await this.resolveTargetUser(message, args[1]);
            if (!target) {
                return message.reply({ embeds: [build.warn(message.author, 'could not resolve target user.')] });
            }
            const badgeId = args[2].toLowerCase().replace(/\s+/g, '_');
            if (db) await db.grantUserBadge(target.id, badgeId);
            const b = BadgeHelper.getBadge(badgeId);
            const emojiStr = b ? b.emoji : (config.emojis?.harm || '<:harmsdio:1556221836507742278>');
            return message.reply({ embeds: [build.approved(message.author, `granted ${emojiStr} \`${badgeId}\` badge to <@${target.id}>.`)] });
        }

        // 5. Owner Subcommand: ,profile revoke @user <badge_id>
        if (sub === 'revoke') {
            if (!isCallerOwner) {
                return message.reply({ embeds: [build.deny(message.author, 'this subcommand is reserved for bot owners.')] });
            }
            if (!args[1] || !args[2]) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,profile revoke @user <badge_id>`')] });
            }
            const target = await this.resolveTargetUser(message, args[1]);
            if (!target) {
                return message.reply({ embeds: [build.warn(message.author, 'could not resolve target user.')] });
            }
            const badgeId = args[2].toLowerCase().replace(/\s+/g, '_');
            if (db) await db.revokeUserBadge(target.id, badgeId);
            return message.reply({ embeds: [build.approved(message.author, `revoked \`${badgeId}\` badge from <@${target.id}>.`)] });
        }

        // Determine starting tab
        let currentTab = 'overview';
        let targetArg = args?.[0];
        if (sub === 'badges' || sub === 'achievements') {
            currentTab = 'badges';
            targetArg = args?.[1];
        }

        // Resolve Target for Dashboard
        let targetUser = message.author;
        if (targetArg) {
            const resolved = await this.resolveTargetUser(message, targetArg);
            if (!resolved) {
                return message.reply(build.warnBox('nothing found', `user or uid \`${targetArg}\` could not be found.`));
            }
            targetUser = resolved;
        }

        // Dedicated Bot Profile Card
        if (targetUser.bot) {
            const displayName = (targetUser.globalName || targetUser.displayName || targetUser.username || 'bot').toLowerCase();
            const username = targetUser.username.toLowerCase();
            const userLink = `https://discord.com/users/${targetUser.id}`;
            const avatar = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });
            const bannerAtt = build.getAssetAttachment('banner.png');
            const files = bannerAtt ? [bannerAtt] : [];

            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [${displayName} • harm bot](${userLink})\n` +
                        `-# [@${username}](${userLink}) · \`${targetUser.id}\`\n\n` +
                        `-# **status:** \`application bot\` · **membership:** \`exempt\`\n` +
                        `-# bots cannot register user profiles or hold economy balances.`
                    )
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar));
            container.addSectionComponents(section);

            if (bannerAtt) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`))
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
                    .setColor(0x0A0A0C)
                    .setThumbnail(avatar)
                    .setDescription(`**[${displayName}](${userLink})**\n*bots cannot hold harm user profiles.*`);
                if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);
                return await message.reply({ embeds: [fallbackEmbed], files }).catch(() => {});
            }
        }

        // Human User Profile Hub
        let profile = db ? await db.getUserProfile(targetUser.id, true) : { uid: 1, tier: 'standard', rep: 0, bio: null, featured_badge: null };
        if (!profile) profile = { uid: 1, tier: 'standard', rep: 0, bio: null, featured_badge: null };

        const isOwner = config.owners?.includes(targetUser.id);
        const e = config.emojis || {};
        const guildId = message.guild?.id || 'global';
        const isSelf = targetUser.id === message.author.id;

        // Tiers & Emojis
        const standardEmoji = e.standard || '<:harm_standard:1558811340385026119>';
        const premiumEmoji = e.premium || '<:harm_premium:1558810882795114536>';
        const crownEmoji = e.gw_crown || '<:gw_crown:1558198883883028621>';

        let tierEmoji = standardEmoji;
        let tierLabel = 'standard';

        if (isOwner) {
            tierEmoji = crownEmoji;
            tierLabel = 'owner';
        } else if (profile.tier === 'premium') {
            tierEmoji = premiumEmoji;
            tierLabel = 'premium';
        }

        // Fetch User Telemetry from DB
        const eco = db ? (await db.getEconomy(guildId, targetUser.id)) : { wallet: 0, bank: 0, vault: 0, prestige: 0 };
        const card = db ? (await db.getCard(guildId, targetUser.id)) : null;
        const work = db ? (await db.getWork(guildId, targetUser.id)) : null;
        const marriage = db ? (await db.getMarriage(guildId, targetUser.id)) : null;
        const invites = db ? (await db.getUserInvites(guildId, targetUser.id)) : { total: 0, joins: 0 };

        const wallet = eco.wallet || 0;
        const bank = eco.bank || 0;
        const vault = eco.vault || 0;
        const netWorth = wallet + bank + vault;
        const bannerAtt = isOwner
            ? (build.getAssetAttachment('owner.png') || build.getAssetAttachment('banner.png'))
            : build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        // Synchronize and retrieve badges & achievements
        let badgeData = await BadgeHelper.syncAndGetBadges(message.client, targetUser, guildId);

        const buildUI = (disabled = false) => {
            const repCount = profile.rep || 0;
            const bioText = profile.bio ? profile.bio : (isSelf ? 'no bio set · click edit bio below.' : 'no personal bio provided.');

            const userLink = `https://discord.com/users/${targetUser.id}`;
            const displayName = (targetUser.globalName || targetUser.displayName || targetUser.username || 'user').toLowerCase();
            const username = targetUser.username.toLowerCase();
            const avatarUrl = targetUser.displayAvatarURL({ size: 1024, extension: 'png' });

            const featuredBadge = badgeData.featured;
            const featuredSuffix = featuredBadge ? ` ${featuredBadge.emoji}` : '';

            // Build clean, breathable card copy per tab
            let tabContent = '';
            if (currentTab === 'overview') {
                const partnerLine = marriage?.partnerId ? `<@${marriage.partnerId}> (lvl \`${marriage.level || 1}\`)` : '`single`';
                tabContent = [
                    `### [${displayName}${featuredSuffix}](${userLink})`,
                    `-# [@${username}](${userLink}) · \`${targetUser.id}\``,
                    `> *${bioText}*\n`,
                    `-# **identity** · uid \`${profile.uid}\` · ${tierEmoji} \`${tierLabel}\` · \`${repCount}\` rep`,
                    `-# **finances** · \`$${netWorth.toLocaleString()}\` net · \`$${wallet.toLocaleString()}\` cash`,
                    `-# **social** · partner ${partnerLine} · \`${invites.joins || 0}\` invites`,
                    `-# **badges** · ${badgeData.shelf}`
                ].join('\n');
            } else if (currentTab === 'badges') {
                const unlockedCount = badgeData.unlocked.length;
                const totalCount = badgeData.catalog.length;
                const featuredLine = featuredBadge ? `${featuredBadge.emoji} \`${featuredBadge.name}\`` : '`none equipped`';

                const lines = [
                    `### [${displayName} • achievements](${userLink})`,
                    `-# unlocked \`${unlockedCount} of ${totalCount}\` badges · featured: ${featuredLine}\n`
                ];

                if (badgeData.unlocked.length > 0) {
                    lines.push(`-# **unlocked showcase**`);
                    for (const b of badgeData.unlocked.slice(0, 6)) {
                        lines.push(`-# ${b.emoji} **${b.name}** — ${b.description}`);
                    }
                    if (badgeData.unlocked.length > 6) {
                        lines.push(`-# + \`${badgeData.unlocked.length - 6}\` additional unlocked badges`);
                    }
                } else {
                    lines.push(`-# **unlocked showcase** · \`no badges unlocked yet\``);
                }

                // Show up to 3 next locked milestones
                const lockedBadges = badgeData.catalog.filter(b => !b.unlocked);
                if (lockedBadges.length > 0) {
                    lines.push(`\n-# **milestones in progress**`);
                    for (const b of lockedBadges.slice(0, 3)) {
                        lines.push(`-# \`[locked]\` **${b.name}** — ${b.requirement}`);
                    }
                }

                tabContent = lines.join('\n');
            } else {
                // Dossier Tab
                const hasJob = Boolean(work && work.career && (work.shifts_completed > 0 || work.last_work > 0 || work.exp > 0));
                const careerLine = hasJob
                    ? `\`${work.career}\` (lvl \`${work.level || 1}\`) · streak \`${work.work_streak || 0}d\``
                    : '`unemployed`';
                const cardText = card?.is_open ? `\`${card.tier}\`` : '`none`';

                tabContent = [
                    `### [${displayName} • dossier](${userLink})`,
                    `-# career, banking, and membership telemetry\n`,
                    `-# **career** · ${careerLine}`,
                    `-# **banking** · \`$${bank.toLocaleString()}\` bank · card ${cardText}`,
                    `-# **reputation** · \`${repCount}\` rep · badges ${badgeData.shelf}`
                ].join('\n');
            }

            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c ? parseInt(config.colors.c.replace('#', ''), 16) : 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(tabContent))
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

            // Primary Navigation Action Row
            const buttonRow = new ActionRowBuilder();
            const harmEmoji = e.harm || '<:harmsdio:1556221836507742278>';
            const badgeEmoji = e.streak || '<:streak:1558818734582399007>';
            const dossierEmoji = e.idcard || '<:idcard:1558818721156567040>';

            if (isSelf) {
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('profile_btn_bio')
                        .setLabel('edit bio')
                        .setEmoji(e.renamevc || '<:renamevc:1558818794728591512>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(disabled)
                );
            } else {
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('profile_btn_give_rep')
                        .setLabel('+1 rep')
                        .setEmoji(e.harm_heart || '<:harm_heart:1559895595848695960>')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(disabled)
                );
            }

            // Tab 1: Overview or Badges
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('profile_btn_tab_overview')
                    .setLabel('overview')
                    .setEmoji(harmEmoji)
                    .setStyle(currentTab === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled || currentTab === 'overview'),
                new ButtonBuilder()
                    .setCustomId('profile_btn_tab_badges')
                    .setLabel('badges')
                    .setEmoji(badgeEmoji)
                    .setStyle(currentTab === 'badges' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled || currentTab === 'badges'),
                new ButtonBuilder()
                    .setCustomId('profile_btn_tab_dossier')
                    .setLabel('dossier')
                    .setEmoji(dossierEmoji)
                    .setStyle(currentTab === 'dossier' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled || currentTab === 'dossier')
            );

            container.addActionRowComponents(buttonRow);

            // Optional Interactive Badge Selector on Badges Tab for Self
            let selectRow = null;
            if (currentTab === 'badges' && isSelf && badgeData.unlocked.length > 0 && !disabled) {
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

                selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('profile_select_badge')
                        .setPlaceholder('choose featured badge to equip...')
                        .addOptions(options)
                );

                container.addActionRowComponents(selectRow);
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(avatarUrl)
                .setDescription(tabContent);

            if (bannerAtt) {
                embed.setImage(`attachment://${bannerAtt.name}`);
            }

            const allRows = selectRow ? [buttonRow, selectRow] : [buttonRow];
            return { container, embed, rows: allRows };
        };

        const { container, embed, rows } = buildUI();

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
                components: rows,
                files,
                allowedMentions: { repliedUser: false }
            }).catch(() => null);
        }

        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'only the command author can control this menu.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            collector.resetTimer?.();

            if (i.isStringSelectMenu() && i.customId === 'profile_select_badge') {
                const selected = i.values[0];
                if (selected === 'none') {
                    if (db) await db.setFeaturedBadge(message.author.id, null);
                    profile.featured_badge = null;
                } else {
                    const valid = badgeData.unlocked.find(b => b.id === selected);
                    if (valid && db) {
                        await db.setFeaturedBadge(message.author.id, valid.id);
                        profile.featured_badge = valid.id;
                    }
                }
                badgeData = await BadgeHelper.syncAndGetBadges(message.client, targetUser, guildId);
                const { container: updatedContainer, embed: updatedEmb, rows: updatedRows } = buildUI();
                try {
                    await i.update({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
                } catch (_) {
                    await i.update({ embeds: [updatedEmb], components: updatedRows }).catch(() => {});
                }
                return;
            }

            if (i.isButton()) {
                if (i.customId === 'profile_btn_tab_overview') {
                    currentTab = 'overview';
                } else if (i.customId === 'profile_btn_tab_badges') {
                    currentTab = 'badges';
                } else if (i.customId === 'profile_btn_tab_dossier') {
                    currentTab = 'dossier';
                } else if (i.customId === 'profile_btn_give_rep') {
                    if (!db) {
                        return i.reply({ content: 'database is currently unavailable.', flags: MessageFlags.Ephemeral }).catch(() => {});
                    }
                    const res = await db.giveUserRep(guildId, message.author.id, targetUser.id);
                    if (!res.success) {
                        if (res.reason === 'cooldown') {
                            const hours = Math.ceil(res.remaining / 3600);
                            return i.reply({ content: `you are on cooldown for reputation. retry in ${hours}h.`, flags: MessageFlags.Ephemeral }).catch(() => {});
                        }
                        return i.reply({ content: 'failed to grant reputation.', flags: MessageFlags.Ephemeral }).catch(() => {});
                    }
                    profile.rep = res.rep;
                    badgeData = await BadgeHelper.syncAndGetBadges(message.client, targetUser, guildId);
                    const { container: updatedContainer, embed: updatedEmb, rows: updatedRows } = buildUI();
                    try {
                        await i.update({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
                    } catch (_) {
                        await i.update({ embeds: [updatedEmb], components: updatedRows }).catch(() => {});
                    }
                    return i.followUp({ content: `successfully gave +1 rep to <@${targetUser.id}>!`, flags: MessageFlags.Ephemeral }).catch(() => {});
                } else if (i.customId === 'profile_btn_bio') {
                    const modalId = `modal_bio_${i.id}_${Date.now()}`;
                    const modal = new ModalBuilder()
                        .setCustomId(modalId)
                        .setTitle('edit harm profile bio');

                    const bioInput = new TextInputBuilder()
                        .setCustomId('bio_text')
                        .setLabel('personal bio (max 160 chars)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(profile.bio || '')
                        .setMaxLength(160)
                        .setPlaceholder('tell the server about yourself...')
                        .setRequired(false);

                    modal.addComponents(new ActionRowBuilder().addComponents(bioInput));

                    await i.showModal(modal).catch(() => {});

                    try {
                        const submitted = await i.awaitModalSubmit({
                            filter: sm => sm.customId === modalId && sm.user.id === message.author.id,
                            time: 45000
                        });

                        collector.resetTimer?.();
                        const valBio = submitted.fields.getTextInputValue('bio_text')?.trim() || null;
                        if (db) {
                            await db.setUserBio(message.author.id, valBio);
                        }
                        profile.bio = valBio;

                        const { container: updatedContainer, embed: updatedEmb, rows: updatedRows } = buildUI();
                        try {
                            await submitted.update({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
                        } catch (_) {
                            try {
                                await submitted.update({
                                    embeds: [updatedEmb],
                                    components: updatedRows
                                });
                            } catch (_) {
                                await replyMsg.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                                await submitted.reply({ content: 'profile bio updated.', flags: MessageFlags.Ephemeral }).catch(() => {});
                            }
                        }
                    } catch (_) {}
                    return;
                }
            }

            const { container: updatedContainer, embed: updatedEmb, rows: updatedRows } = buildUI();
            try {
                await i.update({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
            } catch (_) {
                await i.update({
                    embeds: [updatedEmb],
                    components: updatedRows
                }).catch(() => {});
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'deleted') return;
            try {
                const { container: finalContainer, embed: finalEmb, rows: finalRows } = buildUI(true);
                try {
                    await replyMsg.edit({ components: [finalContainer], flags: MessageFlags.IsComponentsV2 });
                } catch (_) {
                    await replyMsg.edit({ embeds: [finalEmb], components: finalRows, skipV2: true }).catch(() => {});
                }
            } catch (_) {}
        });
    }
}

module.exports = ProfileCommand;
