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
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

const EXP_THRESHOLDS = [0, 100, 250, 500, 1000];
const RANK_TITLES = ['honeymooners', 'soulmates', 'inseparable', 'eternal bond', 'devoted icons'];

function getRankTitle(level) {
    const idx = Math.max(1, Math.min(5, level)) - 1;
    return RANK_TITLES[idx] || 'honeymooners';
}

class MarryCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'marry';
        this.aliases = ['marriage', 'propose', 'proposal'];
        this.description = 'propose to another member or view your marriage certificate and affinity.';
        this.syntax = ',marry [@user]';
        this.example = ',marry @user\n,marry';
        this.category = 'fun';
        this.cooldown = 3;
        this.permissions = [];
        this.subcommands = [
            'marry <@user>',
            'marry status [@user]'
        ];
        this.subcommandDetails = {
            propose: {
                description: 'propose marriage to another server member.',
                syntax: ',marry <@user>',
                example: ',marry @user'
            },
            status: {
                description: 'view your marriage certificate, anniversary, and bond level.',
                syntax: ',marry [status] [@user]',
                example: ',marry'
            }
        };
    }

    async resolveTarget(message, arg) {
        if (message.mentions?.users?.size > 0) {
            return message.mentions.users.first();
        }
        if (arg) {
            const cleanId = arg.replace(/[<@!>]/g, '').trim();
            if (/^\d{17,20}$/.test(cleanId)) {
                try {
                    return await message.client.users.fetch(cleanId);
                } catch (_) {}
            }
        }
        return null;
    }

    async execute(message, args) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const guildId = message.guild?.id || 'global';
        const sub = (args[0] || '').toLowerCase();

        // 1. Certificate / Status Mode
        if (!args[0] || sub === 'status' || sub === 'info' || sub === 'certificate') {
            const lookupArg = (sub === 'status' || sub === 'info' || sub === 'certificate') ? args[1] : args[0];
            const targetUser = (await this.resolveTarget(message, lookupArg)) || message.author;
            return this.showCertificate(message, db, guildId, targetUser);
        }

        // 2. Proposal Mode
        const targetUser = await this.resolveTarget(message, args[0]);
        if (!targetUser) {
            return message.reply({ embeds: [build.warn(message.author, `specify a valid member to propose to. syntax: \`${config.prefix || ','}marry @user\``)] });
        }

        return this.handleProposal(message, db, guildId, targetUser);
    }

    // ─────────────────────────────────────────────────────────────
    // MARRIAGE CERTIFICATE (100% CANVAS-FREE COMPONENTS V2)
    // ─────────────────────────────────────────────────────────────

    async showCertificate(message, db, guildId, targetUser) {
        const marriage = await db.getMarriage(guildId, targetUser.id);
        const p = config.prefix || ',';

        if (!marriage) {
            if (targetUser.id === message.author.id) {
                return message.reply({
                    embeds: [build.warn(message.author, `you are not married to anyone. propose with \`${p}marry @user\`!`)]
                });
            }
            return message.reply({
                embeds: [build.warn(message.author, `<@${targetUser.id}> is currently single.`)]
            });
        }

        const e = config.emojis || {};
        const u1 = await message.client.users.fetch(marriage.user1_id).catch(() => null);
        const u2 = await message.client.users.fetch(marriage.user2_id).catch(() => null);
        const partnerUser = (targetUser.id === marriage.user1_id) ? u2 : u1;
        const partnerName = (partnerUser?.globalName || partnerUser?.username || 'partner').toLowerCase();
        const partnerAvatar = partnerUser?.displayAvatarURL({ size: 256, dynamic: true }) || targetUser.displayAvatarURL({ size: 256, dynamic: true });
        const bannerAtt = build.getAssetAttachment('fun.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const buildCertificateComponents = (m) => {
            const level = m.level || 1;
            const rankTitle = getRankTitle(level);
            const dailyBonus = 15 + Math.min(12, (level - 1) * 3);
            const loveExp = m.love_exp || 0;
            const ringName = m.ring || 'silver ring';

            const targetExp = EXP_THRESHOLDS[level] || 1000;
            const progressPct = Math.min(100, Math.floor((loveExp / targetExp) * 100));
            const progressStr = level >= 5 ? '`max rank`' : `\`${loveExp} / ${targetExp} exp\` (${progressPct}%)`;

            const desc = [
                `### [marriage certificate](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})`,
                `-# eternal bond and companionship.\n`,
                `**partners** <@${m.user1_id}> & <@${m.user2_id}>`,
                `**bond** level \`${level}\` · \`${rankTitle}\``,
                `**progress** ${progressStr}`,
                `**anniversary** <t:${m.created_at}:D> (<t:${m.created_at}:R>)`,
                `**ring** \`${ringName}\` · **perks** \`+${dailyBonus}%\` daily bonus`
            ].join('\n');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('marry_btn_love')
                    .setLabel('express love')
                    .setEmoji(e.harm_heart || '<:harm_heart:1559895595848695960>')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel(`${partnerName}'s profile`)
                    .setEmoji(e.idcard || '<:idcard:1558818721156567040>')
                    .setURL(`https://discord.com/users/${m.partnerId}`)
            );

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(partnerAvatar));
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
                container.addActionRowComponents(row);

                return {
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2,
                    rawRow: row,
                    rawDesc: desc
                };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(partnerAvatar)
                    .setDescription(desc);
                if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

                return {
                    embeds: [embed],
                    components: [row],
                    files,
                    rawRow: row,
                    rawDesc: desc
                };
            }
        };

        const initialPayload = buildCertificateComponents(marriage);
        const replyMsg = await message.reply(initialPayload).catch(() => null);
        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'marry_btn_love') {
                const isCouple = i.user.id === marriage.user1_id || i.user.id === marriage.user2_id;
                if (!isCouple) {
                    return i.reply({
                        content: 'only the married couple can express love on this certificate.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                const freshMarriage = await db.getMarriage(guildId, i.user.id);
                if (!freshMarriage) return;

                const now = Math.floor(Date.now() / 1000);
                const COOLDOWN = 2 * 3600; // 2 hours
                const elapsed = now - (freshMarriage.last_love || 0);

                if (elapsed < COOLDOWN) {
                    const nextLove = (freshMarriage.last_love || 0) + COOLDOWN;
                    return i.reply({
                        content: `you already showed affection recently. next expression opens <t:${nextLove}:R>.`,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                collector.resetTimer();
                const expGain = Math.floor(Math.random() * 16) + 25; // 25 - 40 exp
                const res = await db.addMarriageExp(guildId, i.user.id, expGain);

                const updatedPayload = buildCertificateComponents(res.marriage);
                await i.update(updatedPayload).catch(() => {});

                const partnerMention = `<@${freshMarriage.partnerId}>`;
                const promoText = res.leveledUp
                    ? ` **bond leveled up!** reached level \`${res.newLevel}\` (\`${getRankTitle(res.newLevel)}\`)!`
                    : '';
                return i.followUp({
                    content: `sent love to ${partnerMention}! (+\`${expGain}\` bond exp).${promoText}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'deleted') return;
        });
    }

    // ─────────────────────────────────────────────────────────────
    // PROPOSAL FLOW (100% CANVAS-FREE COMPONENTS V2)
    // ─────────────────────────────────────────────────────────────

    async handleProposal(message, db, guildId, targetUser) {
        const p = config.prefix || ',';

        if (targetUser.id === message.author.id) {
            return message.reply({ embeds: [build.warn(message.author, "you can't marry yourself.")] });
        }

        if (targetUser.bot) {
            return message.reply({ embeds: [build.warn(message.author, 'bots cannot marry humans.')] });
        }

        const authorMarriage = await db.getMarriage(guildId, message.author.id);
        if (authorMarriage) {
            return message.reply({
                embeds: [build.warn(message.author, `you are already married to <@${authorMarriage.partnerId}>. use \`${p}divorce\` first.`)]
            });
        }

        const targetMarriage = await db.getMarriage(guildId, targetUser.id);
        if (targetMarriage) {
            return message.reply({
                embeds: [build.warn(message.author, `<@${targetUser.id}> is already married to <@${targetMarriage.partnerId}>.`)]
            });
        }

        const hasDiamondRing = (await db.getItem(guildId, message.author.id, 'diamond_ring')) > 0;
        const ring = hasDiamondRing ? 'diamond ring' : 'silver ring';
        const startLevel = hasDiamondRing ? 2 : 1;
        const dailyBonus = 15 + (startLevel - 1) * 3;

        const e = config.emojis || {};
        const targetAvatar = targetUser.displayAvatarURL({ size: 256, dynamic: true });
        const bannerAtt = build.getAssetAttachment('fun.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const proposalDesc = [
            `### [marriage proposal](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})`,
            `-# a formal vow of companionship.\n`,
            `**proposer** <@${message.author.id}>`,
            `**partner** <@${targetUser.id}>`,
            `**ring** \`${ring}\``,
            `**perks** \`+${dailyBonus}%\` daily bonus · shared affinity\n`,
            `> will you accept this proposal?`
        ].join('\n');

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('marry_accept')
                .setLabel('accept proposal')
                .setEmoji(e.harm_ring || e.harm_heart || '<:harm_ring:1560309021078982676>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('marry_decline')
                .setLabel('decline')
                .setEmoji(e.deny || '<:harm_deny:1558811268608167939>')
                .setStyle(ButtonStyle.Secondary)
        );

        let proposalPayload;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(proposalDesc))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(targetAvatar));
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
            container.addActionRowComponents(actionRow);

            proposalPayload = {
                content: `<@${targetUser.id}>`,
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            };
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(targetAvatar)
                .setDescription(proposalDesc);
            if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

            proposalPayload = {
                content: `<@${targetUser.id}>`,
                embeds: [embed],
                components: [actionRow],
                files
            };
        }

        const proposalMsg = await message.reply(proposalPayload).catch(() => null);
        if (!proposalMsg) return;

        let answered = false;
        const collector = proposalMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== targetUser.id) {
                if (i.user.id === message.author.id) {
                    return i.reply({ content: "you can't accept your own proposal.", flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                return i.reply({ content: 'this proposal is not for you.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            answered = true;
            collector.stop('answered');

            if (i.customId === 'marry_accept') {
                if (hasDiamondRing) {
                    await db.removeItem(guildId, message.author.id, 'diamond_ring', 1);
                }

                await db.createMarriage(guildId, message.author.id, targetUser.id, ring, startLevel);
                const now = Math.floor(Date.now() / 1000);
                const rankTitle = getRankTitle(startLevel);

                const consecratedDesc = [
                    `### [marriage consecrated](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})`,
                    `-# vows exchanged with a \`${ring}\`.\n`,
                    `**partners** <@${message.author.id}> & <@${targetUser.id}>`,
                    `**anniversary** <t:${now}:D> (<t:${now}:R>)`,
                    `**bond** level \`${startLevel}\` · \`${rankTitle}\``,
                    `**perks** \`+${dailyBonus}%\` daily bonus`
                ].join('\n');

                const linkRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('partner profile')
                        .setEmoji(e.idcard || '<:idcard:1558818721156567040>')
                        .setURL(`https://discord.com/users/${message.author.id}`)
                );

                try {
                    const container = new ContainerBuilder();
                    container.setAccentColor(config.colors.c || 0x0A0A0C);

                    const section = new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(consecratedDesc))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(targetAvatar));
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
                    container.addActionRowComponents(linkRow);

                    await i.update({
                        content: '',
                        components: [container],
                        files,
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => {});
                } catch (_) {
                    const embed = new EmbedBuilder()
                        .setColor(config.colors.c || 0x0A0A0C)
                        .setThumbnail(targetAvatar)
                        .setDescription(consecratedDesc);
                    if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

                    await i.update({
                        content: '',
                        embeds: [embed],
                        components: [linkRow],
                        files
                    }).catch(() => {});
                }
            } else {
                const declinedNotice = build.say(
                    message.author,
                    `<@${targetUser.id}> respectfully declined the proposal from <@${message.author.id}>.`
                );
                await i.update({
                    content: '',
                    embeds: [declinedNotice],
                    components: [],
                    files: []
                }).catch(() => {});
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'deleted' || answered) return;
            const timeoutEmbed = build.warn(
                message.author,
                `the marriage proposal to <@${targetUser.id}> timed out.`
            );
            await proposalMsg.edit({
                content: '',
                embeds: [timeoutEmbed],
                components: [],
                files: []
            }).catch(() => {});
        });
    }
}

module.exports = MarryCommand;
