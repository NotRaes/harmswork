const {
    EmbedBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const EmbedParser = require('../../structures/utils/helpers/embedparser.js');
const InvokeHelper = require('../../structures/utils/helpers/invokehelper.js');

function createDefaultState(name = null) {
    return {
        savedName: name || null,
        content: null,
        title: null,
        titleUrl: null,
        description: null,
        color: 'clear',
        author: null,
        images: { thumbnail: null, image: null },
        footer: null,
        fields: [],
        buttons: []
    };
}

function buildPublishedPayload(state) {
    const embed = new EmbedBuilder();
    let hasEmbedData = false;

    if (state.title) { embed.setTitle(state.title); hasEmbedData = true; }
    if (state.titleUrl) embed.setURL(state.titleUrl);
    if (state.description) { embed.setDescription(state.description); hasEmbedData = true; }

    if (state.color && state.color !== 'clear') {
        try {
            embed.setColor(state.color);
        } catch (_) {
            embed.setColor(0x0A0A0C);
        }
    } else {
        embed.setColor(0x0A0A0C);
    }

    if (state.author && state.author.name) {
        embed.setAuthor({
            name: state.author.name,
            iconURL: state.author.iconURL || null,
            url: state.author.url || null
        });
        hasEmbedData = true;
    }

    if (state.images?.thumbnail) {
        embed.setThumbnail(state.images.thumbnail);
        hasEmbedData = true;
    }

    if (state.images?.image) {
        embed.setImage(state.images.image);
        hasEmbedData = true;
    }

    if (state.footer && state.footer.text) {
        embed.setFooter({
            text: state.footer.text,
            iconURL: state.footer.iconURL || null
        });
        if (state.footer.timestamp) {
            embed.setTimestamp();
        }
        hasEmbedData = true;
    }

    if (Array.isArray(state.fields) && state.fields.length > 0) {
        for (const f of state.fields.slice(0, 25)) {
            if (f.name && f.value) {
                embed.addFields({
                    name: f.name.slice(0, 256),
                    value: f.value.slice(0, 1024),
                    inline: !!f.inline
                });
                hasEmbedData = true;
            }
        }
    }

    const payload = {};
    if (hasEmbedData) payload.embeds = [embed];
    if (state.content) payload.content = state.content;

    if (Array.isArray(state.buttons) && state.buttons.length > 0) {
        const validBtns = state.buttons.slice(0, 5).filter(b => b.label && b.url);
        if (validBtns.length > 0) {
            const row = new ActionRowBuilder();
            for (const b of validBtns) {
                const btn = new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel(b.label.slice(0, 80))
                    .setURL(b.url);
                if (b.emoji) {
                    try { btn.setEmoji(b.emoji); } catch (_) {}
                }
                row.addComponents(btn);
            }
            payload.components = [row];
        }
    }

    return payload;
}

function getEmbedEmojis() {
    const e = config.emojis || {};
    return {
        builder: e.emb_builder || '<:harm_premium:1558810882795114536>',
        json: e.emb_json || '<a:card:1555845967381528586>',
        msg: e.emb_msg || '<:channels:1558818707281547304>',
        title: e.emb_title || '<:renamevc:1558818794728591512>',
        desc: e.emb_desc || '<:harm_desc:1559895590362419301>',
        color: e.emb_color || '<:coin:1558818714055479421>',
        author: e.emb_author || '<:idcard:1558818721156567040>',
        images: e.emb_images || '<:gift:1558198880296898630>',
        footer: e.emb_footer || '<:calendar:1558818700457672778>',
        fields: e.emb_fields || '<:roles:1558818727821185074>',
        links: e.emb_links || '<:harm_link:1559895592237400084>',
        send: e.emb_send || '<:transfervc:1558818808351952898>',
        channel: e.emb_channel || '<:revealvc:1558818801930477709>',
        save: e.emb_save || '<:permitvc:1558818781382443101>',
        remove: e.emb_remove || '<:deletevc:1558818747769159680>',
        discard: e.emb_discard || '<:rejectvc:1558818788332273754>'
    };
}

function buildEditorContainer(state, disabled = false, invokeContext = null) {
    const em = getEmbedEmojis();
    const container = new ContainerBuilder();
    container.setAccentColor(0x0A0A0C);

    // 0. Header with JSON Button Accessory
    const headerTitle = invokeContext
        ? `${em.builder} **invoke builder: ${invokeContext.action} (${invokeContext.type})**`
        : `${em.builder} **embed builder**`;
    const headerSubtitle = invokeContext
        ? `customize moderation response for ${invokeContext.action} ${invokeContext.type}. click apply when done.`
        : `customize your embed below. nothing is posted until you send it.`;
    const jsonBtn = new ButtonBuilder()
        .setCustomId('emb_act_json')
        .setLabel('json')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (em.json) jsonBtn.setEmoji(em.json);

    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${headerTitle}\n` +
                `-# ${headerSubtitle}`
            )
        )
        .setButtonAccessory(jsonBtn);
    container.addSectionComponents(headerSection);

    // 1. Message text
    const msgVal = state.content
        ? (state.content.length > 55 ? state.content.slice(0, 52).replace(/\n/g, ' ') + '...' : state.content.replace(/\n/g, ' '))
        : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.msg} **message text**\n-# ${msgVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_msg')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 2. Title
    const titleVal = state.title
        ? (state.title.length > 55 ? state.title.slice(0, 52) + '...' : state.title)
        : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.title} **title**\n-# ${titleVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_title')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 3. Description
    const descVal = state.description
        ? (state.description.length > 55 ? state.description.slice(0, 52).replace(/\n/g, ' ') + '...' : state.description.replace(/\n/g, ' '))
        : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.desc} **description**\n-# ${descVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_desc')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 4. Colour
    const colVal = (state.color && state.color !== 'clear') ? state.color : 'clear, no stripe';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.color} **colour**\n-# ${colVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_color')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 5. Author
    const authorVal = state.author?.name ? state.author.name : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.author} **author**\n-# ${authorVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_author')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 6. Images
    const imgArr = [];
    if (state.images?.thumbnail) imgArr.push('thumbnail');
    if (state.images?.image) imgArr.push('image');
    const imgVal = imgArr.length > 0 ? imgArr.join(', ') : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.images} **images**\n-# ${imgVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_images')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 7. Footer
    const footerVal = state.footer?.text
        ? (state.footer.text.length > 55 ? state.footer.text.slice(0, 52) + '...' : state.footer.text)
        : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.footer} **footer**\n-# ${footerVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_footer')
                    .setLabel('edit')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 8. Fields
    const fieldVal = (state.fields && state.fields.length > 0)
        ? `${state.fields.length} field(s)`
        : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.fields} **fields**\n-# ${fieldVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_fields')
                    .setLabel(state.fields?.length > 0 ? 'edit' : 'add')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 9. Link buttons
    const btnVal = (state.buttons && state.buttons.length > 0)
        ? `${state.buttons.length} button(s)`
        : 'not set';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${em.links} **link buttons**\n-# ${btnVal}`)
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('emb_act_buttons')
                    .setLabel(state.buttons?.length > 0 ? 'edit' : 'add')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // Native Discord Separator
    container.addSeparatorComponents(
        new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small)
    );

    // Bottom Action Row with Custom Emojis
    const sendBtn = new ButtonBuilder()
        .setCustomId('emb_btn_send_here')
        .setLabel('send here')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (em.send) sendBtn.setEmoji(em.send);

    const sendToBtn = new ButtonBuilder()
        .setCustomId('emb_btn_send_to')
        .setLabel('send to...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (em.channel) sendToBtn.setEmoji(em.channel);

    const saveBtn = new ButtonBuilder()
        .setCustomId('emb_btn_save')
        .setLabel('save')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (em.save) saveBtn.setEmoji(em.save);

    const removeBtn = new ButtonBuilder()
        .setCustomId('emb_btn_remove')
        .setLabel('remove...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    if (em.remove) removeBtn.setEmoji(em.remove);

    const discardBtn = new ButtonBuilder()
        .setCustomId('emb_btn_discard')
        .setLabel('discard')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled);
    if (em.discard) discardBtn.setEmoji(em.discard);

    let rowComponents = [sendBtn, sendToBtn, saveBtn, removeBtn, discardBtn];
    if (invokeContext) {
        const applyBtn = new ButtonBuilder()
            .setCustomId('emb_btn_apply_invoke')
            .setLabel('apply to invoke')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
        if (em.approve || em.tick || config.emojis?.tick) {
            applyBtn.setEmoji(em.approve || em.tick || config.emojis?.tick);
        }
        rowComponents = [applyBtn, saveBtn, sendBtn, removeBtn, discardBtn];
    }

    const actionRow = new ActionRowBuilder().addComponents(rowComponents);

    container.addActionRowComponents(actionRow);
    return container;
}

