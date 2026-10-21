const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const EmbedParser = require('../../structures/utils/helpers/embedparser.js');

function resolveChannel(guild, query) {
    if (!query) return null;
    const clean = query.trim();
    const mentionMatch = clean.match(/^<#(\d{17,20})>$/);
    if (mentionMatch) return guild.channels.cache.get(mentionMatch[1]) || null;
    if (/^\d{17,20}$/.test(clean)) return guild.channels.cache.get(clean) || null;
    const lower = clean.toLowerCase();
    const exact = guild.channels.cache.find(c => c.name.toLowerCase() === lower);
    if (exact) return exact;
    const starts = guild.channels.cache.find(c => c.name.toLowerCase().startsWith(lower));
    if (starts) return starts;
    return guild.channels.cache.find(c => c.name.toLowerCase().includes(lower)) || null;
}

function parseDuration(input) {
    if (!input) return 0; // default to 0s (ghost ping)
    const str = input.toLowerCase().trim();
    if (['0', '0s', 'instant', 'ghost', 'fast'].includes(str)) return 0;
    if (['none', 'off', 'never', 'disable', 'null', 'permanent', 'inf'].includes(str)) return null;

    const match = str.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/i);
    if (!match) return undefined;

    const num = parseFloat(match[1]);
    const unit = (match[2] || 's').toLowerCase();

    if (unit.startsWith('s')) return Math.round(num);
    if (unit.startsWith('m')) return Math.round(num * 60);
    if (unit.startsWith('h')) return Math.round(num * 3600);
    if (unit.startsWith('d')) return Math.round(num * 86400);

    return Math.round(num);
}

function formatDuration(seconds) {
    if (seconds === 0) return 'instant (ghost-ping)';
    if (seconds === null || seconds === undefined) return 'never (permanent)';
    if (seconds >= 3600) {
        const hrs = Math.floor(seconds / 3600);
        const rem = seconds % 3600;
        return rem === 0 ? `${hrs}h` : `${hrs}h ${Math.floor(rem / 60)}m`;
    }
    if (seconds >= 60) {
        const mins = Math.floor(seconds / 60);
        const rem = seconds % 60;
        return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
    }
    return `${seconds}s`;
}

