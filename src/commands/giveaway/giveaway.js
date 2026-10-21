const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, EmbedBuilder } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const GiveawayHelper = require('../../structures/utils/helpers/giveaway.js');

class GiveawayCommand {
    constructor() {
        this.name = 'giveaway';
        this.aliases = [
            'gw', 'giveaways',
            'gws', 'gstart', 'gwstart', 'gcreate',
            'gcancel', 'gwcancel', 'gremove', 'gwremove',
            'glist', 'gwlist',
            'greq', 'gwreq', 'grequirement',
            'greroll', 'gwreroll'
        ];
        this.description = 'timed giveaways with requirements and rerolls.';
        this.syntax = ',giveaway <start|cancel|list|requirement|reroll> [arguments]';
        this.example = ',gws 10m nitro';
        this.category = 'giveaway';
        this.cooldown = 3;

        this.subcommands = [
            'giveaway start <duration> [winners] <prize>',
            'giveaway cancel <id>',
            'giveaway list',
            'giveaway requirement <id> <role|boost|age> [value]',
            'giveaway reroll [id]'
        ];

        this.subcommandDetails = {
            start: {
                description: 'start a timed giveaway in the current channel.',
                syntax: ',giveaway start <duration> [winners] <prize>',
                example: ',gws 10m 1 nitro'
            },
            cancel: {
                description: 'cancel an active giveaway by its id.',
                syntax: ',giveaway cancel <id>',
                example: ',gw cancel 1'
            },
            list: {
                description: 'every giveaway still running in this server with its id.',
                syntax: ',giveaway list',
                example: ',glist'
            },
            requirement: {
                description: 'restrict who can enter a giveaway.',
                syntax: ',giveaway requirement <id> <role|boost|age> [value]',
                example: ',greq 1 role @VIP'
            },
            reroll: {
                description: 'draw a new winner from previous entries.',
                syntax: ',giveaway reroll [id]',
                example: ',greroll 1'
            }
        };
    }

    async resolveGiveawayTarget(message, args, { activeOnly = false, endedOnly = false } = {}) {
        const db = message.client.db;
        let gw = null;
        let remaining = args ? [...args] : [];
        const firstArg = remaining[0];

        // 1. Target by replied message
        if (message.reference?.messageId) {
            gw = await db.getGiveawayByMessageId(message.reference.messageId);
            if (gw) return { gw, remainingArgs: remaining };
        }

        // 2. Target by Discord message link URL
        if (firstArg && /discord\.com\/channels\/\d+\/\d+\/(\d+)/.test(firstArg)) {
            const matched = firstArg.match(/discord\.com\/channels\/\d+\/\d+\/(\d+)/)[1];
            gw = await db.getGiveawayByMessageId(matched);
            if (gw) {
                remaining.shift();
                return { gw, remainingArgs: remaining };
            }
        }

        // 3. Target by Snowflake Message ID
        if (firstArg && /^\d{17,20}$/.test(firstArg)) {
            gw = await db.getGiveawayByMessageId(firstArg);
            if (gw) {
                remaining.shift();
                return { gw, remainingArgs: remaining };
            }
        }

        // 4. Target by SQLite ID: e.g. #1 or 1
        const cleanId = firstArg ? firstArg.replace(/^#/, '') : null;
        if (cleanId && /^\d{1,6}$/.test(cleanId)) {
            gw = await db.getGiveawayById(parseInt(cleanId, 10));
            if (gw) {
                remaining.shift();
                return { gw, remainingArgs: remaining };
            }
        }

        // 5. Default to latest giveaway in channel/server
        gw = await db.getLatestGiveaway(message.guild.id, message.channel.id, { activeOnly, endedOnly });
        return { gw, remainingArgs: remaining };
    }

    async execute(message, args, commandName) {
        if (!message.guild) {
            return message.reply(build.warnBox('nothing found', 'giveaways can only be managed in servers.'));
        }

        const db = message.client.db;
        if (!db) {
            return message.reply(build.denyBox('offline', 'database subsystem is currently offline.'));
        }

        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();
        let remainingArgs = args ? [...args] : [];

        // Route shortforms & aliases
        if (['gstart', 'gwstart', 'gcreate', 'gws'].includes(invoked)) {
            sub = 'start';
        } else if (['gcancel', 'gwcancel', 'gremove', 'gwremove'].includes(invoked)) {
            sub = 'cancel';
        } else if (['glist', 'gwlist'].includes(invoked)) {
            sub = 'list';
        } else if (['greq', 'gwreq', 'grequirement'].includes(invoked)) {
            sub = 'requirement';
        } else if (['greroll', 'gwreroll'].includes(invoked)) {
            sub = 'reroll';
        } else if (sub === 'remove') {
            sub = 'cancel';
            remainingArgs.shift();
        } else if (this.subcommandDetails[sub]) {
            remainingArgs.shift();
        } else if (remainingArgs.some(a => GiveawayHelper.parseDuration(a) !== null)) {
            sub = 'start';
        }

        // If no subcommands or arguments specified, display interactive subcommands help
        if (!sub && (!args || args.length === 0)) {
            return await build.help(message, this);
        }

        const isOwner = config.owners?.includes(message.author.id);
        const hasModPerms = isOwner
            || message.member.permissions.has(PermissionFlagsBits.ManageGuild)
            || message.member.permissions.has(PermissionFlagsBits.ManageMessages);

        // ──────────────────────── LIST (everyone) ────────────────────────
        if (sub === 'list') {
            const active = await db.getActiveGiveaways(message.guild.id);
            if (!active.length) {
                return message.reply(build.warnBox('nothing found', 'no active giveaways currently running in this server.'));
            }

            const emojis = GiveawayHelper.getEmojis();
            const items = active.map(gw => {
                const endTimestamp = Math.floor(gw.ends_at / 1000);
                return `**#${gw.id}** ─ **${gw.prize}** in <#${gw.channel_id}>\n` +
                    `-# ends <t:${endTimestamp}:R> · **winners:** \`${gw.winners_count}\` · cancel: \`,gw cancel ${gw.id}\``;
            });

            const bannerAttachment = build.getAssetAttachment('giveaway.png') || build.getAssetAttachment('utility.png');
            const files = bannerAttachment ? [bannerAttachment] : [];

            const container = new ContainerBuilder()
                .setAccentColor(typeof config.colors?.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors?.c || 0x0A0A0C))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${emojis.gift} active giveaways (${active.length})`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(items.join('\n\n'))
                );

            try {
                return await message.reply({ components: [container], files, flags: MessageFlags.IsComponentsV2 });
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors?.c || 0x0A0A0C)
                    .setTitle('active giveaways')
                    .setDescription(items.join('\n\n'));
                if (bannerAttachment) embed.setImage(`attachment://${bannerAttachment.name}`);
                return await message.reply({ embeds: [embed], files });
            }
        }