class EmbedCommand {
    constructor() {
        this.name = 'embed';
        this.aliases = ['embeds', 'builder'];
        this.description = 'interactive visual embed builder and persistent template manager.';
        this.syntax = ',embed [create|load|list|delete] [name]';
        this.example = ',embed create';
        this.category = 'utility';
        this.cooldown = 2;
        this.permissions = [];
        this.subcommands = [
            'embed create [name]',
            'embed load <name>',
            'embed list',
            'embed delete <name>'
        ];
        this.subcommandDetails = {
            create: {
                description: 'start a new embed with an interactive editor underneath.',
                syntax: ',embed create [name]',
                example: ',embed create rules'
            },
            load: {
                description: 'open a saved embed into the interactive editor.',
                syntax: ',embed load <name>',
                example: ',embed load rules'
            },
            list: {
                description: 'view all saved embeds configured in this server.',
                syntax: ',embed list',
                example: ',embed list'
            },
            delete: {
                description: 'delete a saved embed by name.',
                syntax: ',embed delete <name>',
                example: ',embed delete rules'
            }
        };
    }

    async execute(message, args) {
        const client = message.client;
        const db = client.db;
        const sub = (args[0] || '').toLowerCase();
        const p = (message.guild && db?.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');

        // 1. Menu view if no subcommand provided (Harm Style Embed)
        if (!sub) {
            const e = config.emojis || {};
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### [harm embed builder](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                    `-# visual embed builder and server template manager.\n\n` +
                    `\`${p}embed create [name]\` ─ start a new embed with an editor underneath\n` +
                    `\`${p}embed load <name>\` ─ open a saved embed or template in the editor\n` +
                    `\`${p}embed template [name]\` ─ browse or load harm presets (welcomedm, etc.)\n` +
                    `\`${p}embed copy <name>\` ─ copy embed json to paste in other commands\n` +
                    `\`${p}embed list\` ─ every saved embed in this server\n` +
                    `\`${p}embed delete <name>\` ─ delete a saved embed`
                );
            return message.reply({ embeds: [embed] });
        }

        // 2. List saved embeds
        if (sub === 'list') {
            if (!message.guild) {
                return message.reply({ embeds: [build.deny(message.author, 'this command can only be used in a server.')] });
            }
            const savedList = await db.listEmbeds(message.guild.id);
            if (!savedList || savedList.length === 0) {
                return message.reply({ embeds: [build.warn(message.author, 'no saved embeds found for this server.')] });
            }

            const formatted = savedList.map(item => {
                const relTime = `<t:${item.updated_at}:R>`;
                return `• \`${item.name}\` — updated ${relTime} by <@${item.author_id}>`;
            }).join('\n');

            const e = config.emojis || {};
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### [saved embeds (${savedList.length})](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                    `-# stored templates configured for this server.\n\n` +
                    formatted
                );
            return message.reply({ embeds: [embed] });
        }

