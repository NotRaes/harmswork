const {
    PermissionFlagsBits,
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
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const InvokeHelper = require('../../structures/utils/helpers/invokehelper.js');
const EmbedCommand = require('../utility/embed.js');

class InvokeCommand {
    constructor() {
        this.name = 'invoke';
        this.aliases = ['invokeresponse', 'modresponse', 'modinvoke'];
        this.description = 'customize public messages and direct messages sent for moderation actions.';
        this.syntax = ',invoke <action> <message|dm> [response] or ,invoke <list|variables|reset>';
        this.example = ',invoke warn message {user.mention}: You have been **warned** for: **{reason}**.\n' +
                       ',invoke warn dm You have been warned for **{reason}**.\n' +
                       ',invoke warn message {embed}$v{color: #FFFFFF}$v{title: Warning}$v{description: {user.mention} has been warned for **{reason}**.}$v{footer: {guild.name} - {user.id}}\n' +
                       ',invoke warn message\n' +
                       ',invoke warn reset\n' +
                       ',invoke list';
        this.category = 'moderation';
        this.permissions = ['ManageGuild'];
        this.cooldown = 2;
        this.subcommands = [
            'invoke warn <message|dm> [response]',
            'invoke jail <message|dm> [response]',
            'invoke unjail <message|dm> [response]',
            'invoke kick <message|dm> [response]',
            'invoke ban <message|dm> [response]',
            'invoke unban <message|dm> [response]',
            'invoke timeout <message|dm> [response]',
            'invoke untimeout <message|dm> [response]',
            'invoke softban <message|dm> [response]',
            'invoke hardban <message|dm> [response]',
            'invoke list',
            'invoke reset [action] [type]',
            'invoke variables'
        ];
        this.subcommandDetails = {
            warn: {
                description: 'customize public message or dm for warning infractions.',
                syntax: ',invoke warn <message|dm> [response]',
                example: ',invoke warn message {user.mention}: you have been **warned** for: **{reason}**.'
            },
            jail: {
                description: 'customize public message or dm for jail actions.',
                syntax: ',invoke jail <message|dm> [response]',
                example: ',invoke jail message {embed}$v{title: ✦ jailed}$v{description: • reason: {reason}}$v{footer: {guild.name}}'
            },
            unjail: {
                description: 'customize public message or dm for unjail actions.',
                syntax: ',invoke unjail <message|dm> [response]',
                example: ',invoke unjail message {user.mention} has been released from jail.'
            },
            kick: {
                description: 'customize public message or dm for kick actions.',
                syntax: ',invoke kick <message|dm> [response]',
                example: ',invoke kick message {user.mention} was kicked for: **{reason}**.'
            },
            ban: {
                description: 'customize public message or dm for ban infractions.',
                syntax: ',invoke ban <message|dm> [response]',
                example: ',invoke ban message {embed}$v{title: banned}$v{description: {user.name} was banned for **{reason}**.}'
            },
            unban: {
                description: 'customize public message or dm for unban actions.',
                syntax: ',invoke unban <message|dm> [response]',
                example: ',invoke unban message {user.mention} was unbanned.'
            },
            timeout: {
                description: 'customize public message or dm for timeout/mute actions.',
                syntax: ',invoke timeout <message|dm> [response]',
                example: ',invoke timeout message {user.mention} was timed out for {duration}: **{reason}**.'
            },
            untimeout: {
                description: 'customize public message or dm for untimeout/unmute actions.',
                syntax: ',invoke untimeout <message|dm> [response]',
                example: ',invoke untimeout message {user.mention} timeout removed.'
            },
            softban: {
                description: 'customize public message or dm for softban actions.',
                syntax: ',invoke softban <message|dm> [response]',
                example: ',invoke softban message {user.name} was softbanned.'
            },
            hardban: {
                description: 'customize public message or dm for hardban actions.',
                syntax: ',invoke hardban <message|dm> [response]',
                example: ',invoke hardban message {user.name} was permanently hardbanned.'
            },
            list: {
                description: 'view all custom moderation invoke responses active in this server.',
                syntax: ',invoke list',
                example: ',invoke list'
            },
            reset: {
                description: 'reset a custom invoke response or all responses back to default.',
                syntax: ',invoke reset [action] [message|dm]',
                example: ',invoke reset warn message\n,invoke reset all'
            },
            variables: {
                description: 'view all dynamic variables and formatting syntax supported by invoke.',
                syntax: ',invoke variables',
                example: ',invoke variables'
            }
        };
    }

    renderHubView(tab, message, guildInvokes = [], isEnded = false) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const prefix = (message.client?.db?.getGuildPrefix)
            ? (message.client.db.getGuildPrefix(message.guild.id) || config.prefix || ',')
            : (config.prefix || ',');
        const guildIcon = message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const bannerAtt = build.getAssetAttachment('moderation.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`invoke_hub_overview_${message.id}`)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('overview')
                .setDisabled(isEnded || tab === 'overview'),
            new ButtonBuilder()
                .setCustomId(`invoke_hub_list_${message.id}`)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('configurations')
                .setDisabled(isEnded || tab === 'list'),
            new ButtonBuilder()
                .setCustomId(`invoke_hub_vars_${message.id}`)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('variables')
                .setDisabled(isEnded || tab === 'vars'),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('support')
                .setEmoji('<:discord_logo:1529300434374758481>')
                .setURL(supportUrl)
        );

        let content = '';

        if (tab === 'list') {
            if (!guildInvokes || guildInvokes.length === 0) {
                content = [
                    `### [invoke configurations](${supportUrl})`,
                    `-# customizable moderation responses configured for this server.\n`,
                    `*no custom moderation invoke responses configured for this server.*`,
                    `-# use \`${prefix}invoke <action> <message|dm> <response>\` to add one.`
                ].join('\n');
            } else {
                const grouped = {};
                for (const item of guildInvokes) {
                    if (!grouped[item.action]) grouped[item.action] = {};
                    grouped[item.action][item.type] = item.content;
                }

                const lines = Object.entries(grouped).map(([act, types]) => {
                    const parts = [];
                    if (types.message) {
                        const snippet = types.message.length > 60 ? types.message.slice(0, 57) + '...' : types.message;
                        parts.push(`-# • **message:** \`${snippet.replace(/`/g, "'")}\``);
                    }
                    if (types.dm) {
                        const snippet = types.dm.length > 60 ? types.dm.slice(0, 57) + '...' : types.dm;
                        parts.push(`-# • **dm:** \`${snippet.replace(/`/g, "'")}\``);
                    }
                    return `**${act}**\n${parts.join('\n')}`;
                });

                content = [
                    `### [invoke configurations](${supportUrl})`,
                    `-# customizable moderation responses configured for this server.\n`,
                    lines.join('\n\n'),
                    `\n-# reset any action with \`${prefix}invoke <action> reset\`.`
                ].join('\n');
            }
        } else if (tab === 'vars') {
            content = [
                `### [invoke variables & syntax](${supportUrl})`,
                `-# dynamic placeholders and embed parameters for moderation responses.\n`,
                `**user placeholders**`,
                `-# • \`{user}\` / \`{user.mention}\` ─ real user mention`,
                `-# • \`{user.name}\` / \`{user.tag}\` / \`{user.id}\` ─ user identity`,
                `-# • \`{user.avatar}\` / \`{user.display_avatar}\` ─ avatar url`,
                `-# • \`{user.top_role}\` / \`{user.role_list}\` ─ role parameters\n`,
                `**moderator & punishment**`,
                `-# • \`{moderator}\` / \`{moderator.mention}\` / \`{moderator.name}\` ─ moderator identity`,
                `-# • \`{reason}\` ─ punishment reason`,
                `-# • \`{action}\` ─ moderation action name`,
                `-# • \`{duration}\` ─ infraction duration`,
                `-# • \`{case}\` / \`{case.id}\` ─ case number\n`,
                `**server & embed formatting**`,
                `-# • \`{guild.name}\` / \`{guild.count}\` / \`{guild.icon}\` ─ server metrics`,
                `-# • \`{embed}$v{color: #FFFFFF}$v{title: Title}$v{description: Description}$v{footer: Text}\``
            ].join('\n');
        } else {
            // Default Overview
            const configuredCount = guildInvokes ? guildInvokes.length : 0;
            content = [
                `### [moderation invoke system](${supportUrl})`,
                `-# customize automated public messages and direct messages for moderation infractions.\n`,
                `**configured responses** · \`${configuredCount}\` active`,
                `**supported actions** · \`warn\`, \`jail\`, \`unjail\`, \`kick\`, \`ban\`, \`unban\`, \`timeout\`, \`softban\`, \`hardban\`\n`,
                `**quickstart commands**:`,
                `-# • \`${prefix}invoke <action> message <response>\` ─ set public in-channel response`,
                `-# • \`${prefix}invoke <action> dm <response>\` ─ set direct message response`,
                `-# • \`${prefix}invoke <action> reset\` ─ restore default response`,
                `-# • \`${prefix}invoke list\` ─ view server invoke configurations`,
                `-# • \`${prefix}invoke variables\` ─ view all dynamic variables`
            ].join('\n');
        }

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

        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(row);

        const fallbackEmbed = new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setThumbnail(guildIcon)
            .setDescription(content);
        if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

        return { container, files, row, fallbackEmbed };
    }

    async execute(message, args = []) {
        if (!message.guild) {
            return message.reply({ embeds: [build.warn(message.author, 'this command can only be used in a server.')] });
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the Manage Server permission to configure invoke responses.')] });
        }

        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const prefix = (db.getGuildPrefix)
            ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',')
            : (config.prefix || ',');

        // 1. Interactive Hub (No arguments)
        if (!args.length) {
            const guildInvokes = await db.getGuildInvokes(message.guild.id);
            let currentTab = 'overview';
            const initial = this.renderHubView(currentTab, message, guildInvokes);

            const replyMsg = await message.reply({
                embeds: [initial.fallbackEmbed],
                components: [initial.row],
                files: initial.files
            }).catch(() => null);

            if (!replyMsg) return;

            const collector = replyMsg.createMessageComponentCollector({
                time: 60000
            });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({
                        content: 'only the command author can control this menu.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                if (i.customId.startsWith('invoke_hub_overview_')) {
                    currentTab = 'overview';
                } else if (i.customId.startsWith('invoke_hub_list_')) {
                    currentTab = 'list';
                } else if (i.customId.startsWith('invoke_hub_vars_')) {
                    currentTab = 'vars';
                }

                const updatedInvokes = await db.getGuildInvokes(message.guild.id);
                const updated = this.renderHubView(currentTab, message, updatedInvokes);

                await i.update({
                    embeds: [updated.fallbackEmbed],
                    components: [updated.row],
                    files: updated.files
                }).catch(() => {});
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'deleted' || reason === 'messageDelete') return;
                try {
                    const finalInvokes = await db.getGuildInvokes(message.guild.id);
                    const finalRender = this.renderHubView(currentTab, message, finalInvokes, true);
                    await replyMsg.edit({
                        embeds: [finalRender.fallbackEmbed],
                        components: [finalRender.row]
                    }).catch(() => {});
                } catch (_) {}
            });

            return;
        }

        const sub0 = args[0].toLowerCase();
        const sub1 = (args[1] || '').toLowerCase();

        // 2. View Configurations (,invoke list)
        if (sub0 === 'list' || sub0 === 'show' || sub0 === 'configs') {
            const guildInvokes = await db.getGuildInvokes(message.guild.id);
            if (!guildInvokes || guildInvokes.length === 0) {
                return message.reply({ embeds: [build.say(message.author, `no custom moderation invoke responses configured for this server. use \`${prefix}invoke <action> <message|dm> <response>\` to add one.`)] });
            }

            const initial = this.renderHubView('list', message, guildInvokes);
            try {
                return await message.reply({
                    components: [initial.container],
                    files: initial.files,
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                return await message.reply({
                    embeds: [initial.fallbackEmbed],
                    components: [initial.row],
                    files: initial.files
                });
            }
        }

        // 3. View Variables & Cheatsheet (,invoke variables)
        if (sub0 === 'variables' || sub0 === 'vars' || sub0 === 'placeholders' || sub0 === 'help') {
            const initial = this.renderHubView('vars', message, []);
            try {
                return await message.reply({
                    components: [initial.container],
                    files: initial.files,
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                return await message.reply({
                    embeds: [initial.fallbackEmbed],
                    components: [initial.row],
                    files: initial.files
                });
            }
        }

        // 4. Reset Configurations (,invoke reset <action> or ,invoke <action> reset)
        if (sub0 === 'reset') {
            const targetAction = args[1] ? args[1].toLowerCase() : null;
            if (!targetAction || targetAction === 'all') {
                await db.clearGuildInvokes(message.guild.id);
                return message.reply({ embeds: [build.approved(message.author, 'all custom moderation invoke responses have been reset to default.')] });
            }

            const normAction = InvokeHelper.normalizeAction(targetAction);
            if (!normAction) {
                return message.reply({
                    embeds: [build.warn(message.author, `unknown action \`${targetAction}\`. valid actions: ${InvokeHelper.VALID_ACTIONS.map(a => `\`${a}\``).join(', ')}`)]
                });
            }

            const type = (args[2] || '').toLowerCase();
            if (type === 'message' || type === 'dm') {
                await db.deleteInvoke(message.guild.id, normAction, type);
                return message.reply({ embeds: [build.approved(message.author, `reset **${normAction}** **${type}** invoke response to default.`)] });
            }

            await db.deleteInvoke(message.guild.id, normAction);
            return message.reply({ embeds: [build.approved(message.author, `reset all **${normAction}** invoke responses (message and dm) to default.`)] });
        }

        if (sub1 === 'reset') {
            const normAction = InvokeHelper.normalizeAction(sub0);
            if (!normAction) {
                return message.reply({
                    embeds: [build.warn(message.author, `unknown action \`${sub0}\`. valid actions: ${InvokeHelper.VALID_ACTIONS.map(a => `\`${a}\``).join(', ')}`)]
                });
            }

            const type = (args[2] || '').toLowerCase();
            if (type === 'message' || type === 'dm') {
                await db.deleteInvoke(message.guild.id, normAction, type);
                return message.reply({ embeds: [build.approved(message.author, `reset **${normAction}** **${type}** invoke response to default.`)] });
            }

            await db.deleteInvoke(message.guild.id, normAction);
            return message.reply({ embeds: [build.approved(message.author, `reset all **${normAction}** invoke responses (message and dm) to default.`)] });
        }

        // 5. Setting or Editing an Invoke Response (,invoke <action> [message|dm] [response])
        const normAction = InvokeHelper.normalizeAction(sub0);
        if (!normAction) {
            return message.reply({
                embeds: [build.warn(message.author, `unknown action \`${sub0}\`. valid actions: ${InvokeHelper.VALID_ACTIONS.map(a => `\`${a}\``).join(', ')}`)]
            });
        }

        // A. If no response type was specified (e.g. ,invoke warn)
        if (!sub1) {
            const bannerAtt = build.getAssetAttachment('moderation.png') || build.getAssetAttachment('banner.png');
            const files = bannerAtt ? [bannerAtt] : [];
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`inv_pick_msg_${normAction}_${message.id}`)
                    .setLabel('in-channel message')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`inv_pick_dm_${normAction}_${message.id}`)
                    .setLabel('direct message (dm)')
                    .setStyle(ButtonStyle.Secondary)
            );

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [invoke embed builder: ${normAction}](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                        `-# choose which moderation response to build for **${normAction}**:`
                    )
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png'));
            container.addSectionComponents(section);

            if (bannerAtt) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`))
                );
            }

            container
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addActionRowComponents(row);

            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(`### [invoke embed builder: ${normAction}](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n-# choose which moderation response to build for **${normAction}**:`);
            const promptMsg = await message.reply({ embeds: [fallbackEmbed], components: [row] }).catch(() => null);

            if (!promptMsg) return;

            const collector = promptMsg.createMessageComponentCollector({
                time: 30000
            });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: 'only the command author can select an option.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                collector.stop('selected');
                const chosenType = i.customId.includes('_msg_') ? 'message' : 'dm';
                await promptMsg.delete().catch(() => {});

                const existing = await db.getInvoke(message.guild.id, normAction, chosenType);
                const state = existing
                    ? InvokeHelper.invokeStringToState(existing.content, normAction, chosenType)
                    : InvokeHelper.createDefaultActionState(normAction, chosenType);

                const embedCmd = new EmbedCommand();
                return embedCmd.launchEditor(message, state, { action: normAction, type: chosenType });
            });
            return;
        }

        let type = sub1;
        if (type === 'embed' || type === 'builder') {
            type = 'message';
        }

        if (type !== 'message' && type !== 'dm') {
            return message.reply({
                embeds: [build.warn(message.author, `invalid response type \`${type}\`. specify \`message\` (in-channel) or \`dm\` (direct message).\nsyntax: \`${prefix}invoke ${normAction} <message|dm> [response]\``)]
            });
        }

        const rawResponse = args.slice(2).join(' ').trim();

        // B. If code is NOT provided: launch Harm's Embed Builder directly on it!
        if (!rawResponse) {
            const existing = await db.getInvoke(message.guild.id, normAction, type);
            const state = existing
                ? InvokeHelper.invokeStringToState(existing.content, normAction, type)
                : InvokeHelper.createDefaultActionState(normAction, type);

            const embedCmd = new EmbedCommand();
            return embedCmd.launchEditor(message, state, { action: normAction, type });
        }

        // C. If code IS provided: save directly into SQLite WAL & cache
        await db.setInvoke(message.guild.id, normAction, type, rawResponse);
        return message.reply({
            embeds: [build.approved(message.author, `configured custom **${normAction}** **${type}** response.`)]
        });
    }
}

module.exports = InvokeCommand;
