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

class BalanceCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'balance';
        this.aliases = ['bal', 'wallet', 'credits', 'baltop', 'top', 'rich', 'leaderboard', 'lb'];
        this.description = 'check your or another member\'s current wallet and bank balance, or view the wealth leaderboard.';
        this.syntax = ',balance [@user | top]';
        this.example = ',balance | ,balance top | ,baltop';
        this.category = 'economy';
        this.cooldown = 2;
        this.permissions = [];
        this.subcommands = [
            'balance [@user]',
            'balance top'
        ];
        this.extraArguments = 'use ",balance top" (or ",baltop", ",top", ",rich") to view the richest members in the server.';
        this.subcommandDetails = {
            top: {
                description: 'display the wealthiest members in the server ranked by cumulative net worth.',
                syntax: ',balance top',
                example: ',balance top'
            }
        };
    }

    async execute(message, args, commandName) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const invokedAs = (commandName || '').toLowerCase();
        const sub = (args && args[0] ? args[0].toLowerCase() : '');

        // Route to leaderboard if invoked as baltop, top, rich, leaderboard, lb, or sub is "top" / "leaderboard" / "lb" / "rich"
        if (
            ['baltop', 'top', 'rich', 'leaderboard', 'lb'].includes(invokedAs) ||
            ['top', 'leaderboard', 'lb', 'rich'].includes(sub)
        ) {
            return this.showLeaderboard(message);
        }

        let target = message.author;
        if (args && args.length > 0) {
            const mention = message.mentions.users.first();
            if (mention) {
                target = mention;
            } else {
                const fetched = await message.client.users.fetch(args[0]).catch(() => null);
                if (fetched) {
                    target = fetched;
                } else {
                    // Check if it's a typo of "top"
                    if (sub === 'tp' || sub === 'topp' || sub === 'tpo' || sub === 'leader' || sub === 'lead') {
                        return message.reply({
                            embeds: [build.say(message.author, `did you mean \`${prefix}balance top\`?`)]
                        });
                    }
                    return message.reply({
                        embeds: [build.warn(message.author, `could not find user \`${args[0]}\`.\n-# syntax: \`${prefix}balance [@user | top]\``)]
                    });
                }
            }
        }

        const prefix = (db.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
        const color = config.colors.c || '#2b2d31';
        const e = config.emojis || {};

        // Check if bank account is open
        const hasCard = await db.hasCard(message.guild.id, target.id);
        if (!hasCard) {
            const warnText = target.id === message.author.id
                ? `you do not have an open bank account. use \`${prefix}card open\` first.`
                : `<@${target.id}> does not have an open bank account.`;
            return message.reply({ embeds: [build.warn(message.author, warnText)] });
        }

        const eco = await db.getEconomy(message.guild.id, target.id);
        const card = await db.getCard(message.guild.id, target.id) || {};
        const wallet = eco.wallet || 0;
        const bank = eco.bank || 0;
        const total = wallet + bank;
        const capacity = card.bank_capacity || 25000;
        const earned = card.earned_all_time || (total > 0 ? total : 1000);
        const streak = eco.streak || 0;
        const rank = await db.getEconomyRank(message.guild.id, target.id);

        const targetAvatar = target.displayAvatarURL({ size: 1024, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const crown = e.gw_crown || e.crown ? `${e.gw_crown || e.crown} ` : '';

        // Kyoto Signature Balance Description
        const description = [
            `${e.leftwing || '✦'} **balance** ${e.rightwing || '✦'}`,
            '',
            `**wallet** \`$${wallet.toLocaleString()}\``,
            `**bank** \`$${bank.toLocaleString()}\` · capacity \`$${capacity.toLocaleString()}\``,
            `**total** \`$${total.toLocaleString()}\``,
            '',
            `${crown}**rank** \`#${rank}\` in the server`,
            `**earned all time** \`$${earned.toLocaleString()}\``,
            `**daily streak** \`${streak} days\``
        ].join('\n');

        const cardDetailsBtn = new ButtonBuilder()
            .setCustomId('bal_card_details')
            .setLabel('card details')
            .setStyle(ButtonStyle.Secondary);
        if (e.card) cardDetailsBtn.setEmoji(e.card);

        const topBtn = new ButtonBuilder()
            .setCustomId('bal_top')
            .setLabel('leaderboard')
            .setStyle(ButtonStyle.Secondary);
        if (e.gw_crown || e.crown) topBtn.setEmoji(e.gw_crown || e.crown);

        const dismissBtn = new ButtonBuilder()
            .setCustomId('bal_del')
            .setStyle(ButtonStyle.Secondary);
        if (e.cancel || e.deny) {
            dismissBtn.setEmoji(e.cancel || e.deny);
        } else {
            dismissBtn.setLabel('dismiss');
        }

        const row = new ActionRowBuilder().addComponents(cardDetailsBtn, topBtn, dismissBtn);

        const bannerAtt = build.getAssetAttachment('bank.png') || build.getAssetAttachment('economy.png');
        const files = bannerAtt ? [bannerAtt] : [];

        let sentMsg;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(description)
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(targetAvatar)
                );
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

            sentMsg = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(color)
                .setThumbnail(targetAvatar)
                .setDescription(description);
            if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

            sentMsg = await message.reply({
                embeds: [fallbackEmbed],
                components: [row],
                files
            }).catch(() => null);
        }

        if (!sentMsg) return;

        const col = sentMsg.createMessageComponentCollector({
            time: 30000
        });

        col.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command invoker can control this card.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'bal_del') {
                col.stop();
                return sentMsg.delete().catch(() => {});
            }

            if (i.customId === 'bal_card_details') {
                const cardData = await db.getCard(message.guild.id, target.id) || {};
                const lastFour = cardData.card_number ? cardData.card_number.slice(-4) : '••••';
                const status = cardData.is_locked ? 'frozen' : 'active';
                const tier = cardData.tier || 'standard';

                return i.reply({
                    content: `card: \`•••• •••• •••• ${lastFour}\` · status: \`${status}\` · tier: \`${tier}\` · capacity: \`$${capacity.toLocaleString()}\``,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === 'bal_top') {
                col.stop();
                return this.showLeaderboard(message, sentMsg);
            }
        });

        col.on('end', (_, reason) => {
            if (reason === 'deleted') return;
        });

        return sentMsg;
    }

    async showLeaderboard(message, existingMsg = null) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const rows = await db.getEconomyLeaderboard(message.guild.id, 10);

        if (!rows || rows.length === 0) {
            return message.reply({
                embeds: [build.warn(message.author, 'no economy accounts registered in this server yet.')]
            });
        }

        const e = config.emojis || {};
        const authorRank = await db.getEconomyRank(message.guild.id, message.author.id);
        const bannerAtt = build.getAssetAttachment('bank.png') || build.getAssetAttachment('economy.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];
        const guildIcon = message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const crown = e.gw_crown || e.crown || '<:gw_crown:1558198883883028621>';

        const lines = rows.map((r, idx) => {
            const total = (r.total || (r.wallet + r.bank)).toLocaleString();
            const wallet = (r.wallet || 0).toLocaleString();
            const bank = (r.bank || 0).toLocaleString();
            const crownBadge = idx === 0 ? `${crown} ` : '';

            return `${crownBadge}\`${idx + 1}.\` <@${r.user_id}> ─ \`$${total}\`\n` +
                   `-# wallet \`$${wallet}\` · bank \`$${bank}\``;
        });

        const content = [
            `### ${e.leftwing || '✦'} **${message.guild.name.toLowerCase()} — wealth leaderboard** ${e.rightwing || '✦'}`,
            `-# top server accounts ranked by cumulative net worth.\n`,
            lines.join('\n'),
            '',
            `-# your ranking: \`#${authorRank}\` in the server.`
        ].join('\n');

        const dismissBtn = new ButtonBuilder()
            .setCustomId('lb_del')
            .setStyle(ButtonStyle.Secondary);
        if (e.cancel || e.deny) dismissBtn.setEmoji(e.cancel || e.deny);
        else dismissBtn.setLabel('dismiss');

        const row = new ActionRowBuilder().addComponents(dismissBtn);

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
                        new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addActionRowComponents(row);

            let sent;
            if (existingMsg && typeof existingMsg.edit === 'function') {
                sent = await existingMsg.edit({
                    content: null,
                    embeds: [],
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                });
            } else {
                sent = await message.reply({
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const col = sent.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 30000
            });
            col.on('collect', async i => {
                if (i.customId === 'lb_del') {
                    col.stop();
                    return sent.delete().catch(() => {});
                }
            });
            return sent;
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || '#2b2d31')
                .setDescription(content)
                .setThumbnail(guildIcon);
            if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

            let sent;
            if (existingMsg && typeof existingMsg.edit === 'function') {
                sent = await existingMsg.edit({
                    content: null,
                    embeds: [fallbackEmbed],
                    components: [row],
                    files
                }).catch(() => null);
            } else {
                sent = await message.reply({
                    embeds: [fallbackEmbed],
                    components: [row],
                    files
                }).catch(() => null);
            }

            if (sent) {
                const col = sent.createMessageComponentCollector({
                    filter: i => i.user.id === message.author.id,
                    time: 30000
                });
                col.on('collect', async i => {
                    if (i.customId === 'lb_del') {
                        col.stop();
                        return sent.delete().catch(() => {});
                    }
                });
            }
            return sent;
        }
    }
}

module.exports = BalanceCommand;