        // 3. Delete saved embed
        if (sub === 'delete' || sub === 'del') {
            if (!message.guild) {
                return message.reply({ embeds: [build.deny(message.author, 'this command can only be used in a server.')] });
            }
            const name = (args[1] || '').trim().toLowerCase();
            if (!name) {
                return message.reply({ embeds: [build.warn(message.author, `specify the name of the embed to delete. syntax: \`${p}embed delete <name>\``)] });
            }

            const success = await db.deleteEmbed(message.guild.id, name);
            if (!success) {
                return message.reply({ embeds: [build.deny(message.author, `no saved embed found named \`${name}\`.`)] });
            }
            return message.reply({ embeds: [build.approved(message.author, `deleted saved embed \`${name}\`.`)] });
        }

        // 4. Load saved embed or template
        if (sub === 'load') {
            const name = (args[1] || '').trim().toLowerCase();
            if (!name) {
                return message.reply({ embeds: [build.warn(message.author, `specify the embed name to load. syntax: \`${p}embed load <name>\``)] });
            }

            let loadedState = null;
            if (message.guild && db?.getEmbed) {
                const saved = await db.getEmbed(message.guild.id, name);
                if (saved && saved.parsedData) {
                    loadedState = saved.parsedData;
                    loadedState.savedName = name;
                }
            }

            if (!loadedState) {
                const tmpl = EmbedParser.getTemplate(name);
                if (tmpl) {
                    loadedState = tmpl;
                }
            }

            if (!loadedState) {
                return message.reply({ embeds: [build.deny(message.author, `no saved embed or template found named \`${name}\`.`)] });
            }

            return this.launchEditor(message, loadedState);
        }

