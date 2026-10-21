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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
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
    const mentionMatch = clean.match(/^<#(\d+)>$/);
    if (mentionMatch) return guild.channels.cache.get(mentionMatch[1]) || null;
    if (/^\d+$/.test(clean)) return guild.channels.cache.get(clean) || null;
    const lower = clean.toLowerCase();
    const channels = typeof guild.channels.cache.values === 'function'
        ? Array.from(guild.channels.cache.values())
        : [];
    const exact = channels.find(c => c.name && c.name.toLowerCase() === lower);
    if (exact) return exact;
    const starts = channels.find(c => c.name && c.name.toLowerCase().startsWith(lower));
    if (starts) return starts;
    return channels.find(c => c.name && c.name.toLowerCase().includes(lower)) || null;
}

function parseDuration(input) {
    if (!input) return 0;
    const str = input.toLowerCase().trim();
    if (['0', '0s', 'off', 'none', 'disable', 'never', 'null'].includes(str)) return 0;

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
    if (!seconds || seconds <= 0) return 'never (permanent)';
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

function buildLeaveDashboard(guild, db, disabled = false) {
    const leaveConfig = db.getLeaveConfig(guild.id);
    const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
    const e = config.emojis || {};

    const statusStr = leaveConfig.enabled ? '`enabled`' : '`disabled`';
    const channelStr = leaveConfig.channel_id ? `<#${leaveConfig.channel_id}>` : '`not set`';
    const timerStr = `\`${formatDuration(leaveConfig.autodelete)}\``;

    let snippet = '-# *using default harm aesthetic leave card ({embed:leave})*';
    if (leaveConfig.message) {
        const raw = leaveConfig.message.trim();
        snippet = `\`\`\`${raw.length > 180 ? raw.slice(0, 177) + '...' : raw}\`\`\``;
    }

    const textContent =
        `### [leave setup](${supportUrl})\n` +
        `-# automated message dispatched when members leave.\n\n` +
        `**status:** ${statusStr} · **channel:** ${channelStr}\n` +
        `**autodelete:** ${timerStr}\n\n` +
        `**message template:**\n` +
        `${snippet}\n` +
        `-# **variables:** \`{user}\`, \`{user.name}\`, \`{user.mention}\`, \`{server.name}\`, \`{membercount}\``;

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

    const toggleBtn = new ButtonBuilder()
        .setCustomId('leave:toggle')
        .setLabel(leaveConfig.enabled ? 'disable leave' : 'enable leave')
        .setStyle(leaveConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (leaveConfig.enabled && e.deny) toggleBtn.setEmoji(e.deny);
    else if (!leaveConfig.enabled && e.approve) toggleBtn.setEmoji(e.approve);

    const editMsgBtn = new ButtonBuilder()
        .setCustomId('leave:edit_msg')
        .setLabel('edit message')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (e.emb_desc) editMsgBtn.setEmoji(e.emb_desc);

    const setChannelBtn = new ButtonBuilder()
        .setCustomId('leave:edit_channel')
        .setLabel('set channel')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (e.channels) setChannelBtn.setEmoji(e.channels);

    const autodeleteBtn = new ButtonBuilder()
        .setCustomId('leave:cycle_autodelete')
        .setLabel(`timer: ${formatDuration(leaveConfig.autodelete)}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (e.calendar) autodeleteBtn.setEmoji(e.calendar);

    const testBtn = new ButtonBuilder()
        .setCustomId('leave:test')
        .setLabel('test preview')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (e.harm_play) testBtn.setEmoji(e.harm_play);

    const row = new ActionRowBuilder().addComponents(toggleBtn, editMsgBtn, setChannelBtn, autodeleteBtn, testBtn);
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

class LeaveCommand {
    constructor() {
        this.name = 'leave';
        this.aliases = ['goodbye', 'leaver'];
        this.description = 'configure automated farewell messages, custom embeds, deletion timers, and channels when members leave.';
        this.syntax = ',leave\n,leave setup [#channel]\n,leave channel <#channel>\n,leave message <embed_or_text>\n,leave messages <add|clear|list> [message]\n,leave autodelete <time>\n,leave toggle\n,leave test\n,leave clear';
        this.example = ',leave\n,leave setup #goodbye\n,leave message {embed:leave}\n,leave message {"title":"goodbye {user.name}!","color":"#0A0A0C"}\n,leave autodelete 30s\n,leave test';
        this.category = 'utility';
        this.cooldown = 2;
        this.subcommands = [
            'leave setup [#channel]',
            'leave channel <#channel>',
            'leave message <embed_or_text>',
            'leave messages add <embed_or_text>',
            'leave messages clear',
            'leave messages list',
            'leave autodelete <duration>',
            'leave toggle',
            'leave test',
            'leave clear',
            'leave view'
        ];
        this.subcommandDetails = {
            setup: {
                description: 'open the interactive leave setup dashboard or set the channel directly.',
                syntax: ',leave setup [#channel]',
                example: ',leave setup #goodbye'
            },
            channel: {
                description: 'set the channel where farewell messages are sent.',
                syntax: ',leave channel <#channel>',
                example: ',leave channel #goodbye'
            },
            message: {
                description: 'set the farewell message (accepts copied ,embed json, {embed:name}, tags, or text).',
                syntax: ',leave message <embed_or_text>',
                example: ',leave message {embed:leave}'
            },
            'messages add': {
                description: 'add or update the leave message template.',
                syntax: ',leave messages add <embed_or_text>',
                example: ',leave messages add goodbye {user.name}!'
            },
            'messages clear': {
                description: 'reset the leave message to the harm default template.',
                syntax: ',leave messages clear',
                example: ',leave messages clear'
            },
            'messages list': {
                description: 'view the currently configured leave message template.',
                syntax: ',leave messages list',
                example: ',leave messages list'
            },
            autodelete: {
                description: 'set an automatic deletion timer for leave messages.',
                syntax: ',leave autodelete <duration>',
                example: ',leave autodelete 30s'
            },
            toggle: {
                description: 'enable or disable leave messages.',
                syntax: ',leave toggle',
                example: ',leave toggle'
            },
            test: {
                description: 'send a live preview of the leave message to this channel.',
                syntax: ',leave test',
                example: ',leave test'
            },
            clear: {
                description: 'clear all leave configuration for this server.',
                syntax: ',leave clear',
                example: ',leave clear'
            },
            view: {
                description: 'view current leave settings and status.',
                syntax: ',leave view',
                example: ',leave view'
            }
        };
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply(build.warnBox('servers only', 'leave can only be configured in servers.'));
        }

        const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
        const hasPerms = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
        if (!hasPerms) {
            return message.reply({ embeds: [build.deny(message.author, 'you need manage server permissions to configure leave settings.')] });
        }

        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database subsystem is currently offline.')] });
        }

        const sub = (args[0] || '').toLowerCase();

        // ──────────────────────── 1. INTERACTIVE DASHBOARD ────────────────────────
        if (!sub || sub === 'dashboard' || sub === 'config' || (sub === 'setup' && !args[1])) {
            const dashboard = buildLeaveDashboard(message.guild, db);
            let sentMsg;
            try {
                sentMsg = await message.reply(dashboard.componentsV2);
            } catch (_) {
                sentMsg = await message.reply(dashboard.embedFallback);
            }

            if (!sentMsg) return;

            const collector = sentMsg.createMessageComponentCollector({
                time: 120_000
            });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({
                        content: 'only the command author can control this menu.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                collector.resetTimer?.();
                const cid = i.customId;

                // 1. Toggle
                if (cid === 'leave:toggle') {
                    await db.toggleLeave(message.guild.id);
                    const updated = buildLeaveDashboard(message.guild, db);
                    try {
                        return await i.update(updated.componentsV2);
                    } catch (_) {
                        return await i.update(updated.embedFallback);
                    }
                }

                // 2. Cycle Autodelete
                if (cid === 'leave:cycle_autodelete') {
                    const current = db.getLeaveConfig(message.guild.id);
                    const timers = [0, 5, 10, 30, 60, 300];
                    let curIdx = timers.indexOf(current.autodelete || 0);
                    if (curIdx === -1) curIdx = 0;
                    const nextTimer = timers[(curIdx + 1) % timers.length];

                    await db.setLeaveConfig(message.guild.id, undefined, undefined, undefined, nextTimer);
                    const updated = buildLeaveDashboard(message.guild, db);
                    try {
                        return await i.update(updated.componentsV2);
                    } catch (_) {
                        return await i.update(updated.embedFallback);
                    }
                }

                // 3. Edit Message Modal
                if (cid === 'leave:edit_msg') {
                    const ts = Date.now();
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_leave_msg_${ts}`)
                        .setTitle('edit leave message');

                    const input = new TextInputBuilder()
                        .setCustomId('msg_content')
                        .setLabel('embed json, {embed:name}, tags, or text')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('{embed:leave}\nor\n{"title":"goodbye {user.name}!","color":"#0A0A0C"}\nor\ngoodbye {user.name}!')
                        .setRequired(true);

                    const cur = db.getLeaveConfig(message.guild.id);
                    if (cur?.message && cur.message.length <= 4000) {
                        input.setValue(cur.message);
                    }

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    await i.showModal(modal);

                    const submission = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_leave_msg_${ts}` && m.user.id === message.author.id,
                        time: 120_000
                    }).catch(() => null);

                    if (!submission) return;

                    const newMsg = submission.fields.getTextInputValue('msg_content').trim();
                    if (['reset', 'default', 'clear'].includes(newMsg.toLowerCase())) {
                        await db.setLeaveConfig(message.guild.id, undefined, null, 1);
                    } else {
                        await db.setLeaveConfig(message.guild.id, undefined, newMsg, 1);
                    }

                    const updated = buildLeaveDashboard(message.guild, db);
                    try {
                        return await submission.update(updated.componentsV2);
                    } catch (_) {
                        return await submission.update(updated.embedFallback);
                    }
                }

                // 4. Set Channel Modal
                if (cid === 'leave:edit_channel') {
                    const ts = Date.now();
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_leave_ch_${ts}`)
                        .setTitle('set leave channel');

                    const input = new TextInputBuilder()
                        .setCustomId('ch_input')
                        .setLabel('channel mention, name, or id')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('#goodbye or 123456789012345678')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    await i.showModal(modal);

                    const submission = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_leave_ch_${ts}` && m.user.id === message.author.id,
                        time: 60_000
                    }).catch(() => null);

                    if (!submission) return;

                    const chQuery = submission.fields.getTextInputValue('ch_input').trim();
                    const targetCh = resolveChannel(message.guild, chQuery);
                    if (!targetCh || !targetCh.isTextBased()) {
                        return submission.reply({
                            embeds: [build.warn(message.author, 'invalid channel. please specify a valid text channel in this server.')],
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }

                    await db.setLeaveConfig(message.guild.id, targetCh.id, undefined, 1);
                    const updated = buildLeaveDashboard(message.guild, db);
                    try {
                        return await submission.update(updated.componentsV2);
                    } catch (_) {
                        return await submission.update(updated.embedFallback);
                    }
                }

                // 5. Test Preview
                if (cid === 'leave:test') {
                    const cur = db.getLeaveConfig(message.guild.id);
                    const template = cur.message || '{embed:leave}';
                    try {
                        const payload = await EmbedParser.parse(
                            template,
                            { member: message.member, user: message.author, guild: message.guild },
                            db,
                            message.guild.id
                        );

                        const testSent = await message.channel.send(payload).catch(() => null);
                        if (testSent && cur.autodelete > 0) {
                            setTimeout(() => testSent.delete().catch(() => {}), cur.autodelete * 1000);
                        }

                        return await i.reply({
                            embeds: [build.approved(message.author, 'dispatched a live test leave message to this channel.')],
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    } catch (err) {
                        return await i.reply({
                            embeds: [build.warn(message.author, `failed to render test message: ${err.message}`)],
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'deleted') return;
                const disabledDashboard = buildLeaveDashboard(message.guild, db, true);
                try {
                    await sentMsg.edit(disabledDashboard.componentsV2).catch(() => {});
                } catch (_) {
                    await sentMsg.edit(disabledDashboard.embedFallback).catch(() => {});
                }
            });

            return;
        }

        // ──────────────────────── 2. SETUP SUBCOMMAND WITH CHANNEL ────────────────────────
        if (sub === 'setup') {
            const targetQuery = args[1];
            const channel = resolveChannel(message.guild, targetQuery);
            if (!channel || !channel.isTextBased()) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,leave setup <#channel>`\n-# or run `,leave` alone to open the interactive setup dashboard.')] });
            }

            await db.setLeaveConfig(message.guild.id, channel.id, undefined, 1);
            return message.reply({
                embeds: [build.approved(message.author, `leave messages will now be posted in <#${channel.id}> and are enabled.\n-# customize message with \`,leave message <embed_or_text>\` or run \`,leave\` for the dashboard.`)]
            });
        }

        // ──────────────────────── 3. CHANNEL SUBCOMMAND ────────────────────────
        if (sub === 'channel' || sub === 'setchannel') {
            const targetQuery = args[1];
            if (!targetQuery) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,leave channel <#channel>`')] });
            }

            const channel = resolveChannel(message.guild, targetQuery);
            if (!channel || !channel.isTextBased()) {
                return message.reply({ embeds: [build.warn(message.author, 'please specify a valid text channel in this server.')] });
            }

            await db.setLeaveConfig(message.guild.id, channel.id, undefined, 1);
            return message.reply({ embeds: [build.approved(message.author, `leave messages will now be posted in <#${channel.id}>.`)] });
        }

        // ──────────────────────── 4. MESSAGE / MESSAGES SUBCOMMAND ────────────────────────
        if (sub === 'message' || sub === 'msg' || sub === 'text') {
            const rawInput = args.slice(1).join(' ').trim();
            if (!rawInput) {
                return message.reply({
                    embeds: [build.warn(message.author, 'syntax: `,leave message <embed_or_text>`\n-# accepts copied json from `,embed`, `{embed:name}` references, embed tags, or plain text.')]
                });
            }

            if (['reset', 'default', 'clear'].includes(rawInput.toLowerCase())) {
                await db.setLeaveConfig(message.guild.id, undefined, null, 1);
                return message.reply({
                    embeds: [build.approved(message.author, 'reset leave message to harm default template ({embed:leave}).')]
                });
            }

            await db.setLeaveConfig(message.guild.id, undefined, rawInput, 1);
            return message.reply({
                embeds: [build.approved(message.author, 'updated leave message and enabled delivery.\n-# compatible with `,embed` templates, json, and dynamic variables.')]
            });
        }

        if (sub === 'messages') {
            const action = (args[1] || '').toLowerCase();

            if (action === 'add' || action === 'set') {
                const rawInput = args.slice(2).join(' ').trim();
                if (!rawInput) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'syntax: `,leave messages add <embed_or_text>`\n-# accepts copied json from `,embed`, `{embed:name}` references, embed tags, or plain text.')]
                    });
                }

                await db.setLeaveConfig(message.guild.id, undefined, rawInput, 1);
                return message.reply({
                    embeds: [build.approved(message.author, 'updated leave message and enabled delivery.')]
                });
            }

            if (action === 'clear' || action === 'reset') {
                await db.setLeaveConfig(message.guild.id, undefined, null, 1);
                return message.reply({
                    embeds: [build.approved(message.author, 'reset leave message to harm default template ({embed:leave}).')]
                });
            }

            if (action === 'list' || action === 'view') {
                const cur = db.getLeaveConfig(message.guild.id);
                const msgStr = cur.message ? `\`\`\`${cur.message}\`\`\`` : '-# *using default harm aesthetic leave card ({embed:leave})*';
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || '#0A0A0C')
                    .setTitle('leave message template')
                    .setDescription(msgStr);
                return message.reply({ embeds: [embed] });
            }

            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,leave messages <add|clear|list> [message]`')]
            });
        }

        // ──────────────────────── 5. AUTODELETE SUBCOMMAND ────────────────────────
        if (sub === 'autodelete' || sub === 'timer') {
            const durationArg = args[1];
            if (!durationArg) {
                return message.reply({
                    embeds: [build.warn(message.author, 'syntax: `,leave autodelete <duration>`\n-# example: `,leave autodelete 30s` or `,leave autodelete off`')]
                });
            }

            const duration = parseDuration(durationArg);
            if (duration === undefined) {
                return message.reply({
                    embeds: [build.warn(message.author, 'invalid duration format. use seconds, mins, or hrs (e.g. `10s`, `1m`, `5m`, or `off`).')]
                });
            }

            await db.setLeaveConfig(message.guild.id, undefined, undefined, undefined, duration);
            return message.reply({
                embeds: [build.approved(message.author, `leave message auto-delete timer set to: \`${formatDuration(duration)}\`.`)]
            });
        }

        // ──────────────────────── 6. TOGGLE SUBCOMMAND ────────────────────────
        if (sub === 'toggle' || sub === 'enable' || sub === 'disable') {
            let nextState;
            if (sub === 'enable') {
                await db.setLeaveConfig(message.guild.id, undefined, undefined, 1);
                nextState = true;
            } else if (sub === 'disable') {
                await db.setLeaveConfig(message.guild.id, undefined, undefined, 0);
                nextState = false;
            } else {
                nextState = await db.toggleLeave(message.guild.id);
            }

            return message.reply({
                embeds: [build.approved(message.author, `leave messages are now **${nextState ? 'enabled' : 'disabled'}**.`)]
            });
        }

        // ──────────────────────── 7. TEST SUBCOMMAND ────────────────────────
        if (sub === 'test') {
            const cur = db.getLeaveConfig(message.guild.id);
            const template = cur.message || '{embed:leave}';

            try {
                const payload = await EmbedParser.parse(
                    template,
                    { member: message.member, user: message.author, guild: message.guild },
                    db,
                    message.guild.id
                );

                const sent = await message.channel.send(payload).catch(err => {
                    return message.reply({ embeds: [build.warn(message.author, `failed to send leave message: ${err.message}`)] });
                });

                if (sent && cur.autodelete > 0) {
                    setTimeout(() => sent.delete().catch(() => {}), cur.autodelete * 1000);
                }

                return;
            } catch (err) {
                return message.reply({ embeds: [build.warn(message.author, `failed to render leave test: ${err.message}`)] });
            }
        }

        // ──────────────────────── 8. CLEAR / RESET SUBCOMMAND ────────────────────────
        if (sub === 'clear' || sub === 'reset') {
            await db.clearLeaveConfig(message.guild.id);
            return message.reply({
                embeds: [build.approved(message.author, 'cleared leave configuration for this server.')]
            });
        }

        // ──────────────────────── 9. VIEW / CONFIG SUBCOMMAND ────────────────────────
        if (sub === 'view' || sub === 'preview') {
            const cur = db.getLeaveConfig(message.guild.id);
            const statusStr = cur.enabled ? '`enabled`' : '`disabled`';
            const chStr = cur.channel_id ? `<#${cur.channel_id}>` : '`not set`';
            const timerStr = `\`${formatDuration(cur.autodelete)}\``;
            const msgStr = cur.message ? `\`\`\`${cur.message}\`\`\`` : '-# *using default harm aesthetic leave card ({embed:leave})*';

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setTitle('leave configuration')
                .setDescription(
                    `**status:** ${statusStr}\n` +
                    `**channel:** ${chStr}\n` +
                    `**autodelete:** ${timerStr}\n\n` +
                    `**template:**\n${msgStr}\n` +
                    `-# variables: \`{user}\`, \`{user.name}\`, \`{user.mention}\`, \`{server.name}\`, \`{membercount}\``
                );

            return message.reply({ embeds: [embed] });
        }

        return message.reply({
            embeds: [build.warn(message.author, 'syntax: `,leave <setup|channel|message|autodelete|toggle|test|clear|view> [arguments]`\n-# run `,leave` alone to open the interactive setup dashboard.')]
        });
    }
}

module.exports = LeaveCommand;
