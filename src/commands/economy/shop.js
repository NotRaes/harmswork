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
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder,
    EmbedBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

const SHOP_ITEMS = {
    padlock: {
        id: 'padlock',
        name: 'padlock',
        price: 2500,
        description: 'one-time wallet latch. breaks to block a robbery attempt even if your debit card is unlocked.',
        type: 'passive',
        category: 'security latch'
    },
    energy_drink: {
        id: 'energy_drink',
        name: 'energy drink',
        price: 1500,
        description: 'high-voltage caffeine shot. instantly clears your work shift cooldown so you can clock in again.',
        type: 'usable',
        category: 'consumable',
        use: async (db, guildId, userId) => {
            await db.setWorkLastWork(guildId, userId, 0);
            return 'slammed an energy drink — your **work shift cooldown** has been instantly reset.';
        }
    },
    fake_id: {
        id: 'fake_id',
        name: 'fake id',
        price: 3000,
        description: 'counterfeit state identity. automatically pardons police fines when caught attempting a crime.',
        type: 'passive',
        category: 'identity forgery'
    },
    black_card: {
        id: 'black_card',
        name: 'black card',
        price: 25000,
        description: 'prestigious titanium card tier upgrade. permanently increases your debit card bank capacity to $100,000.',
        type: 'usable',
        category: 'banking upgrade',
        use: async (db, guildId, userId) => {
            await db.openCard(guildId, userId);
            await db.db.run(
                "UPDATE user_cards SET tier = 'black', bank_capacity = 100000 WHERE guild_id = ? AND user_id = ?",
                [guildId, userId]
            );
            return 'unlocked the **black card** tier. bank capacity permanently upgraded to **$100,000**.';
        }
    },
    diamond_ring: {
        id: 'diamond_ring',
        name: 'diamond ring',
        price: 15000,
        description: 'hand-cut solitaire diamond ring. propose with this to start your marriage at level 2.',
        type: 'passive',
        category: 'luxury heirloom'
    }
};

// Aliases for user convenience
SHOP_ITEMS.lock = SHOP_ITEMS.padlock;
SHOP_ITEMS.drink = SHOP_ITEMS.energy_drink;
SHOP_ITEMS.energy = SHOP_ITEMS.energy_drink;
SHOP_ITEMS.fakeid = SHOP_ITEMS.fake_id;
SHOP_ITEMS.blackcard = SHOP_ITEMS.black_card;
SHOP_ITEMS.ring = SHOP_ITEMS.diamond_ring;
SHOP_ITEMS.diamond = SHOP_ITEMS.diamond_ring;

function getShopBannerAttachment() {
    return build.getAssetAttachment('shop.png') || build.getAssetAttachment('economy.png') || build.getAssetAttachment('banner.png');
}

function getItemAttachment(itemId) {
    const filename = `${itemId}.png`;
    const candidatePaths = [
        path.resolve(__dirname, '../../structures/utils/assets/shop', filename),
        path.resolve(__dirname, '../structures/utils/assets/shop', filename),
        path.resolve(__dirname, 'assets/shop', filename)
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            try {
                return new AttachmentBuilder(fs.readFileSync(p), { name: filename });
            } catch (_) {}
        }
    }
    return null;
}

class ShopCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'shop';
        this.aliases = ['market', 'store', 'buy'];
        this.description = 'browse, inspect, and purchase utility tools and black market gear with custom graphics.';
        this.syntax = ',shop [buy <item> [amount]|use <item>|inventory]';
        this.example = ',shop | ,shop buy padlock | ,shop use energy_drink';
        this.category = 'economy';
        this.cooldown = 2;
        this.permissions = [];
        this.subcommands = [
            'shop buy <item> [amount]',
            'shop use <item>',
            'shop inventory'
        ];
        this.extraArguments = 'subcommands: buy, use, inventory.';
        this.subcommandDetails = {
            buy: {
                description: 'purchase an item from the black market.',
                syntax: ',shop buy <item> [amount]',
                example: ',shop buy padlock'
            },
            use: {
                description: 'activate a consumable item from your inventory.',
                syntax: ',shop use <item>',
                example: ',shop use energy_drink'
            },
            inventory: {
                description: 'view your purchased items and gear.',
                syntax: ',shop inventory',
                example: ',shop inventory'
            }
        };
    }

    async execute(message, args) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const isInvokedAsBuy = (message.content || '').trim().toLowerCase().startsWith(config.prefix + 'buy');
        if (isInvokedAsBuy) {
            const itemArg = args[0];
            const amountArg = args[1] || 1;
            return this.buyItem(message, itemArg, amountArg);
        }

        const sub = (args[0] || '').toLowerCase();

        if (sub === 'buy') {
            return this.buyItem(message, args[1], args[2] || 1);
        }

        if (sub === 'use') {
            return this.useItem(message, args[1]);
        }

        if (sub === 'inventory' || sub === 'inv' || sub === 'items') {
            return this.sendInventory(message);
        }

        // Unknown subcommand guard
        if (sub) {
            const valid = ['buy', 'use', 'inventory'];
            let best = null;
            let bestDist = Infinity;
            for (const v of valid) {
                const a = sub, b = v;
                const matrix = [];
                for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                for (let i = 1; i <= b.length; i++) {
                    for (let j = 1; j <= a.length; j++) {
                        if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                        else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                    }
                }
                const d = matrix[b.length][a.length];
                if (d < bestDist) { bestDist = d; best = v; }
            }

            if (best && bestDist <= 3) {
                return message.reply({
                    embeds: [build.say(message.author, `did you mean \`${config.prefix}shop ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`${config.prefix}shop [buy <item> | use <item> | inventory]\``)]
            });
        }

        return this.sendCatalogInteractive(message);
    }

    async buildCatalogPayload(message) {
        const db = message.client.db;
        const e = config.emojis || {};
        const distinctKeys = ['padlock', 'energy_drink', 'fake_id', 'black_card', 'diamond_ring'];
        const currentEco = await db.getEconomy(message.guild.id, message.author.id);

        const bannerAtt = getShopBannerAttachment();
        const files = bannerAtt ? [bannerAtt] : [];

        const container = new ContainerBuilder();
        container.setAccentColor(0x2b2d31);

        const authorAvatar = (message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : null) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const lines = distinctKeys.map((key, idx) => {
            const item = SHOP_ITEMS[key];
            const typeTag = item.type === 'usable' ? '`[usable]`' : '`[passive]`';
            return `\`${idx + 1}.\` **${item.name}** ─ \`$${item.price.toLocaleString()}\` ${typeTag}\n-# ${item.description}`;
        });

        const headerText = [
            `### ${e.leftwing || '✦'} **black market** ${e.rightwing || '✦'}`,
            `-# curated street gear, security latches & luxury assets.\n`,
            `**wallet** · \`$${(currentEco.wallet || 0).toLocaleString()}\` · **bank** · \`$${(currentEco.bank || 0).toLocaleString()}\`\n`,
            ...lines
        ].join('\n');

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
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

        const select = new StringSelectMenuBuilder()
            .setCustomId('shop_select_item')
            .setPlaceholder('inspect item dossier or purchase...')
            .addOptions(
                distinctKeys.map(k => {
                    const it = SHOP_ITEMS[k];
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(it.name)
                        .setValue(`item_${it.id}`)
                        .setDescription(`$${it.price.toLocaleString()} • ${it.category}`);
                })
            );

        const selectRow = new ActionRowBuilder().addComponents(select);
        container.addActionRowComponents(selectRow);

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_view_inventory')
                .setLabel('my inventory')
                .setEmoji(e.card || '<a:card:1555845967381528586>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('shop_dismiss')
                .setEmoji(e.cancel || e.deny || '<:harm_deny:1558811268608167939>')
                .setStyle(ButtonStyle.Secondary)
        );
        container.addActionRowComponents(buttonRow);

        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || 0x2b2d31)
            .setAuthor({ name: `${message.author.username} • black market`, iconURL: authorAvatar })
            .setDescription(headerText);
        if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

        return { container, fallbackEmbed, rows: [selectRow, buttonRow], files };
    }

    async buildItemDossierPayload(message, itemId) {
        const item = SHOP_ITEMS[itemId];
        if (!item) return this.buildCatalogPayload(message);

        const db = message.client.db;
        const currentEco = await db.getEconomy(message.guild.id, message.author.id);
        const owned = await db.getItem(message.guild.id, message.author.id, item.id);

        const bannerAtt = getShopBannerAttachment();
        const itemAtt = getItemAttachment(item.id);
        const files = [];
        if (bannerAtt) files.push(bannerAtt);
        if (itemAtt) files.push(itemAtt);

        const container = new ContainerBuilder();
        container.setAccentColor(0x2b2d31);

        const maxAffordable = Math.floor((currentEco.wallet || 0) / item.price);
        const canAffordOne = (currentEco.wallet || 0) >= item.price;
        const canUse = item.type === 'usable' && owned > 0;

        const dossierText = [
            `### ${item.name}`,
            `-# classification: **${item.category}** · protocol: \`${item.type}\`\n`,
            `**price** · \`$${item.price.toLocaleString()}\``,
            `**inventory** · \`${owned}\` currently owned`,
            `**liquidity** · \`$${(currentEco.wallet || 0).toLocaleString()}\` available in wallet\n`,
            `-# **functional effect:**`,
            `-# ${item.description}`
        ].join('\n');

        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(dossierText)
        );

        if (itemAtt) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(`attachment://${itemAtt.name}`));
        }
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

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`shop_buy_1_${item.id}`)
                .setLabel(`buy 1 ($${item.price.toLocaleString()})`)
                .setStyle(canAffordOne ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(!canAffordOne),
            new ButtonBuilder()
                .setCustomId(`shop_buy_max_${item.id}`)
                .setLabel(`buy max (${maxAffordable})`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(maxAffordable <= 1),
            new ButtonBuilder()
                .setCustomId(`shop_use_${item.id}`)
                .setLabel('use item')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!canUse),
            new ButtonBuilder()
                .setCustomId('shop_back_catalog')
                .setLabel('back to shop')
                .setStyle(ButtonStyle.Secondary)
        );
        container.addActionRowComponents(buttonRow);

        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || 0x2b2d31)
            .setDescription(dossierText);
        if (itemAtt) fallbackEmbed.setThumbnail(`attachment://${itemAtt.name}`);
        if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

        return { container, fallbackEmbed, rows: [buttonRow], files };
    }

    async buildInventoryPayload(message) {
        const db = message.client.db;
        const e = config.emojis || {};
        const currentEco = await db.getEconomy(message.guild.id, message.author.id);
        const items = await db.getInventory(message.guild.id, message.author.id);

        const bannerAtt = getShopBannerAttachment();
        const files = bannerAtt ? [bannerAtt] : [];

        const container = new ContainerBuilder();
        container.setAccentColor(0x2b2d31);

        const authorAvatar = (message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : null) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const invLines = (!items || items.length === 0)
            ? ['-# *your inventory is currently empty. browse available gear in the black market.*']
            : items.map(i => {
                const it = SHOP_ITEMS[i.item_id] || { name: i.item_id.replace(/_/g, ' '), description: 'stored asset' };
                return `• **${it.name}** \`x${i.amount}\`\n-# ${it.description}`;
            });

        const bodyText = [
            `### ${e.leftwing || '✦'} **inventory — ${message.author.username.toLowerCase()}** ${e.rightwing || '✦'}`,
            `-# active tools, passive latches and stored tactical assets.\n`,
            `**wallet** · \`$${(currentEco.wallet || 0).toLocaleString()}\` · **bank** · \`$${(currentEco.bank || 0).toLocaleString()}\`\n`,
            ...invLines
        ].join('\n');

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText))
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

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_back_catalog')
                .setLabel('back to shop')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('shop_dismiss')
                .setEmoji(e.cancel || e.deny || '<:harm_deny:1558811268608167939>')
                .setStyle(ButtonStyle.Secondary)
        );
        container.addActionRowComponents(row);

        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || 0x2b2d31)
            .setThumbnail(authorAvatar)
            .setDescription(bodyText);
        if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

        return { container, fallbackEmbed, rows: [row], files };
    }

    async sendCatalogInteractive(message) {
        let currentPayload = await this.buildCatalogPayload(message);

        let sentMsg;
        try {
            sentMsg = await message.reply({
                components: [currentPayload.container],
                files: currentPayload.files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch {
            sentMsg = await message.reply({
                embeds: [currentPayload.fallbackEmbed],
                components: currentPayload.rows,
                files: currentPayload.files
            }).catch(() => null);
        }

        if (!sentMsg) return;

        const collector = sentMsg.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command author can control this black market menu.',
                    ephemeral: true
                }).catch(() => {});
            }

            if (i.customId === 'shop_dismiss') {
                collector.stop();
                return sentMsg.delete().catch(() => {});
            }

            if (i.customId === 'shop_back_catalog') {
                currentPayload = await this.buildCatalogPayload(message);
                return await i.update({
                    components: [currentPayload.container],
                    files: currentPayload.files,
                    flags: MessageFlags.IsComponentsV2
                }).catch(async () => {
                    await i.update({ embeds: [currentPayload.fallbackEmbed], components: currentPayload.rows, files: currentPayload.files }).catch(() => {});
                });
            }

            if (i.customId === 'shop_view_inventory') {
                currentPayload = await this.buildInventoryPayload(message);
                return await i.update({
                    components: [currentPayload.container],
                    files: currentPayload.files,
                    flags: MessageFlags.IsComponentsV2
                }).catch(async () => {
                    await i.update({ embeds: [currentPayload.fallbackEmbed], components: currentPayload.rows, files: currentPayload.files }).catch(() => {});
                });
            }

            if (i.customId === 'shop_select_item') {
                const selectedVal = i.values[0];
                const cleanId = selectedVal.replace('item_', '');
                currentPayload = await this.buildItemDossierPayload(message, cleanId);
                return await i.update({
                    components: [currentPayload.container],
                    files: currentPayload.files,
                    flags: MessageFlags.IsComponentsV2
                }).catch(async () => {
                    await i.update({ embeds: [currentPayload.fallbackEmbed], components: currentPayload.rows, files: currentPayload.files }).catch(() => {});
                });
            }

            if (i.customId.startsWith('shop_buy_1_')) {
                const itemId = i.customId.replace('shop_buy_1_', '');
                const item = SHOP_ITEMS[itemId];
                if (!item) return;

                const db = message.client.db;
                const eco = await db.getEconomy(message.guild.id, message.author.id);
                if (eco.wallet < item.price) {
                    return i.reply({ content: `insufficient funds: you need $${item.price.toLocaleString()} in wallet cash.`, ephemeral: true });
                }

                await db.addWallet(message.guild.id, message.author.id, -item.price);
                await db.addItem(message.guild.id, message.author.id, item.id, 1);
                if (db.recordTransaction) {
                    await db.recordTransaction(message.guild.id, message.author.id, 'shop_buy', item.price, `purchased 1x ${item.name}`).catch(() => {});
                }

                currentPayload = await this.buildItemDossierPayload(message, item.id);
                return await i.update({
                    components: [currentPayload.container],
                    files: currentPayload.files,
                    flags: MessageFlags.IsComponentsV2
                }).catch(async () => {
                    await i.update({ embeds: [currentPayload.fallbackEmbed], components: currentPayload.rows, files: currentPayload.files }).catch(() => {});
                });
            }

            if (i.customId.startsWith('shop_buy_max_')) {
                const itemId = i.customId.replace('shop_buy_max_', '');
                const item = SHOP_ITEMS[itemId];
                if (!item) return;

                const db = message.client.db;
                const eco = await db.getEconomy(message.guild.id, message.author.id);
                const maxCount = Math.floor(eco.wallet / item.price);
                if (maxCount <= 0) {
                    return i.reply({ content: `insufficient funds: you cannot afford any ${item.name}.`, ephemeral: true });
                }

                const totalCost = maxCount * item.price;
                await db.addWallet(message.guild.id, message.author.id, -totalCost);
                await db.addItem(message.guild.id, message.author.id, item.id, maxCount);
                if (db.recordTransaction) {
                    await db.recordTransaction(message.guild.id, message.author.id, 'shop_buy', totalCost, `purchased ${maxCount}x ${item.name}`).catch(() => {});
                }

                currentPayload = await this.buildItemDossierPayload(message, item.id);
                return await i.update({
                    components: [currentPayload.container],
                    files: currentPayload.files,
                    flags: MessageFlags.IsComponentsV2
                }).catch(async () => {
                    await i.update({ embeds: [currentPayload.fallbackEmbed], components: currentPayload.rows, files: currentPayload.files }).catch(() => {});
                });
            }

            if (i.customId.startsWith('shop_use_')) {
                const itemId = i.customId.replace('shop_use_', '');
                const item = SHOP_ITEMS[itemId];
                if (!item || item.type !== 'usable' || !item.use) return;

                const db = message.client.db;
                const owned = await db.getItem(message.guild.id, message.author.id, item.id);
                if (owned <= 0) {
                    return i.reply({ content: `you do not possess any ${item.name}.`, ephemeral: true });
                }

                await db.removeItem(message.guild.id, message.author.id, item.id, 1);
                const resultText = await item.use(db, message.guild.id, message.author.id);

                await i.reply({ content: resultText, ephemeral: true });

                currentPayload = await this.buildItemDossierPayload(message, item.id);
                return await i.message.edit({
                    components: [currentPayload.container],
                    files: currentPayload.files,
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => {});
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'deleted') return;
            try {
                const disabledRows = currentPayload.rows.map(r => {
                    const d = ActionRowBuilder.from(r);
                    d.components.forEach(c => {
                        if (c.data.style !== ButtonStyle.Link) c.setDisabled(true);
                    });
                    return d;
                });
                if (sentMsg.flags?.has(MessageFlags.IsComponentsV2)) {
                    currentPayload.container.components[currentPayload.container.components.length - 1] = disabledRows[disabledRows.length - 1];
                    await sentMsg.edit({ components: [currentPayload.container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                } else {
                    await sentMsg.edit({ embeds: [currentPayload.fallbackEmbed], components: disabledRows, skipV2: true }).catch(() => {});
                }
            } catch {}
        });
    }

    async buyItem(message, itemArg, amountArg) {
        if (!itemArg) {
            return message.reply({
                embeds: [build.warn(message.author, `specify the item to purchase. syntax: \`${config.prefix}shop buy <item> [amount]\``)]
            });
        }

        const cleanKey = itemArg.toLowerCase().replace(/[\s-]/g, '_');
        const item = SHOP_ITEMS[cleanKey];
        if (!item) {
            return message.reply({
                embeds: [build.warn(message.author, `unknown item \`${itemArg}\`. check \`${config.prefix}shop\`.`)]
            });
        }

        const count = Math.max(1, parseInt(amountArg, 10) || 1);
        const totalCost = item.price * count;

        const db = message.client.db;
        const eco = await db.getEconomy(message.guild.id, message.author.id);

        if (eco.wallet < totalCost) {
            return message.reply({
                embeds: [build.deny(message.author, `insufficient wallet cash. purchasing \`${count}x ${item.name}\` requires **$${totalCost.toLocaleString()}** (you have **$${eco.wallet.toLocaleString()}**).`)]
            });
        }

        await db.addWallet(message.guild.id, message.author.id, -totalCost);
        await db.addItem(message.guild.id, message.author.id, item.id, count);
        if (db.recordTransaction) {
            await db.recordTransaction(message.guild.id, message.author.id, 'shop_buy', totalCost, `purchased ${count}x ${item.name}`).catch(() => {});
        }

        return message.reply({
            embeds: [build.approved(message.author, `purchased **${count}x ${item.name}** for **$${totalCost.toLocaleString()}**. check \`${config.prefix}shop inventory\`.`)]
        });
    }

    async useItem(message, itemArg) {
        if (!itemArg) {
            return message.reply({
                embeds: [build.warn(message.author, `specify the item to use. syntax: \`${config.prefix}shop use <item>\``)]
            });
        }

        const cleanKey = itemArg.toLowerCase().replace(/[\s-]/g, '_');
        const item = SHOP_ITEMS[cleanKey];
        if (!item) {
            return message.reply({
                embeds: [build.warn(message.author, `unknown item \`${itemArg}\`. check \`${config.prefix}shop\`.`)]
            });
        }

        if (item.type !== 'usable' || !item.use) {
            return message.reply({
                embeds: [build.warn(message.author, `**${item.name}** is a passive protection item and activates automatically when needed.`)]
            });
        }

        const db = message.client.db;
        const owned = await db.getItem(message.guild.id, message.author.id, item.id);
        if (owned <= 0) {
            return message.reply({
                embeds: [build.deny(message.author, `you do not have any **${item.name}** in your inventory.`)]
            });
        }

        await db.removeItem(message.guild.id, message.author.id, item.id, 1);
        const resultText = await item.use(db, message.guild.id, message.author.id);

        return message.reply({
            embeds: [build.approved(message.author, resultText)]
        });
    }

    async sendInventory(message) {
        const payload = await this.buildInventoryPayload(message);
        try {
            return await message.reply({
                components: [payload.container],
                files: payload.files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch {
            return await message.reply({
                embeds: [payload.fallbackEmbed],
                components: payload.rows,
                files: payload.files
            }).catch(() => {});
        }
    }
}

module.exports = ShopCommand;