        // Mod permission required for administrative subcommands
        if (!hasModPerms) {
            return message.reply(build.denyBox('permission denied', 'you need `manage_messages` permission to configure giveaways.'));
        }

        // ──────────────────────── CANCEL / REMOVE ────────────────────────
        if (sub === 'cancel') {
            const active = await db.getActiveGiveaways(message.guild.id);
            if (!active.length) {
                return message.reply(build.warnBox('nothing found', 'no active giveaways currently running in this server.'));
            }

            let gw = null;
            if (remainingArgs.length > 0) {
                const resolved = await this.resolveGiveawayTarget(message, remainingArgs, { activeOnly: true });
                gw = resolved.gw;
            } else if (active.length === 1) {
                gw = active[0];
            } else {
                const items = active.map(g => `• **#${g.id}** ─ **${g.prize}** in <#${g.channel_id}> (\`,gw cancel ${g.id}\`)`);
                return message.reply(build.warnBox('specify giveaway', `multiple giveaways are currently running. specify the id to cancel:\n\n${items.join('\n')}`));
            }

            if (!gw || gw.ended || gw.cancelled) {
                return message.reply(build.warnBox('nothing found', 'could not find an active giveaway with that id or link.'));
            }

            await GiveawayHelper.cancelGiveaway(message.client, gw);
            return message.reply(build.approvedBox('cancelled', `giveaway **#${gw.id}** for **${gw.prize}** has been cancelled.`));
        }

        // ──────────────────────── REROLL ────────────────────────
        if (sub === 'reroll') {
            const { gw } = await this.resolveGiveawayTarget(message, remainingArgs, { endedOnly: true });
            if (!gw) {
                return message.reply(build.warnBox('nothing found', 'no concluded giveaway found to reroll.'));
            }

            const newWinners = await GiveawayHelper.rerollGiveaway(message.client, gw);
            if (!newWinners || !newWinners.length) {
                return message.reply(build.warnBox('nothing found', 'no entries available to reroll.'));
            }
            return message.reply(build.approvedBox('rerolled', `rerolled winner(s) for **${gw.prize}**.`));
        }