        // 5. Create embed
        if (sub === 'create' || sub === 'new' || sub === 'edit') {
            const rawParam = args.slice(1).join(' ').trim();
            let initialState = createDefaultState();

            if (rawParam) {
                if (rawParam.startsWith('{') || rawParam.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(rawParam);
                        if (parsed && typeof parsed === 'object') {
                            initialState = {
                                ...initialState,
                                ...parsed
                            };
                        }
                    } catch (_) {
                        return message.reply({ embeds: [build.deny(message.author, 'invalid json syntax provided for embed creation.')] });
                    }
                } else {
                    const tmpl = EmbedParser.getTemplate(rawParam);
                    if (tmpl) {
                        initialState = tmpl;
                    } else {
                        initialState.savedName = rawParam.toLowerCase().replace(/\s+/g, '_');
                    }
                }
            }

            return this.launchEditor(message, initialState);
        }

        // 6. Template browser & loader
        if (sub === 'template' || sub === 'templates') {
            const tmplName = (args[1] || '').trim().toLowerCase();
            if (tmplName) {
                const tmpl = EmbedParser.getTemplate(tmplName);
                if (!tmpl) {
                    return message.reply({ embeds: [build.deny(message.author, `unknown template \`${tmplName}\`. available: \`welcomedm\`, \`welcome\`.`)] });
                }
                return this.launchEditor(message, tmpl);
            }

            const templates = EmbedParser.getTemplates();
            const lines = Object.keys(templates).map(k => `• \`${k}\` ─ \`${p}embed template ${k}\` or \`${p}embed copy ${k}\``).join('\n');
            const e = config.emojis || {};
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### [harm embed templates](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                    `-# pre-crafted aesthetic templates compatible across the bot.\n\n` +
                    `${lines}\n\n` +
                    `-# use \`${p}embed template <name>\` to edit or \`${p}embed copy <name>\` to get raw json.`
                );
            return message.reply({ embeds: [embed] });
        }

        // 7. Copy / JSON export of saved embed or template
        if (sub === 'copy' || sub === 'json' || sub === 'export' || sub === 'code') {
            const name = (args[1] || '').trim().toLowerCase();
            if (!name) {
                return message.reply({ embeds: [build.warn(message.author, `specify the embed name to copy. syntax: \`${p}embed copy <name>\``)] });
            }

            let rawJson = null;
            if (message.guild && db?.getEmbed) {
                const saved = await db.getEmbed(message.guild.id, name);
                if (saved) {
                    rawJson = saved.data || JSON.stringify(saved.parsedData, null, 2);
                }
            }

            if (!rawJson) {
                const tmpl = EmbedParser.getTemplate(name);
                if (tmpl) {
                    rawJson = JSON.stringify(tmpl, null, 2);
                }
            }

            if (!rawJson) {
                return message.reply({ embeds: [build.deny(message.author, `no saved embed or template found named \`${name}\`.`)] });
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setTitle(`embed code: ${name}`)
                .setDescription(
                    `\`\`\`json\n${rawJson.length > 3800 ? rawJson.slice(0, 3790) + '...' : rawJson}\n\`\`\`\n` +
                    `-# copy this json and paste it into any custom message command (e.g. \`${p}onjoin dm message <json>\` or simply reference \`{embed:${name}}\`).`
                );

            return message.reply({ embeds: [embed] });
        }

        const valid = ['create', 'load', 'list', 'delete', 'template', 'json'];
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

        if (best && bestDist <= 2) {
            return message.reply({
                embeds: [build.say(message.author, `did you mean \`${p}embed ${best}\`?`)]
            });
        }

        return message.reply({
            embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`. type \`${p}embed\` for available options.`)]
        });
    }

    async launchEditor(message, state, invokeContext = null) {
        const editorContainer = buildEditorContainer(state, false, invokeContext);

        const payload = {
            components: [editorContainer],
            flags: MessageFlags.IsComponentsV2
        };

        let sentMsg;
        try {
            sentMsg = await message.reply(payload);
        } catch (err) {
            console.error('[embed.js] Components V2 send failed:', err);
            return message.reply({
                embeds: [build.deny(message.author, 'failed to launch embed editor. please try again.')]
            }).catch(() => {});
        }

        const collector = sentMsg.createMessageComponentCollector({
            time: 90000
        });

        const updateEditor = async (interaction = null) => {
            const uEditor = buildEditorContainer(state, false, invokeContext);

            if (interaction && !interaction.replied && !interaction.deferred) {
                try {
                    return await interaction.update({
                        components: [uEditor],
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch (e) {
                    console.error('[embed.js] interaction.update failed, falling back to message edit:', e);
                }
            }

            try {
                await sentMsg.edit({
                    components: [uEditor]
                });
            } catch (err) {
                console.error('[embed.js] sentMsg.edit failed:', err);
            }
        };

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command author can control this embed builder.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            collector.resetTimer?.();
            const cid = i.customId;

            // --- 0. Apply to Invoke ---
            if (cid === 'emb_btn_apply_invoke' && invokeContext) {
                const invokeString = InvokeHelper.stateToInvokeString(state);
                await message.client.db.setInvoke(message.guild.id, invokeContext.action, invokeContext.type, invokeString);
                collector.stop('applied_invoke');
                await sentMsg.delete().catch(() => {});
                return i.reply({
                    embeds: [build.approved(message.author, `configured custom **${invokeContext.action}** **${invokeContext.type}** response.`)],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            // --- 1. Discard ---
            if (cid === 'emb_btn_discard') {
                collector.stop('discarded');
                return sentMsg.delete().catch(() => {});
            }

            // --- 2. Send Here ---
            if (cid === 'emb_btn_send_here') {
                const hasData = state.content || state.title || state.description || (state.fields && state.fields.length > 0) || state.images?.image || state.images?.thumbnail;
                if (!hasData) {
                    return i.reply({
                        embeds: [build.warn(message.author, 'your embed is empty. set a title, description, or content first.')],
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                collector.stop('sent');
                const outPayload = buildPublishedPayload(state);
                await message.channel.send(outPayload).catch(() => {});
                await sentMsg.delete().catch(() => {});
                return i.reply({
                    embeds: [build.approved(message.author, 'embed published successfully.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            // --- 3. Send To... ---
            if (cid === 'emb_btn_send_to') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_send_to_${ts}`)
                    .setTitle('send embed to channel');

                const chanInput = new TextInputBuilder()
                    .setCustomId('chan_id')
                    .setLabel('channel mention or id')
                    .setPlaceholder('#announcements or 123456789012345678')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(chanInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_send_to_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const rawChan = submit.fields.getTextInputValue('chan_id').trim();
                    const cleanId = rawChan.replace(/[<#>]/g, '');
                    const targetChan = message.guild.channels.cache.get(cleanId)
                        || message.guild.channels.cache.find(c => c.name.toLowerCase() === rawChan.toLowerCase());

                    if (!targetChan || !targetChan.isTextBased()) {
                        return submit.reply({
                            embeds: [build.deny(message.author, 'target channel not found or is not a text channel.')],
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const hasData = state.content || state.title || state.description || (state.fields && state.fields.length > 0) || state.images?.image || state.images?.thumbnail;
                    if (!hasData) {
                        return submit.reply({
                            embeds: [build.warn(message.author, 'your embed is empty. set a title, description, or content first.')],
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const outPayload = buildPublishedPayload(state);
                    await targetChan.send(outPayload);
                    return submit.reply({
                        embeds: [build.approved(message.author, `embed sent to <#${targetChan.id}>.`)],
                        flags: MessageFlags.Ephemeral
                    });
                } catch {
                    return;
                }
            }

            // --- 4. Save Embed ---
            if (cid === 'emb_btn_save') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_save_${ts}`)
                    .setTitle('save embed');

                const nameInput = new TextInputBuilder()
                    .setCustomId('embed_name')
                    .setLabel('embed name (lowercase, no spaces)')
                    .setValue(state.savedName || '')
                    .setPlaceholder('e.g. rules, welcome, verify')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(32)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_save_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const saveName = submit.fields.getTextInputValue('embed_name').trim().toLowerCase().replace(/\s+/g, '_');
                    state.savedName = saveName;
                    await message.client.db.saveEmbed(message.guild.id, saveName, state, message.author.id);

                    return submit.reply({
                        embeds: [build.approved(message.author, `saved embed as \`${saveName}\`. load it anytime with \`,embed load ${saveName}\`.`)],
                        flags: MessageFlags.Ephemeral
                    });
                } catch {
                    return;
                }
            }

            // --- 5. Remove Elements ---
            if (cid === 'emb_btn_remove') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_remove_${ts}`)
                    .setTitle('remove embed parts');

                const targetInput = new TextInputBuilder()
                    .setCustomId('rem_part')
                    .setLabel('part to clear')
                    .setPlaceholder('title, desc, color, author, images, footer, fields, buttons, msg, all')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_remove_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const part = submit.fields.getTextInputValue('rem_part').trim().toLowerCase();

                    if (part === 'all') {
                        state = createDefaultState(state.savedName);
                    } else if (part === 'title') {
                        state.title = null;
                        state.titleUrl = null;
                    } else if (part === 'desc' || part === 'description') {
                        state.description = null;
                    } else if (part === 'color' || part === 'colour') {
                        state.color = 'clear';
                    } else if (part === 'author') {
                        state.author = null;
                    } else if (part === 'images' || part === 'image' || part === 'thumbnail') {
                        state.images = { thumbnail: null, image: null };
                    } else if (part === 'footer') {
                        state.footer = null;
                    } else if (part === 'fields' || part === 'field') {
                        state.fields = [];
                    } else if (part === 'buttons' || part === 'button') {
                        state.buttons = [];
                    } else if (part === 'msg' || part === 'text' || part === 'message') {
                        state.content = null;
                    }

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 6. JSON Editor ---
            if (cid === 'emb_act_json') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_json_${ts}`)
                    .setTitle('embed json editor');

                const jsonStr = JSON.stringify(state, null, 2);
                const jsonInput = new TextInputBuilder()
                    .setCustomId('raw_json')
                    .setLabel('embed raw json')
                    .setValue(jsonStr.slice(0, 4000))
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_json_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const entered = submit.fields.getTextInputValue('raw_json').trim();
                    try {
                        const parsed = JSON.parse(entered);
                        const merged = { ...createDefaultState(state.savedName), ...parsed };
                        if (!merged.content && (parsed.message || parsed.text)) {
                            merged.content = parsed.message || parsed.text;
                        }
                        if (!merged.description && parsed.embeds?.[0]?.description) {
                            merged.description = parsed.embeds[0].description;
                        }
                        if (!merged.title && parsed.embeds?.[0]?.title) {
                            merged.title = parsed.embeds[0].title;
                        }
                        state = merged;
                    } catch {
                        return submit.reply({
                            embeds: [build.deny(message.author, 'invalid json syntax.')],
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 7. Edit Message Text ---
            if (cid === 'emb_act_msg') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_msg_${ts}`)
                    .setTitle('edit message text');

                const input = new TextInputBuilder()
                    .setCustomId('msg_content')
                    .setLabel('message content (outside embed)')
                    .setValue(state.content || '')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(2000)
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_msg_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const val = submit.fields.getTextInputValue('msg_content').trim();
                    state.content = val || null;

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 8. Edit Title ---
            if (cid === 'emb_act_title') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_title_${ts}`)
                    .setTitle('edit embed title');

                const titleInput = new TextInputBuilder()
                    .setCustomId('title_text')
                    .setLabel('title')
                    .setValue(state.title || '')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(false);

                const urlInput = new TextInputBuilder()
                    .setCustomId('title_url')
                    .setLabel('title destination url (optional)')
                    .setValue(state.titleUrl || '')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(urlInput)
                );
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_title_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    state.title = submit.fields.getTextInputValue('title_text').trim() || null;
                    state.titleUrl = submit.fields.getTextInputValue('title_url').trim() || null;

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 9. Edit Description ---
            if (cid === 'emb_act_desc') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_desc_${ts}`)
                    .setTitle('edit embed description');

                const descInput = new TextInputBuilder()
                    .setCustomId('desc_text')
                    .setLabel('description (markdown supported)')
                    .setValue(state.description || '')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(4000)
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(descInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_desc_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    state.description = submit.fields.getTextInputValue('desc_text').trim() || null;

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 10. Edit Colour ---
            if (cid === 'emb_act_color') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_col_${ts}`)
                    .setTitle('edit embed colour');

                const colInput = new TextInputBuilder()
                    .setCustomId('hex_color')
                    .setLabel('hex code (#0A0A0C, #5865F2, or clear)')
                    .setValue(state.color || '#0A0A0C')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(16)
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(colInput));
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_col_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    let rawCol = submit.fields.getTextInputValue('hex_color').trim().toLowerCase();
                    if (!rawCol || rawCol === 'clear' || rawCol === 'none') {
                        state.color = 'clear';
                    } else {
                        if (!rawCol.startsWith('#') && /^[0-9a-f]{6}$/i.test(rawCol)) {
                            rawCol = '#' + rawCol;
                        }
                        state.color = rawCol;
                    }

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 11. Edit Author ---
            if (cid === 'emb_act_author') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_author_${ts}`)
                    .setTitle('edit embed author');

                const nameInput = new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('author name')
                    .setValue(state.author?.name || '')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(false);

                const iconInput = new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('author icon url (optional)')
                    .setValue(state.author?.iconURL || '')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(false);

                const urlInput = new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('author destination url (optional)')
                    .setValue(state.author?.url || '')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(iconInput),
                    new ActionRowBuilder().addComponents(urlInput)
                );
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_author_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const aName = submit.fields.getTextInputValue('author_name').trim();
                    if (!aName) {
                        state.author = null;
                    } else {
                        state.author = {
                            name: aName,
                            iconURL: submit.fields.getTextInputValue('author_icon').trim() || null,
                            url: submit.fields.getTextInputValue('author_url').trim() || null
                        };
                    }

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 12. Edit Images ---
            if (cid === 'emb_act_images') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_img_${ts}`)
                    .setTitle('edit embed images');

                const imageInput = new TextInputBuilder()
                    .setCustomId('large_image')
                    .setLabel('large banner image url')
                    .setValue(state.images?.image || '')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(false);

                const thumbInput = new TextInputBuilder()
                    .setCustomId('thumb_image')
                    .setLabel('top-right thumbnail image url')
                    .setValue(state.images?.thumbnail || '')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(imageInput),
                    new ActionRowBuilder().addComponents(thumbInput)
                );
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_img_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const imgUrl = submit.fields.getTextInputValue('large_image').trim() || null;
                    const thumbUrl = submit.fields.getTextInputValue('thumb_image').trim() || null;
                    state.images = { image: imgUrl, thumbnail: thumbUrl };

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 13. Edit Footer ---
            if (cid === 'emb_act_footer') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_footer_${ts}`)
                    .setTitle('edit embed footer');

                const footerInput = new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('footer text')
                    .setValue(state.footer?.text || '')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(2048)
                    .setRequired(false);

                const iconInput = new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('footer icon url (optional)')
                    .setValue(state.footer?.iconURL || '')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('https://...')
                    .setRequired(false);

                const timeInput = new TextInputBuilder()
                    .setCustomId('footer_time')
                    .setLabel('include current timestamp? (yes/no)')
                    .setValue(state.footer?.timestamp ? 'yes' : 'no')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(footerInput),
                    new ActionRowBuilder().addComponents(iconInput),
                    new ActionRowBuilder().addComponents(timeInput)
                );
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_footer_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const fText = submit.fields.getTextInputValue('footer_text').trim();
                    if (!fText) {
                        state.footer = null;
                    } else {
                        const wantsTime = submit.fields.getTextInputValue('footer_time').trim().toLowerCase().startsWith('y');
                        state.footer = {
                            text: fText,
                            iconURL: submit.fields.getTextInputValue('footer_icon').trim() || null,
                            timestamp: wantsTime
                        };
                    }

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 14. Add / Manage Fields ---
            if (cid === 'emb_act_fields') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_field_${ts}`)
                    .setTitle('add embed field');

                const nameInput = new TextInputBuilder()
                    .setCustomId('field_name')
                    .setLabel('field name / title')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(true);

                const valInput = new TextInputBuilder()
                    .setCustomId('field_val')
                    .setLabel('field value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1024)
                    .setRequired(true);

                const inlineInput = new TextInputBuilder()
                    .setCustomId('field_inline')
                    .setLabel('inline? (yes / no)')
                    .setValue('no')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(valInput),
                    new ActionRowBuilder().addComponents(inlineInput)
                );
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_field_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const fName = submit.fields.getTextInputValue('field_name').trim();
                    const fVal = submit.fields.getTextInputValue('field_val').trim();
                    const fInline = submit.fields.getTextInputValue('field_inline').trim().toLowerCase().startsWith('y');

                    if (!Array.isArray(state.fields)) state.fields = [];
                    state.fields.push({ name: fName, value: fVal, inline: fInline });

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }

            // --- 15. Add / Manage Link Buttons ---
            if (cid === 'emb_act_buttons') {
                const ts = Date.now();
                const modal = new ModalBuilder()
                    .setCustomId(`modal_btn_${ts}`)
                    .setTitle('add link button');

                const labelInput = new TextInputBuilder()
                    .setCustomId('btn_label')
                    .setLabel('button label')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(80)
                    .setRequired(true);

                const urlInput = new TextInputBuilder()
                    .setCustomId('btn_url')
                    .setLabel('destination url (https://...)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const emojiInput = new TextInputBuilder()
                    .setCustomId('btn_emoji')
                    .setLabel('custom emoji (optional, e.g. <:harm:123>)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(labelInput),
                    new ActionRowBuilder().addComponents(urlInput),
                    new ActionRowBuilder().addComponents(emojiInput)
                );
                await i.showModal(modal).catch(() => {});

                try {
                    const submit = await i.awaitModalSubmit({
                        filter: m => m.customId === `modal_btn_${ts}` && m.user.id === message.author.id,
                        time: 60000
                    });

                    collector.resetTimer?.();
                    const bLabel = submit.fields.getTextInputValue('btn_label').trim();
                    const bUrl = submit.fields.getTextInputValue('btn_url').trim();
                    const bEmoji = submit.fields.getTextInputValue('btn_emoji').trim() || null;

                    if (!Array.isArray(state.buttons)) state.buttons = [];
                    state.buttons.push({ label: bLabel, url: bUrl, emoji: bEmoji });

                    return await updateEditor(submit);
                } catch {
                    return;
                }
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'sent' || reason === 'discarded' || reason === 'deleted' || reason === 'applied_invoke') return;
            const expiredEditor = buildEditorContainer(state, true, invokeContext);
            await sentMsg.edit({
                components: [expiredEditor]
            }).catch(() => {});
        });
    }
}

module.exports = EmbedCommand;
