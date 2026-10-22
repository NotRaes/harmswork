const {
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const { renderFakeMessage } = require('../../structures/utils/helpers/fakemessagegenerator.js');
const { sendFreebiePrompt } = require('../../structures/utils/helpers/freebieprompt.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function getFmEmojis() {
    const e = config.emojis || {};
    return {
        builder: e.emb_builder || '<:harm_premium:1558810882795114536>',
        card: e.emb_json || '<a:card:1555845967381528586>',
        user: e.emb_author || '<:idcard:1558818721156567040>',
        text: e.emb_desc || '<:harm_desc:1559895590362419301>',
        theme: e.emb_color || '<:coin:1558818714055479421>',
        options: e.emb_title || '<:renamevc:1558818794728591512>',
        image: e.emb_images || '<:gift:1558198880296898630>',
        send: e.emb_send || '<:transfervc:1558818808351952898>',
        channel: e.emb_channel || '<:revealvc:1558818801930477709>',
        discard: e.emb_discard || '<:rejectvc:1558818788332273754>'
    };
}

function buildFmContainer(state, disabled = false) {
    const em = getFmEmojis();
    const container = new ContainerBuilder();
    container.setAccentColor(typeof config.colors.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors.c || 0x0A0A0C));

    // Header Section
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${em.builder} **fakemessage builder**\n` +
                    `-# customize your simulated discord message. click generate when ready.`
                )
            )
    );

    // 1. User
    const targetTag = state.targetUser ? (state.targetUser.tag || state.targetUser.username) : 'harm';
    const clanPart = state.customTag ? ` [${state.customTag}]` : '';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${em.user} **target author**\n` +
                    `-# <@${state.targetUser.id}> (\`${targetTag}\`)${clanPart}`
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fm_btn_edit_user')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 2. Message Text
    const textSnippet = state.text
        ? (state.text.length > 55 ? state.text.slice(0, 52).replace(/\n/g, ' ') + '...' : state.text.replace(/\n/g, ' '))
        : '*no message body*';
    const imgPart = state.attachmentUrl ? ' · `[has image]`' : '';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${em.text} **message content**\n` +
                    `-# ${textSnippet}${imgPart}`
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fm_btn_edit_text')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 3. Theme & Font
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${em.theme} **style & typography**\n` +
                    `-# theme: \`${state.theme}\` · font: \`${state.font}\``
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fm_btn_edit_theme')
                    .setLabel('cycle theme')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 4. Options
    const optParts = [];
    if (state.highlight) optParts.push('highlight');
    if (state.useUsername) optParts.push('use username');
    if (state.hideClan) optParts.push('hide clan');
    const optSummary = optParts.length > 0 ? optParts.join(', ') : 'standard defaults';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${em.options} **options**\n` +
                    `-# ${optSummary}`
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fm_btn_toggle_highlight')
                    .setLabel(state.highlight ? 'unhighlight' : 'highlight')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // Separator
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    // Bottom Action Row
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fm_act_send_here')
            .setLabel('generate & send')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(em.send)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('fm_act_send_to')
            .setLabel('send to...')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(em.channel)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('fm_act_discard')
            .setLabel('discard')
            .setStyle(ButtonStyle.Danger)
            .setEmoji(em.discard)
            .setDisabled(disabled)
    );

    container.addActionRowComponents(row);
    return container;
}

class GenerateCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'generate';
        this.aliases = ['gen', 'fakemessage', 'fm', 'fake', 'qr'];
        this.description = 'interactive visual generator for fake messages, quotes, and qr codes.';
        this.syntax = ',generate fakemessage [@user] [text]\n,generate qr <text>\n,generate quote [@user] [text]';
        this.example = ',generate fakemessage @user hello world\n,generate qr https://discord.gg/harm\n,generate quote @user legendary words';
        this.category = 'utility';
        this.cooldown = 3;
        this.permissions = [];
        this.noAutoDelete = true;
        this.nonDisableable = true;
        this.subcommands = [
            'generate fakemessage [@user] [text]',
            'generate qr <text>',
            'generate quote [@user] [text]'
        ];
        this.subcommandDetails = {
            fakemessage: {
                description: 'generate an authentic discord message simulator.',
                syntax: ',gen fakemessage [@user] [text]',
                example: ',gen fm @user hello'
            },
            qr: {
                description: 'generate an aesthetic qr code image from text or url.',
                syntax: ',gen qr <text_or_url>',
                example: ',gen qr https://discord.gg/harm'
            },
            quote: {
                description: 'generate an aesthetic quote image.',
                syntax: ',gen quote [@user] [text]',
                example: ',gen quote @user nice words'
            }
        };
    }

    async execute(message, args, commandName) {
        let effectiveArgs = [...args];
        if (commandName) {
            const invoked = commandName.toLowerCase();
            if (['fakemessage', 'fm', 'fake'].includes(invoked)) {
                effectiveArgs = ['fakemessage', ...args];
            } else if (['quote', 'q'].includes(invoked)) {
                effectiveArgs = ['quote', ...args];
            } else if (invoked === 'qr') {
                effectiveArgs = ['qr', ...args];
            }
        }

        const sub = effectiveArgs[0]?.toLowerCase().replace(/[,;]+$/, '');
        const isFm = sub === 'fakemessage' || sub === 'fm' || sub === 'fake' || sub === 'message' || sub === 'msg';
        const isQuote = sub === 'quote' || sub === 'q';
        const isQr = sub === 'qr' || sub === 'qrcode';

        if (isQuote) {
            const { executeQuoteCommand } = require('../../structures/utils/helpers/quotecommandhelper.js');
            return await executeQuoteCommand(message, effectiveArgs.slice(1));
        }

        if (isQr) {
            return await this.handleQRCode(message, effectiveArgs.slice(1));
        }

        if (!sub || isFm) {
            const subArgs = isFm ? effectiveArgs.slice(1) : effectiveArgs;
            return await this.handleFakeMessage(message, subArgs);
        }

        return build.help(message, this);
    }

    async handleFakeMessage(message, args) {
        const isOwner = config.owners?.includes(message.author.id);
        const supportGuildId = config.supportGuildId || '1555845452790767677';
        const supportInvite = config.supportInvite || 'https://discord.gg/eqwcPU2mfS';

        // 1. Owner bypasses all freebie limits completely
        if (!isOwner) {
            let isInSupport = false;
            const supportGuild = message.client.guilds.cache.get(supportGuildId) || await message.client.guilds.fetch(supportGuildId).catch(() => null);
            if (supportGuild) {
                const member = supportGuild.members.cache.get(message.author.id) || await supportGuild.members.fetch(message.author.id).catch(() => null);
                if (member) isInSupport = true;
            }

            if (!isInSupport) {
                const db = message.client.db;
                const currentUses = await db.getCommandUses(message.author.id, 'fakemessage');
                if (currentUses >= 2) {
                    return await sendFreebiePrompt(message, {
                        title: 'do you like freebies?',
                        featureText: 'you also get commands like `,generate fakemessage` for **free** by joining the server.',
                        note: `***__note:__*** you have used all **2/2** free uses of \`,generate fakemessage\`. join our **[discord server](${supportInvite})** to unlock unlimited uses!`,
                        maxUses: 2,
                        featureName: '`,generate fakemessage`'
                    });
                }
                const newUses = await db.incrementCommandUses(message.author.id, 'fakemessage');
                await sendFreebiePrompt(message, {
                    title: 'do you like freebies?',
                    featureText: 'you also get commands like `,generate fakemessage` for **free** by joining the server.',
                    note: `***__note:__*** you have used **${newUses}/2** free uses of \`,generate fakemessage\`. join our **[discord server](${supportInvite})** for unlimited uses.`,
                    maxUses: 2,
                    featureName: '`,generate fakemessage`'
                });
            }
        }

        // 2. Parse targetUser and initial text
        let targetUser = message.author;
        let startIndex = 0;
        if (args.length > 0) {
            const firstArg = args[0].replace(/[,;]+$/, '');
            const mentionMatch = firstArg.match(/^<@!?(\d+)>$/);
            const idMatch = firstArg.match(/^\d{17,20}$/);

            if (mentionMatch || idMatch) {
                const targetId = mentionMatch ? mentionMatch[1] : idMatch[0];
                const fetched = await message.client.users.fetch(targetId).catch(() => null);
                if (fetched) {
                    targetUser = fetched;
                    startIndex = 1;
                }
            } else if (firstArg.startsWith('@') || message.guild) {
                const searchName = firstArg.startsWith('@') ? firstArg.slice(1).toLowerCase() : firstArg.toLowerCase();
                if (message.guild && searchName.length > 0) {
                    const member = message.guild.members.cache.find(m =>
                        m.user.username.toLowerCase() === searchName ||
                        m.displayName.toLowerCase() === searchName
                    );
                    if (member) {
                        targetUser = member.user;
                        startIndex = 1;
                    }
                }
            }
        }

        let attachmentUrl = null;
        if (message.attachments && message.attachments.size > 0) {
            const firstAtt = message.attachments.first();
            if (firstAtt.contentType && firstAtt.contentType.startsWith('image/')) {
                attachmentUrl = firstAtt.url;
            }
        }

        const initialText = args.slice(startIndex).join(' ').trim() || 'hello from harm.';

        const state = {
            targetUser,
            targetMember: message.guild?.members.cache.get(targetUser.id) || null,
            text: initialText,
            theme: 'Dark',
            font: 'gg sans',
            highlight: false,
            useUsername: false,
            hideClan: false,
            customTag: null,
            customTimestamp: null,
            reactions: null,
            reply: null,
            attachmentUrl
        };

        // 3. Prompt the Interactive Fakemessage Builder
        return await this.launchBuilder(message, state);
    }

    async launchBuilder(message, state) {
        const container = buildFmContainer(state, false);

        let sentMsg;
        try {
            sentMsg = await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### fakemessage builder\n` +
                    `-# **author:** <@${state.targetUser.id}>\n` +
                    `-# **text:** \`${state.text.slice(0, 100)}\`\n` +
                    `-# **theme:** \`${state.theme}\` · **font:** \`${state.font}\``
                );
            sentMsg = await message.reply({ embeds: [fallbackEmbed] });
        }

        if (!sentMsg) return;

        const collector = sentMsg.createMessageComponentCollector({
            time: 90000
        });

        const themesList = ['Dark', 'Light', 'Ash', 'Onyx', 'Black'];

        const updateView = async (interaction = null) => {
            const updated = buildFmContainer(state, false);
            if (interaction && !interaction.replied && !interaction.deferred) {
                try {
                    return await interaction.update({
                        components: [updated],
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch (_) {}
            }
            await sentMsg.edit({
                components: [updated]
            }).catch(() => {});
        };

        const renderCanvasBuffer = async () => {
            const targetMember = message.guild?.members.cache.get(state.targetUser.id) || state.targetMember;
            const displayName = targetMember ? targetMember.displayName : (state.targetUser.globalName || state.targetUser.username);
            const roleColor = (targetMember && targetMember.displayHexColor !== '#000000') ? targetMember.displayHexColor : null;
            let clanTag = state.customTag;
            if (!clanTag && !state.hideClan && targetMember?.user?.clan) {
                clanTag = targetMember.user.clan.tag;
            }

            return await renderFakeMessage({
                text: state.text,
                user: {
                    username: state.targetUser.username,
                    displayName,
                    avatarURL: state.targetUser.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true }),
                    roleColor,
                    clanTag
                },
                theme: state.theme,
                display_font: state.font,
                image: state.attachmentUrl,
                timestamp: state.customTimestamp,
                mention_highlight: state.highlight,
                reactions: state.reactions,
                togif: false,
                use_username: state.useUsername,
                hide_clantags: state.hideClan,
                reply: state.reply
            });
        };

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command author can control this fakemessage builder.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            collector.resetTimer?.();
            const cid = i.customId;

            // 1. Discard
            if (cid === 'fm_act_discard') {
                collector.stop('discarded');
                return sentMsg.delete().catch(() => {});
            }

            // 2. Cycle Theme
            if (cid === 'fm_btn_edit_theme') {
                const currentIdx = themesList.indexOf(state.theme);
                state.theme = themesList[(currentIdx + 1) % themesList.length];
                return updateView(i);
            }

            // 3. Toggle Highlight
            if (cid === 'fm_btn_toggle_highlight') {
                state.highlight = !state.highlight;
                return updateView(i);
            }

            // 4. Edit Text Modal
            if (cid === 'fm_btn_edit_text') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`fm_modal_text_${ts}`)
                    .setTitle('edit simulated message');

                const textInput = new TextInputBuilder()
                    .setCustomId('fm_text_val')
                    .setLabel('message content')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.text || '')
                    .setRequired(true);

                const imgInput = new TextInputBuilder()
                    .setCustomId('fm_img_val')
                    .setLabel('attachment image url (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.attachmentUrl || '')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(textInput),
                    new ActionRowBuilder().addComponents(imgInput)
                );

                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `fm_modal_text_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    state.text = submit.fields.getTextInputValue('fm_text_val').trim();
                    const rawImg = submit.fields.getTextInputValue('fm_img_val').trim();
                    state.attachmentUrl = rawImg || null;

                    return updateView(submit);
                } catch {
                    return;
                }
            }

            // 5. Edit User Modal
            if (cid === 'fm_btn_edit_user') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`fm_modal_user_${ts}`)
                    .setTitle('change target user');

                const userInput = new TextInputBuilder()
                    .setCustomId('fm_user_val')
                    .setLabel('user id or mention')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.targetUser?.id || '')
                    .setRequired(true);

                const tagInput = new TextInputBuilder()
                    .setCustomId('fm_tag_val')
                    .setLabel('custom clan tag (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.customTag || '')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userInput),
                    new ActionRowBuilder().addComponents(tagInput)
                );

                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `fm_modal_user_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    const rawUser = submit.fields.getTextInputValue('fm_user_val').replace(/[<@!>]/g, '').trim();
                    const rawTag = submit.fields.getTextInputValue('fm_tag_val').trim();

                    const fetched = await message.client.users.fetch(rawUser).catch(() => null);
                    if (fetched) {
                        state.targetUser = fetched;
                        state.targetMember = message.guild?.members.cache.get(fetched.id) || null;
                    }
                    state.customTag = rawTag || null;

                    return updateView(submit);
                } catch {
                    return;
                }
            }

            // 6. Generate & Send Here
            if (cid === 'fm_act_send_here') {
                await i.deferUpdate().catch(() => {});
                collector.stop('generated');

                try {
                    const result = await renderCanvasBuffer();
                    const fileAttachment = new AttachmentBuilder(result.buffer, { name: result.filename });
                    await sentMsg.delete().catch(() => {});
                    return await message.channel.send({ files: [fileAttachment] });
                } catch (err) {
                    console.error('[Generate Fakemessage Error]:', err);
                    return message.channel.send({
                        embeds: [build.deny(message.author, 'failed to generate the simulated message.')]
                    });
                }
            }

            // 7. Send To Channel
            if (cid === 'fm_act_send_to') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`fm_modal_sendto_${ts}`)
                    .setTitle('send to channel');

                const chanInput = new TextInputBuilder()
                    .setCustomId('chan_id')
                    .setLabel('channel mention or id')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(chanInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `fm_modal_sendto_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    const rawChan = submit.fields.getTextInputValue('chan_id').replace(/[<#>]/g, '').trim();
                    const targetChan = message.guild.channels.cache.get(rawChan);

                    if (!targetChan || !targetChan.isTextBased()) {
                        return submit.reply({
                            embeds: [build.deny(message.author, 'target channel not found or is not text based.')],
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    await submit.deferUpdate().catch(() => {});
                    collector.stop('sent_to');

                    const result = await renderCanvasBuffer();
                    const fileAttachment = new AttachmentBuilder(result.buffer, { name: result.filename });
                    await targetChan.send({ files: [fileAttachment] });
                    await sentMsg.delete().catch(() => {});
                    return message.channel.send({
                        embeds: [build.approved(message.author, `dispatched simulated message into <#${targetChan.id}>.`)]
                    });
                } catch {
                    return;
                }
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'discarded' || reason === 'generated' || reason === 'sent_to') return;
            try {
                const disabled = buildFmContainer(state, true);
                if (sentMsg.editable) {
                    await sentMsg.edit({ components: [disabled] }).catch(() => {});
                }
            } catch (_) {}
        });
    }

    async handleQRCode(message, args) {
        const text = args.join(' ').trim();
        if (!text) {
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,gen qr <text_or_url>`\n-# example: `,gen qr https://discord.gg/harm`')]
            });
        }

        if (text.length > 2048) {
            return message.reply({
                embeds: [build.warn(message.author, 'text is too long (maximum 2,048 characters).')]
            });
        }

        try {
            const QRCode = require('qrcode');
            const qrBuffer = await QRCode.toBuffer(text, {
                type: 'png',
                width: 480,
                margin: 2,
                errorCorrectionLevel: 'M',
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            const attachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });
            const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
            const displaySnippet = text.length > 90 ? text.slice(0, 87) + '...' : text;
            const isUrl = /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(text);

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### [qr code](${supportUrl})\n` +
                    `-# encoded text: \`${displaySnippet}\``
                )
            );

            const container = new ContainerBuilder()
                .addSectionComponents(section)
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL('attachment://qrcode.png')
                    )
                );

            const components = [];
            let row = null;
            if (isUrl) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel('open link')
                        .setURL(text)
                );
                container.addActionRowComponents(row);
                components.push(row);
            }

            try {
                return await message.reply({
                    components: [container],
                    files: [attachment],
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors.c || '#0A0A0C')
                    .setTitle('qr code')
                    .setDescription(`-# encoded text: \`${displaySnippet}\``)
                    .setImage('attachment://qrcode.png');

                const replyOpts = { embeds: [fallbackEmbed], files: [attachment] };
                if (components.length > 0) replyOpts.components = components;
                return await message.reply(replyOpts);
            }
        } catch (err) {
            return message.reply({
                embeds: [build.deny(message.author, `failed to generate qr code: ${err.message}`)]
            });
        }
    }
}

module.exports = GenerateCommand;
