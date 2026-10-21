const {
    ChannelType,
    PermissionFlagsBits,
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
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const CounterWorker = require('../../structures/utils/workers/counterworker.js');

const VALID_TYPES = ['members', 'humans', 'bots', 'boosts', 'roles', 'channels', 'online'];

class CounterCommand {
    constructor() {
        this.name = 'counter';
        this.aliases = ['counters', 'statcounter', 'serverstats'];
        this.description = 'configure live server statistic counter channels in your server sidebar.';
        this.syntax = ',counter [create <type> [format] | delete <#channel> | reset | update | list]';
        this.example = ',counter create members members: {count}\n,counter reset';
        this.category = 'utility';
        this.permissions = ['ManageChannels'];
        this.cooldown = 3;
        this.subcommands = [
            'counter create <type> [format]',
            'counter delete <#channel>',
            'counter reset',
            'counter update',
            'counter list'
        ];
        this.subcommandDetails = {
            create: {
                description: 'create a live counter channel for a server statistic.',
                syntax: ',counter create <type> [format]',
                example: ',counter create members members: {count}'
            },
            delete: {
                description: 'remove a specific counter channel from the server.',
                syntax: ',counter delete <#channel>',
                example: ',counter delete #members-120'
            },
            reset: {
                description: 'delete and wipe all configured counter channels from the server.',
                syntax: ',counter reset',
                example: ',counter reset'
            },
            update: {
                description: 'synchronize all counter channels with real-time stats immediately.',
                syntax: ',counter update',
                example: ',counter update'
            },
            list: {
                description: 'view all active counter channels in this server.',
                syntax: ',counter list',
                example: ',counter list'
            }
        };
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply({ embeds: [build.warn(message.author, 'counters can only be configured in servers.')] });
        }

        const isOwner = config.owners?.includes(message.author.id);
        const hasPerms = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageChannels);
        if (!hasPerms) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the manage channels permission to configure counters.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'harm requires `manage_channels` permission to manage counter channels.')] });
        }

        const db = message.client.db;
        const p = (db?.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
        const sub = (args?.[0] || '').toLowerCase();

        // ──────────────────────── 1. CREATE COUNTER ────────────────────────
        if (sub === 'create' || sub === 'add' || sub === 'new') {
            const type = (args[1] || '').toLowerCase();
            if (!VALID_TYPES.includes(type)) {
                return message.reply({
                    embeds: [build.warn(message.author, `invalid counter type \`${type || 'none'}\`.\n-# available types: \`${VALID_TYPES.join('`, `')}\`\n-# syntax: \`${p}counter create <type> [format]\``)]
                });
            }

            const rawFormat = args.slice(2).join(' ').trim();
            const formatStr = rawFormat || `${type}: {count}`;

            const initialCount = CounterWorker.getCountForType(message.guild, type);
            const channelName = CounterWorker.formatChannelName(formatStr, initialCount);

            try {
                const channel = await message.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    permissionOverwrites: [
                        {
                            id: message.guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.Connect]
                        },
                        {
                            id: botMember.id,
                            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel]
                        }
                    ],
                    reason: `${message.author.tag} (${message.author.id}): created ${type} counter`
                });

                await db.addGuildCounter(message.guild.id, channel.id, type, formatStr);

                return message.reply({
                    embeds: [build.approved(message.author, `created locked counter channel <#${channel.id}> for **${type}**.\n-# live format: \`${formatStr}\` · updates automatically on changes.`)]
                });
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to create counter channel: ${err.message}`)] });
            }
        }

        // ──────────────────────── 2. DELETE COUNTER ────────────────────────
        if (sub === 'delete' || sub === 'remove' || sub === 'rm') {
            const targetChannel = message.mentions.channels.first()
                || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ''));

            if (!targetChannel) {
                return message.reply({ embeds: [build.warn(message.author, `specify the channel to delete. syntax: \`${p}counter delete <#channel>\``)] });
            }

            await db.removeGuildCounter(targetChannel.id);
            try {
                await targetChannel.delete('automated harm counter deletion');
            } catch (_) {}

            return message.reply({
                embeds: [build.approved(message.author, `removed counter channel **${targetChannel.name}**.`)]
            });
        }

        // ──────────────────────── 3. RESET COUNTERS ────────────────────────
        if (sub === 'reset' || sub === 'clear') {
            const counters = await db.getGuildCounters(message.guild.id);
            if (!counters || counters.length === 0) {
                return message.reply({
                    embeds: [build.warn(message.author, 'no counter channels are configured in this server.')]
                });
            }

            let removedCount = 0;
            for (const c of counters) {
                try {
                    const channel = message.guild.channels.cache.get(c.channel_id) || await message.guild.channels.fetch(c.channel_id).catch(() => null);
                    if (channel) {
                        await channel.delete('automated harm counter reset').catch(() => {});
                        removedCount++;
                    }
                } catch (_) {}
                await db.removeGuildCounter(c.channel_id);
            }

            return message.reply({
                embeds: [build.approved(message.author, `reset and removed **${counters.length}** counter channel(s) from this server.`)]
            });
        }

        // ──────────────────────── 4. UPDATE / SYNC ────────────────────────
        if (sub === 'update' || sub === 'sync' || sub === 'refresh') {
            await CounterWorker.updateGuildCounters(message.guild, db);
            return message.reply({
                embeds: [build.approved(message.author, 'synchronized all counter channels with real-time server statistics.')]
            });
        }

        // ──────────────────────── 5. LIST COUNTERS ────────────────────────
        if (sub === 'list' || sub === 'all' || sub === 'show') {
            const counters = await db.getGuildCounters(message.guild.id);
            if (!counters || counters.length === 0) {
                return message.reply({
                    embeds: [build.warn(message.author, `no counter channels configured in this server.\n-# run \`${p}counter create members\` to add one.`)]
                });
            }

            const lines = counters.map((c, idx) => {
                const count = CounterWorker.getCountForType(message.guild, c.counter_type);
                return `\`${idx + 1}.\` <#${c.channel_id}> ─ **${c.counter_type}** (\`${count.toLocaleString()}\`)\n-# format: \`${c.channel_name_format}\``;
            });

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### [active server counters (${counters.length})](https://discord.gg/hCQhTmPf2G)\n\n` +
                    lines.join('\n\n') +
                    `\n\n-# use \`${p}counter delete <#channel>\` or \`${p}counter reset\` to remove.`
                );

            return message.reply({ embeds: [embed] });
        }

        // Unknown subcommand check
        if (sub) {
            const valid = ['create', 'delete', 'reset', 'update', 'list'];
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
                    embeds: [build.say(message.author, `did you mean \`${p}counter ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`${p}counter [create|delete|reset|update|list]\``)]
            });
        }

        // ──────────────────────── 6. DEFAULT OVERVIEW HUB ────────────────────────
        const counters = await db.getGuildCounters(message.guild.id);
        const bannerAtt = build.getAssetAttachment('utility.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];
        const guildIcon = message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        let counterListText = '';
        if (counters && counters.length > 0) {
            const activeLines = counters.slice(0, 6).map((c, idx) => {
                const count = CounterWorker.getCountForType(message.guild, c.counter_type);
                return `-# • <#${c.channel_id}> ─ **${c.counter_type}** (\`${count.toLocaleString()}\`)`;
            });
            counterListText = `\n\n-# **configured counters (${counters.length}):**\n` + activeLines.join('\n');
        }

        const overviewText =
            `### [server counters](https://discord.gg/hCQhTmPf2G)\n` +
            `-# locked voice channels that track real-time server metrics in your sidebar.\n\n` +
            `-# **subcommands:**\n` +
            `-# \`${p}counter create <type> [format]\` — create a new locked counter\n` +
            `-# \`${p}counter delete <#channel>\` — remove a specific counter channel\n` +
            `-# \`${p}counter reset\` — delete and wipe all counters in this server\n` +
            `-# \`${p}counter update\` — force sync statistics immediately\n` +
            `-# \`${p}counter list\` — view all configured counter channels\n\n` +
            `-# **types:** \`members\`, \`humans\`, \`bots\`, \`boosts\`, \`roles\`, \`channels\`, \`online\`` +
            counterListText;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter_sync_${message.author.id}`)
                .setLabel('sync stats')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(config.emojis?.harm_reset || config.emojis?.refresh || '<:harm_reset:1560309029207679008>'),
            new ButtonBuilder()
                .setCustomId(`counter_reset_${message.author.id}`)
                .setLabel('reset all')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(config.emojis?.deletevc || config.emojis?.trash || '<:deletevc:1558818747769159680>')
        );

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(overviewText))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
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

            const replyMsg = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });

            const collector = replyMsg.createMessageComponentCollector({ time: 60000 });
            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: 'only the command author can control this menu.', ephemeral: true }).catch(() => {});
                }

                if (i.customId.startsWith('counter_sync_')) {
                    await i.deferUpdate().catch(() => {});
                    await CounterWorker.updateGuildCounters(message.guild, db);
                    return message.channel.send({
                        embeds: [build.approved(message.author, 'synchronized all counter channels with real-time server statistics.')]
                    }).catch(() => {});
                }

                if (i.customId.startsWith('counter_reset_')) {
                    const live = await db.getGuildCounters(message.guild.id);
                    if (!live || live.length === 0) {
                        return i.reply({ content: 'no counter channels configured to reset.', ephemeral: true }).catch(() => {});
                    }
                    await i.deferUpdate().catch(() => {});
                    for (const c of live) {
                        try {
                            const ch = message.guild.channels.cache.get(c.channel_id) || await message.guild.channels.fetch(c.channel_id).catch(() => null);
                            if (ch) await ch.delete('harm counter reset').catch(() => {});
                        } catch (_) {}
                        await db.removeGuildCounter(c.channel_id);
                    }
                    return message.channel.send({
                        embeds: [build.approved(message.author, `reset and removed **${live.length}** counter channel(s).`)]
                    }).catch(() => {});
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'deleted') return;
                try {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
                    );
                    container.components[container.components.length - 1] = disabledRow;
                    if (replyMsg.editable) {
                        await replyMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(async () => {
                            const fallback = new EmbedBuilder()
                                .setColor(config.colors.c || 0x0A0A0C)
                                .setThumbnail(guildIcon)
                                .setDescription(overviewText);
                            if (bannerAtt) fallback.setImage(`attachment://${bannerAtt.name}`);
                            await replyMsg.edit({ embeds: [fallback], components: [disabledRow], skipV2: true }).catch(() => {});
                        });
                    }
                } catch (_) {}
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(guildIcon)
                .setDescription(overviewText);
            if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);
            return await message.reply({ embeds: [fallbackEmbed], components: [row], files });
        }
    }
}

module.exports = CounterCommand;