function buildDashboardPayload(guild, db) {
    const pings = db.getOnjoinPings(guild.id);
    const pingSettings = db.getOnjoinPingSettings(guild.id);
    const dmConfig = db.getOnjoinDM(guild.id);
    const welcomeConfig = db.getOnjoinWelcome(guild.id);
    const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

    // 1. Pings Display
    let pingsDisplay = '-# **channels:** none (`add with ,onjoin ping add #channel [time]`)';
    if (pings && pings.length > 0) {
        const lines = pings.map(p => {
            const ch = guild.channels.cache.get(p.channel_id);
            const chStr = ch ? `<#${ch.id}>` : `\`#deleted-channel\``;
            return `-# • ${chStr} ─ \`${formatDuration(p.delete_after)}\``;
        });
        pingsDisplay = lines.join('\n');
    }

    const pingDmLabel = pingSettings.dm_enabled
        ? (pingSettings.dm_message ? '`custom embed`' : '`harm style welcomedm`')
        : '`disabled`';

    // 2. Channel Welcome Message Display
    const welcomeChannel = welcomeConfig.channel_id ? `<#${welcomeConfig.channel_id}>` : '`not set`';
    const welcomeStateStr = welcomeConfig.enabled ? '`enabled`' : '`disabled`';
    const welcomeSnippet = welcomeConfig.message
        ? `\`\`\`${welcomeConfig.message.length > 120 ? welcomeConfig.message.slice(0, 117) + '...' : welcomeConfig.message}\`\`\``
        : '-# *no message configured. set with `,onjoin message text <embed/text>`*';

    // 3. DM Display
    const dmStateStr = dmConfig.enabled ? '`enabled`' : '`disabled`';
    const dmSnippet = dmConfig.message
        ? `\`\`\`${dmConfig.message.length > 120 ? dmConfig.message.slice(0, 117) + '...' : dmConfig.message}\`\`\``
        : '-# *no message configured. set with `,onjoin dm message <embed/text>`*';

    const textContent =
        `### [on-join pings](${supportUrl}) (${pings.length} channels)\n` +
        `-# **dm notification:** ${pingDmLabel}\n` +
        `${pingsDisplay}\n\n` +
        `### welcome message: ${welcomeStateStr} • ${welcomeChannel}\n` +
        `${welcomeSnippet}\n\n` +
        `### on-join dm: ${dmStateStr}\n` +
        `${dmSnippet}\n` +
        `-# **compatibility:** supports copied \`,embed\` json, \`{embed:name}\` references, or text.`;

    const bannerAttachment = build.getAssetAttachment('utility.png') || build.getAssetAttachment('banner.png');
    const files = bannerAttachment ? [bannerAttachment] : [];

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(textContent));

    if (guild.iconURL()) {
        section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guild.iconURL({ size: 1024, dynamic: true })));
    }

    const container = new ContainerBuilder()
        .addSectionComponents(section);

    if (bannerAttachment) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachment.name}`)
            )
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small)
    );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('onjoin:toggle_ping_dm')
            .setLabel(pingSettings.dm_enabled ? 'disable ping dm' : 'enable ping dm')
            .setStyle(pingSettings.dm_enabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('onjoin:toggle_welcome')
            .setLabel(welcomeConfig.enabled ? 'disable welcome' : 'enable welcome')
            .setStyle(welcomeConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('onjoin:toggle_dm')
            .setLabel(dmConfig.enabled ? 'disable dm' : 'enable dm')
            .setStyle(dmConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('onjoin:refresh')
            .setLabel('refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    container.addActionRowComponents(row);

    const fallbackEmbed = new EmbedBuilder()
        .setColor(config.colors.c || '#0A0A0C')
        .setDescription(textContent);
    if (bannerAttachment) fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);

    return {
        componentsV2: { components: [container], files, flags: MessageFlags.IsComponentsV2 },
        embedFallback: { embeds: [fallbackEmbed], components: [row], files }
    };
}

class OnJoinCommand {
    constructor() {
        this.name = 'onjoin';
        this.aliases = ['join', 'autoping', 'pings'];
        this.description = 'configure automated join pings with deletion timers, harm-style welcomedm notifications, and custom messages compatible with the embed builder.';
        this.syntax = ',onjoin\n,autoping <add|remove|list|clear> [channel] [time]\n,onjoin ping <add|remove|list|clear|dm> [arguments]\n,onjoin dm <message|toggle|test|view> [arguments]\n,onjoin message <channel|text|toggle|test|view> [arguments]';
        this.example = ',onjoin ping add #chat 0s\n,onjoin ping dm message {embed:welcome}\n,onjoin ping dm test\n,onjoin message text {"title":"welcome {user}!","color":"#0A0A0C"}';
        this.category = 'utility';
        this.cooldown = 2;
        this.subcommands = [
            'onjoin ping add <#channel> [delete_time]',
            'onjoin ping remove <#channel>',
            'onjoin ping list',
            'onjoin ping clear',
            'onjoin ping dm message <embed_or_text>',
            'onjoin ping dm toggle',
            'onjoin ping dm test',
            'onjoin ping dm view',
            'onjoin dm message <embed_or_text>',
            'onjoin dm toggle',
            'onjoin dm test',
            'onjoin dm view',
            'onjoin message channel <#channel>',
            'onjoin message text <embed_or_text>',
            'onjoin message toggle',
            'onjoin message test',
            'onjoin message view'
        ];
        this.subcommandDetails = {
            overview: {
                description: 'view the interactive on-join dashboard.',
                syntax: ',onjoin',
                example: ',onjoin'
            },
            'ping add': {
                description: 'ping new members in a channel with an optional deletion timer.',
                syntax: ',onjoin ping add <#channel> [delete_time]',
                example: ',onjoin ping add #chat 0s'
            },
            'ping remove': {
                description: 'stop pinging new members in a channel.',
                syntax: ',onjoin ping remove <#channel>',
                example: ',onjoin ping remove #chat'
            },
            'ping list': {
                description: 'view all active join ping channels and their deletion times.',
                syntax: ',onjoin ping list',
                example: ',onjoin ping list'
            },
            'ping clear': {
                description: 'remove all join ping channels.',
                syntax: ',onjoin ping clear',
                example: ',onjoin ping clear'
            },
            'ping dm message': {
                description: 'set the embed or message sent to the user when pinged (accepts copied ,embed json, {embed:name}, or reset for harm style).',
                syntax: ',onjoin ping dm message <embed_or_text>',
                example: ',onjoin ping dm message {embed:welcome}'
            },
            'ping dm toggle': {
                description: 'enable or disable the direct message notification when members are pinged.',
                syntax: ',onjoin ping dm toggle',
                example: ',onjoin ping dm toggle'
            },
            'ping dm test': {
                description: 'send a live test of the harm-style onjoin ping dm to yourself.',
                syntax: ',onjoin ping dm test',
                example: ',onjoin ping dm test'
            },
            'ping dm view': {
                description: 'preview the on-join ping dm notification template and status.',
                syntax: ',onjoin ping dm view',
                example: ',onjoin ping dm view'
            },
            'dm message': {
                description: 'set the direct message sent on join (accepts copied ,embed json, {embed:name}, or text).',
                syntax: ',onjoin dm message <embed_or_text>',
                example: ',onjoin dm message {embed:welcome}'
            },
            'dm toggle': {
                description: 'enable or disable on-join direct messages.',
                syntax: ',onjoin dm toggle',
                example: ',onjoin dm toggle'
            },
            'dm test': {
                description: 'send a test of the on-join dm to yourself.',
                syntax: ',onjoin dm test',
                example: ',onjoin dm test'
            },
            'dm view': {
                description: 'preview the current on-join dm template and status.',
                syntax: ',onjoin dm view',
                example: ',onjoin dm view'
            },
            'message channel': {
                description: 'set the channel where welcome messages are sent.',
                syntax: ',onjoin message channel <#channel>',
                example: ',onjoin message channel #welcome'
            },
            'message text': {
                description: 'set the welcome message (accepts copied ,embed json, {embed:name}, tags, or text).',
                syntax: ',onjoin message text <embed_or_text>',
                example: ',onjoin message text {embed:welcome}'
            },
            'message toggle': {
                description: 'enable or disable channel welcome messages.',
                syntax: ',onjoin message toggle',
                example: ',onjoin message toggle'
            },
            'message test': {
                description: 'preview the welcome message in the current channel.',
                syntax: ',onjoin message test',
                example: ',onjoin message test'
            },
            'message view': {
                description: 'preview the current welcome message template and settings.',
                syntax: ',onjoin message view',
                example: ',onjoin message view'
            }
        };
    }

    async execute(message, args, commandName) {
        if (!message.guild) {
            return message.reply(build.warnBox('servers only', 'onjoin can only be configured in servers.'));
        }

        const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
        const hasPerms = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
        if (!hasPerms) {
            return message.reply({ embeds: [build.deny(message.author, 'you need manage server permissions to configure on-join settings.')] });
        }

        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database subsystem is currently offline.')] });
        }

        let effectiveArgs = [...(args || [])];
        if (commandName && ['autoping', 'pings'].includes(commandName.toLowerCase())) {
            if (effectiveArgs.length === 0) {
                effectiveArgs = ['ping', 'list'];
            } else if (effectiveArgs[0].toLowerCase() !== 'ping') {
                effectiveArgs = ['ping', ...effectiveArgs];
            }
        }
        args = effectiveArgs;

        const sub = (args[0] || '').toLowerCase();

        // ──────────────────────── 1. DASHBOARD / OVERVIEW ────────────────────────
        if (!sub || ['overview', 'dashboard', 'config', 'show'].includes(sub)) {
            const payload = buildDashboardPayload(message.guild, db);
            const sentMsg = await message.reply(payload.embedFallback).catch(() => null);

            if (!sentMsg) return;

            const collector = sentMsg.createMessageComponentCollector({
                time: 60_000
            });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({
                        content: 'only the command author can control this menu.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                if (i.customId === 'onjoin:toggle_ping_dm') {
                    await db.toggleOnjoinPingDM(message.guild.id);
                } else if (i.customId === 'onjoin:toggle_dm') {
                    await db.toggleOnjoinDM(message.guild.id);
                } else if (i.customId === 'onjoin:toggle_welcome') {
                    await db.toggleOnjoinWelcome(message.guild.id);
                }

                const updated = buildDashboardPayload(message.guild, db);
                await i.update(updated.embedFallback).catch(() => {});
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'deleted') return;
            });

            return;
        }

        // ──────────────────────── 2. PING SUBCOMMANDS ────────────────────────
        if (sub === 'ping' || sub === 'pings' || sub === 'autoping') {
            const action = (args[1] || '').toLowerCase();

            // ,onjoin ping setup / dashboard
            if (action === 'setup' || action === 'dashboard' || action === 'config') {
                const payload = buildDashboardPayload(message.guild, db);
                const sentMsg = await message.reply(payload.embedFallback).catch(() => null);
                if (!sentMsg) return;

                const collector = sentMsg.createMessageComponentCollector({
                    time: 60_000
                });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({
                            content: 'only the command author can control this menu.',
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }

                    if (i.customId === 'onjoin:toggle_ping_dm') {
                        await db.toggleOnjoinPingDM(message.guild.id);
                    } else if (i.customId === 'onjoin:toggle_dm') {
                        await db.toggleOnjoinDM(message.guild.id);
                    } else if (i.customId === 'onjoin:toggle_welcome') {
                        await db.toggleOnjoinWelcome(message.guild.id);
                    }

                    const updated = buildDashboardPayload(message.guild, db);
                    await i.update(updated.embedFallback).catch(() => {});
                });

                collector.on('end', async (_, reason) => {
                    if (reason === 'deleted') return;
                });

                return;
            }

            // ,onjoin ping dm <toggle|message|test|view>
            if (action === 'dm') {
                const dmAction = (args[2] || '').toLowerCase();

                // ,onjoin ping dm toggle
                if (dmAction === 'toggle' || dmAction === 'enable' || dmAction === 'disable') {
                    const nextState = await db.toggleOnjoinPingDM(message.guild.id);
                    return message.reply({
                        embeds: [build.approved(message.author, `on-join ping dm notification is now **${nextState ? 'enabled' : 'disabled'}**.\n-# ${nextState ? 'new members will receive a harm-style welcomedm listing where they were pinged.' : 'no dm will be sent when members are pinged.'}`)]
                    });
                }

                // ,onjoin ping dm message <embed_or_text> (or reset)
                if (dmAction === 'message' || dmAction === 'text' || dmAction === 'set' || dmAction === 'msg') {
                    const rawInput = args.slice(3).join(' ').trim();
                    if (!rawInput) {
                        return message.reply({
                            embeds: [build.warn(message.author, 'syntax: `,onjoin ping dm message <embed_or_text|reset>`\n-# supports copied json from `,embed`, `{embed:name}` references, embed tags, or `reset` for default harm style.')]
                        });
                    }

                    if (['reset', 'default', 'clear'].includes(rawInput.toLowerCase())) {
                        await db.setOnjoinPingSettings(message.guild.id, { dm_message: null, dm_enabled: true });
                        return message.reply({
                            embeds: [build.approved(message.author, 'reset on-join ping dm to harm style welcomedm default.')]
                        });
                    }

                    await db.setOnjoinPingSettings(message.guild.id, { dm_message: rawInput, dm_enabled: true });
                    return message.reply({
                        embeds: [build.approved(message.author, 'updated on-join ping dm message.\n-# compatible with `,embed` json, `{embed:name}`, and `{channels}` variable.')]
                    });
                }

                // ,onjoin ping dm test
                if (dmAction === 'test') {
                    const pingSettings = db.getOnjoinPingSettings(message.guild.id);
                    const pings = db.getOnjoinPings(message.guild.id);

                    let mockChannels = pings.map(p => {
                        const ch = message.guild.channels.cache.get(p.channel_id);
                        return ch ? `-# • <#${ch.id}> (\`#${ch.name}\`)` : '-# • <#123456789> (`#welcome`)';
                    }).join('\n');
                    if (!mockChannels) mockChannels = `-# • <#${message.channel.id}> (\`#${message.channel.name}\`)`;

                    try {
                        if (pingSettings.dm_message) {
                            const customPayload = await EmbedParser.parse(
                                pingSettings.dm_message,
                                { member: message.member, user: message.author, guild: message.guild, channels: mockChannels },
                                db,
                                message.guild.id
                            );
                            await message.author.send(customPayload);
                        } else {
                            const cardPayload = EmbedParser.buildHarmStyleWelcomeDM({
                                guild: message.guild,
                                user: message.author,
                                channels: mockChannels
                            });
                            try {
                                await message.author.send(cardPayload.componentsV2);
                            } catch (_) {
                                await message.author.send(cardPayload.embedFallback);
                            }
                        }

                        return message.reply({
                            embeds: [build.approved(message.author, 'sent a live test of the harm-style on-join ping dm to your direct messages.')]
                        });
                    } catch (_) {
                        return message.reply({
                            embeds: [build.warn(message.author, 'failed to send dm. please make sure your direct messages are open for server members.')]
                        });
                    }
                }

                // ,onjoin ping dm view
                if (dmAction === 'view' || dmAction === 'preview') {
                    const pingSettings = db.getOnjoinPingSettings(message.guild.id);
                    const statusStr = pingSettings.dm_enabled ? '`enabled`' : '`disabled`';
                    const msgStr = pingSettings.dm_message ? `\`\`\`${pingSettings.dm_message}\`\`\`` : '-# *using default harm style welcomedm card.*';

                    const embed = new EmbedBuilder()
                        .setColor(config.colors.c || '#0A0A0C')
                        .setTitle('on-join ping dm notification')
                        .setDescription(`**status:** ${statusStr}\n\n**template:**\n${msgStr}\n-# variables: \`{channels}\`, \`{user}\`, \`{guild.name}\`, \`{guild.count}\``);

                    return message.reply({ embeds: [embed] });
                }

                return message.reply({
                    embeds: [build.warn(message.author, 'syntax: `,onjoin ping dm <toggle|message|test|view> [arguments]`')]
                });
            }

            // ,onjoin ping add <#channel> [time]
            if (action === 'add' || action === 'set') {
                const targetQuery = args[2];
                if (!targetQuery) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'syntax: `,onjoin ping add <#channel> [time]`\n-# time can be in seconds, mins, or hrs (e.g. `0s`, `10s`, `5m`, `1h`, or `none`).')]
                    });
                }

                const channel = resolveChannel(message.guild, targetQuery);
                if (!channel || !channel.isTextBased()) {
                    return message.reply({ embeds: [build.warn(message.author, 'please specify a valid text channel in this server.')] });
                }

                const durationArg = args[3];
                const duration = parseDuration(durationArg);
                if (duration === undefined) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'invalid duration format. use seconds, mins, or hrs (e.g. `0s`, `10s`, `5m`, `1h`, or `none`).')]
                    });
                }

                await db.addOnjoinPing(message.guild.id, channel.id, duration);
                return message.reply({
                    embeds: [build.approved(message.author, `added <#${channel.id}> to join pings with deletion timer: \`${formatDuration(duration)}\`.`)]
                });
            }

            // ,onjoin ping remove <#channel>
            if (action === 'remove' || action === 'delete' || action === 'del' || action === 'rem') {
                const targetQuery = args[2];
                if (!targetQuery) {
                    return message.reply({ embeds: [build.warn(message.author, 'syntax: `,onjoin ping remove <#channel>`')] });
                }

                const channel = resolveChannel(message.guild, targetQuery);
                const channelId = channel?.id || targetQuery.replace(/[<#>]/g, '');

                const removed = await db.removeOnjoinPing(message.guild.id, channelId);
                if (!removed) {
                    return message.reply({ embeds: [build.warn(message.author, `<#${channelId}> was not found in the join pings list.`)] });
                }

                return message.reply({ embeds: [build.approved(message.author, `removed <#${channelId}> from join pings.`)] });
            }

            // ,onjoin ping list
            if (action === 'list') {
                const pings = db.getOnjoinPings(message.guild.id);
                if (!pings || pings.length === 0) {
                    return message.reply({ embeds: [build.warn(message.author, 'no join ping channels configured. add one with `,onjoin ping add <#channel> [time]`.')] });
                }

                const lines = pings.map(p => {
                    const ch = message.guild.channels.cache.get(p.channel_id);
                    const chStr = ch ? `<#${ch.id}>` : `\`#deleted-channel\``;
                    return `• ${chStr} ─ \`${formatDuration(p.delete_after)}\``;
                });

                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || '#0A0A0C')
                    .setTitle(`join ping channels (${pings.length})`)
                    .setDescription(lines.join('\n'));

                return message.reply({ embeds: [embed] });
            }

            // ,onjoin ping clear
            if (action === 'clear' || action === 'reset') {
                await db.clearOnjoinPings(message.guild.id);
                return message.reply({ embeds: [build.approved(message.author, 'cleared all join ping channels for this server.')] });
            }

            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,onjoin ping <add|remove|list|clear|dm> [arguments]`')]
            });
        }

        // ──────────────────────── 3. DM SUBCOMMANDS ────────────────────────
        if (sub === 'dm') {
            const action = (args[1] || '').toLowerCase();

            // ,onjoin dm message <text_or_json_or_embed_ref>
            if (action === 'message' || action === 'msg' || action === 'text' || action === 'set') {
                const rawInput = args.slice(2).join(' ').trim();
                if (!rawInput) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'syntax: `,onjoin dm message <embed_or_text>`\n-# supports raw json from `,embed`, `{embed:name}` references, embed tags, or plain text.')]
                    });
                }

                await db.setOnjoinDM(message.guild.id, rawInput, 1);
                return message.reply({
                    embeds: [build.approved(message.author, 'updated on-join dm message and enabled delivery.\n-# compatible with `,embed` templates, json, and dynamic variables.')]
                });
            }

            // ,onjoin dm toggle
            if (action === 'toggle' || action === 'enable' || action === 'disable') {
                let nextState;
                if (action === 'enable') {
                    await db.setOnjoinDM(message.guild.id, undefined, 1);
                    nextState = true;
                } else if (action === 'disable') {
                    await db.setOnjoinDM(message.guild.id, undefined, 0);
                    nextState = false;
                } else {
                    nextState = await db.toggleOnjoinDM(message.guild.id);
                }

                return message.reply({
                    embeds: [build.approved(message.author, `on-join dm is now **${nextState ? 'enabled' : 'disabled'}**.\n-# ${nextState ? 'new members will receive this dm upon joining.' : 'no dms will be sent upon joining.'}`)]
                });
            }

            // ,onjoin dm test
            if (action === 'test') {
                const dmConfig = db.getOnjoinDM(message.guild.id);
                if (!dmConfig || !dmConfig.message) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'no on-join dm message has been set yet. use `,onjoin dm message <embed_or_text>`.')]
                    });
                }

                try {
                    const payload = await EmbedParser.parse(
                        dmConfig.message,
                        { member: message.member, user: message.author, guild: message.guild },
                        db,
                        message.guild.id
                    );

                    await message.author.send(payload);
                    return message.reply({ embeds: [build.approved(message.author, 'sent a live test of your on-join dm to your direct messages.')] });
                } catch (_) {
                    return message.reply({ embeds: [build.warn(message.author, 'failed to send dm. please ensure your direct messages are open for server members.')] });
                }
            }

            // ,onjoin dm view / preview
            if (action === 'view' || action === 'preview') {
                const dmConfig = db.getOnjoinDM(message.guild.id);
                const statusStr = dmConfig.enabled ? '`enabled`' : '`disabled`';
                const msgStr = dmConfig.message ? `\`\`\`${dmConfig.message}\`\`\`` : '-# *no message configured.*';

                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || '#0A0A0C')
                    .setTitle('on-join dm configuration')
                    .setDescription(`**status:** ${statusStr}\n\n**raw template:**\n${msgStr}\n-# variables: \`{user}\`, \`{user.name}\`, \`{guild.name}\`, \`{guild.count}\`, \`{inviter}\``);

                return message.reply({ embeds: [embed] });
            }

            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,onjoin dm <message|toggle|test|view> [arguments]`')]
            });
        }

        // ──────────────────────── 4. CHANNEL MESSAGE SUBCOMMANDS ────────────────────────
        if (sub === 'message' || sub === 'msg' || sub === 'welcome') {
            const action = (args[1] || '').toLowerCase();

            // ,onjoin message channel <#channel>
            if (action === 'channel' || action === 'setchannel') {
                const targetQuery = args[2];
                if (!targetQuery) {
                    return message.reply({ embeds: [build.warn(message.author, 'syntax: `,onjoin message channel <#channel>`')] });
                }

                const channel = resolveChannel(message.guild, targetQuery);
                if (!channel || !channel.isTextBased()) {
                    return message.reply({ embeds: [build.warn(message.author, 'please specify a valid text channel in this server.')] });
                }

                await db.setOnjoinWelcome(message.guild.id, channel.id, undefined, 1);
                return message.reply({ embeds: [build.approved(message.author, `welcome messages will now be posted in <#${channel.id}>.`)] });
            }

            // ,onjoin message text <embed_or_text>
            if (action === 'text' || action === 'msg' || action === 'message' || action === 'set') {
                const rawInput = args.slice(2).join(' ').trim();
                if (!rawInput) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'syntax: `,onjoin message text <embed_or_text>`\n-# supports copied json from `,embed`, `{embed:name}` references, embed tags, or plain text.')]
                    });
                }

                await db.setOnjoinWelcome(message.guild.id, undefined, rawInput, 1);
                return message.reply({
                    embeds: [build.approved(message.author, 'updated welcome message and enabled delivery.\n-# compatible with `,embed` templates, json, and dynamic variables.')]
                });
            }

            // ,onjoin message toggle
            if (action === 'toggle' || action === 'enable' || action === 'disable') {
                let nextState;
                if (action === 'enable') {
                    await db.setOnjoinWelcome(message.guild.id, undefined, undefined, 1);
                    nextState = true;
                } else if (action === 'disable') {
                    await db.setOnjoinWelcome(message.guild.id, undefined, undefined, 0);
                    nextState = false;
                } else {
                    nextState = await db.toggleOnjoinWelcome(message.guild.id);
                }

                return message.reply({
                    embeds: [build.approved(message.author, `welcome messages are now **${nextState ? 'enabled' : 'disabled'}**.`)]
                });
            }

            // ,onjoin message test
            if (action === 'test') {
                const welcomeConfig = db.getOnjoinWelcome(message.guild.id);
                if (!welcomeConfig || !welcomeConfig.message) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'no welcome message has been set yet. use `,onjoin message text <embed_or_text>`.')]
                    });
                }

                const payload = await EmbedParser.parse(
                    welcomeConfig.message,
                    { member: message.member, user: message.author, guild: message.guild },
                    db,
                    message.guild.id
                );

                return message.reply(payload).catch(err => {
                    return message.reply({ embeds: [build.warn(message.author, `failed to render welcome test: ${err.message}`)] });
                });
            }

            // ,onjoin message view
            if (action === 'view' || action === 'preview') {
                const welcomeConfig = db.getOnjoinWelcome(message.guild.id);
                const statusStr = welcomeConfig.enabled ? '`enabled`' : '`disabled`';
                const chStr = welcomeConfig.channel_id ? `<#${welcomeConfig.channel_id}>` : '`not set`';
                const msgStr = welcomeConfig.message ? `\`\`\`${welcomeConfig.message}\`\`\`` : '-# *no message configured.*';

                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || '#0A0A0C')
                    .setTitle('channel welcome message configuration')
                    .setDescription(`**status:** ${statusStr}\n**channel:** ${chStr}\n\n**raw template:**\n${msgStr}\n-# variables: \`{user}\`, \`{user.name}\`, \`{guild.name}\`, \`{guild.count}\`, \`{inviter}\``);

                return message.reply({ embeds: [embed] });
            }

            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,onjoin message <channel|text|toggle|test|view> [arguments]`')]
            });
        }

        return message.reply({
            embeds: [build.warn(message.author, 'syntax: `,onjoin <ping|dm|message|overview> [arguments]`\n-# run `,onjoin` alone to open the dashboard.')]
        });
    }
}

module.exports = OnJoinCommand;