        // ──────────────────────── REQUIREMENT ────────────────────────
        if (sub === 'requirement') {
            const { gw, remainingArgs: reqArgs } = await this.resolveGiveawayTarget(message, remainingArgs, { activeOnly: true });

            if (!gw) {
                return message.reply(build.warnBox('nothing found', 'no active giveaway found to set requirements for.'));
            }

            const reqType = (reqArgs[0] || '').toLowerCase();
            const reqVal = reqArgs[1] || '';

            if (['none', 'clear', 'remove', 'reset'].includes(reqType)) {
                await db.updateGiveawayRequirement(gw.id, null);
                gw.requirement = null;

                const entriesCount = await db.getGiveawayEntriesCount(gw.id);
                const payload = GiveawayHelper.buildPayload(gw, entriesCount, false);
                try {
                    const channel = await message.client.channels.fetch(gw.channel_id).catch(() => null);
                    const gwMsg = await channel?.messages.fetch(gw.message_id).catch(() => null);
                    if (gwMsg) await gwMsg.edit(payload.componentsV2);
                } catch (_) {}

                return message.reply(build.approvedBox('requirement removed', `removed entry requirement for **${gw.prize}**.`));
            }

            let requirementObj = null;
            if (reqType === 'role') {
                const roleMention = message.mentions?.roles?.first?.();
                const roleId = roleMention?.id || reqVal.replace(/[<@&>]/g, '').trim();
                const role = message.guild.roles.cache.get(roleId);
                if (!role) {
                    return message.reply(build.warnBox('invalid role', 'provide a valid role mention or id.'));
                }
                requirementObj = { type: 'role', value: role.id, name: role.name };
            } else if (reqType === 'boost' || reqType === 'booster') {
                requirementObj = { type: 'boost' };
            } else if (reqType === 'age') {
                const days = parseInt(reqVal.replace(/\D/g, ''), 10);
                if (!days || days < 1) {
                    return message.reply(build.warnBox('invalid age', 'specify required account age in days (e.g. `age 7`).'));
                }
                requirementObj = { type: 'age', value: days };
            } else {
                return message.reply(build.warnBox('invalid format', 'use `,giveaway requirement <id> <role|boost|age> [value]` or `,greq <id> none`.'));
            }

            const reqJson = JSON.stringify(requirementObj);
            await db.updateGiveawayRequirement(gw.id, reqJson);
            gw.requirement = reqJson;

            const entriesCount = await db.getGiveawayEntriesCount(gw.id);
            const payload = GiveawayHelper.buildPayload(gw, entriesCount, false);
            try {
                const channel = await message.client.channels.fetch(gw.channel_id).catch(() => null);
                const gwMsg = await channel?.messages.fetch(gw.message_id).catch(() => null);
                if (gwMsg) await gwMsg.edit(payload.componentsV2);
            } catch (_) {}

            return message.reply(build.approvedBox('requirement updated', `set entry requirement for **${gw.prize}**.`));
        }

        // ──────────────────────── START ────────────────────────
        if (sub === 'start') {
            if (!remainingArgs.length) {
                return message.reply(build.warnBox('syntax guide', 'use `,gws <duration> [winners] <prize>` or `,gws <prize> <duration>`.'));
            }

            const parsed = GiveawayHelper.parseStartArgs(remainingArgs);
            if (!parsed || !parsed.durationSec) {
                return message.reply(build.warnBox('invalid duration', 'specify a valid time format like `10s`, `10m`, `2h`, `1d`.'));
            }

            const durationSec = parsed.durationSec;
            const winnersCount = parsed.winnersCount || 1;
            const prize = parsed.prize || 'gift';

            const endsAt = Date.now() + (durationSec * 1000);

            // Construct preview giveaway record
            const dummyGw = {
                id: 0,
                prize,
                host_id: message.author.id,
                winners_count: winnersCount,
                ends_at: endsAt,
                image_url: null,
                requirement: null
            };

            const payload = GiveawayHelper.buildPayload(dummyGw, 0, false);
            const sentMessage = await message.channel.send(payload.embedFallback);

            // Save to SQLite
            const created = await db.createGiveaway({
                messageId: sentMessage.id,
                channelId: message.channel.id,
                guildId: message.guild.id,
                hostId: message.author.id,
                prize,
                winnersCount,
                endsAt
            });

            // Re-render button customId with actual SQLite giveaway ID
            if (created && created.id) {
                const updatedPayload = GiveawayHelper.buildPayload(created, 0, false);
                try {
                    await sentMessage.edit(updatedPayload.componentsV2);
                } catch (_) {
                    await sentMessage.edit(updatedPayload.embedFallback).catch(() => {});
                }
            }

            // Start global worker if not already running
            GiveawayHelper.startWorker(message.client);

            try {
                if (message.deletable) await message.delete().catch(() => {});
            } catch (_) {}

            return;
        }

        // Fallback: unknown subcommand guard
        if (sub) {
            const valid = ['start', 'cancel', 'list', 'requirement', 'reroll'];
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
                    embeds: [build.say(message.author, `did you mean \`,giveaway ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,giveaway <start|cancel|list|requirement|reroll>\`\n-# type \`,giveaway\` for the interactive help guide.`)]
            });
        }

        return await build.help(message, this);
    }
}

module.exports = GiveawayCommand;
