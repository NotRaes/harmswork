const {
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { renderQuote } = require('./quote.js');
const build = require('../builder.js');
const config = require('../../../config.js');

const STYLES = ['monochrome', 'color', 'burgundy', 'sepia'];
const FONTS = ['ZenAntique', 'Cinzel', 'Inter'];

async function resolveQuoteTargetAndText(message, args) {
    let targetUser = null;
    let quoteText = '';

    // 1. Check if replying to a message
    if (message.reference && message.reference.messageId) {
        try {
            const refMsg = await message.channel.messages.fetch(message.reference.messageId);
            if (refMsg) {
                targetUser = refMsg.author;
                quoteText = refMsg.content || '';
            }
        } catch (_) {}
    }

    // 2. If args provided, check first arg for target user
    if (args && args.length > 0) {
        const first = args[0].replace(/[<@!>]/g, '').trim();
        const mention = typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null;

        if (mention && mention.id === first) {
            targetUser = mention;
            quoteText = args.slice(1).join(' ').trim();
        } else if (/^\d{17,20}$/.test(first)) {
            try {
                const fetched = await message.client.users.fetch(first);
                if (fetched) {
                    targetUser = fetched;
                    quoteText = args.slice(1).join(' ').trim();
                }
            } catch (_) {}
        }

        if (!targetUser && args.length > 1) {
            const query = args[0].toLowerCase();
            const member = message.guild?.members?.cache.find(m =>
                m.user.username.toLowerCase() === query ||
                m.displayName.toLowerCase() === query
            );
            if (member) {
                targetUser = member.user;
                quoteText = args.slice(1).join(' ').trim();
            }
        }
    }

    // Fallback: if no target user found yet, use author and all args as text
    if (!targetUser) {
        if (!quoteText && args && args.length > 0) {
            targetUser = message.author;
            quoteText = args.join(' ').trim();
        } else if (!targetUser) {
            targetUser = message.author;
        }
    }

    if (!quoteText && args && args.length > 0) {
        quoteText = args.join(' ').trim();
    }

    return {
        targetUser,
        quoteText: quoteText || '...',
        style: 'monochrome',
        font: 'ZenAntique',
        watermark: '• harm'
    };
}

function buildOptionRow(state, disabled = false) {
    const e = config.emojis || {};
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('quote_opt_style')
            .setLabel(`style: ${state.style}`)
            .setEmoji(e.emb_color || '<:coin:1558818714055479421>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('quote_opt_font')
            .setLabel(`font: ${state.font}`)
            .setEmoji(e.emb_author || '<:idcard:1558818721156567040>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('quote_opt_edit')
            .setLabel('edit text')
            .setEmoji(e.emb_desc || '<:harm_desc:1559895590362419301>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('quote_opt_watermark')
            .setLabel(state.watermark ? 'watermark: on' : 'watermark: off')
            .setEmoji(e.lockvc || '<:lockvc:1558818774772089003>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('quote_opt_delete')
            .setLabel('delete')
            .setEmoji(e.emb_remove || '<:deletevc:1558818747769159680>')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

async function executeQuoteCommand(message, args) {
    const { targetUser, quoteText, style, font, watermark } = await resolveQuoteTargetAndText(message, args);

    if (!quoteText || quoteText === '...') {
        return message.reply({
            embeds: [build.warn(message.author, 'syntax: `,quote <@user> <text>` or reply to a message with `,quote`')]
        });
    }

    const state = {
        text: quoteText,
        avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true }),
        displayName: targetUser.displayName || targetUser.username,
        username: targetUser.username,
        style,
        font,
        watermark
    };

    let buffer;
    try {
        buffer = await renderQuote(state);
    } catch (_) {
        buffer = await renderQuote(state, true);
    }

    const attachment = new AttachmentBuilder(buffer, { name: 'quote.png' });
    const row = buildOptionRow(state);

    const replyMsg = await message.reply({
        files: [attachment],
        components: [row]
    }).catch(() => null);

    if (!replyMsg) return;

    // Interactive options collector (2 minutes lifecycle)
    const collector = replyMsg.createMessageComponentCollector({
        time: 120000
    });

    collector.on('collect', async i => {
        if (i.user.id !== message.author.id) {
            return i.reply({
                content: 'only the command invoker can adjust these quote options.',
                ephemeral: true
            }).catch(() => {});
        }

        // 1. Delete
        if (i.customId === 'quote_opt_delete') {
            await replyMsg.delete().catch(() => {});
            collector.stop('deleted');
            return;
        }

        // 2. Style toggle
        if (i.customId === 'quote_opt_style') {
            const nextIdx = (STYLES.indexOf(state.style) + 1) % STYLES.length;
            state.style = STYLES[nextIdx];
        }

        // 3. Font toggle
        if (i.customId === 'quote_opt_font') {
            const nextIdx = (FONTS.indexOf(state.font) + 1) % FONTS.length;
            state.font = FONTS[nextIdx];
        }

        // 4. Watermark toggle
        if (i.customId === 'quote_opt_watermark') {
            state.watermark = state.watermark ? '' : '• harm';
        }

        // 5. Edit Text Modal
        if (i.customId === 'quote_opt_edit') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_quote_edit_${i.id}`)
                .setTitle('edit quote text');

            const textInput = new TextInputBuilder()
                .setCustomId('quote_input_text')
                .setLabel('new quote text')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(state.text)
                .setMaxLength(300)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            await i.showModal(modal).catch(() => {});

            const modalSubmit = await i.awaitModalSubmit({
                filter: m => m.customId === `modal_quote_edit_${i.id}` && m.user.id === message.author.id,
                time: 60000
            }).catch(() => null);

            if (!modalSubmit) return;

            state.text = modalSubmit.fields.getTextInputValue('quote_input_text').trim() || state.text;
            await modalSubmit.deferUpdate().catch(() => {});
        } else {
            await i.deferUpdate().catch(() => {});
        }

        // Re-render canvas image with updated options
        let newBuf;
        try {
            newBuf = await renderQuote(state);
        } catch (_) {
            newBuf = await renderQuote(state, true);
        }

        const newAttachment = new AttachmentBuilder(newBuf, { name: 'quote.png' });
        const updatedRow = buildOptionRow(state);

        await replyMsg.edit({
            files: [newAttachment],
            components: [updatedRow]
        }).catch(() => {});
    });

    collector.on('end', async (_, reason) => {
        if (reason !== 'deleted') {
            const disabledRow = buildOptionRow(state, true);
            await replyMsg.edit({
                files: replyMsg.attachments ? [...replyMsg.attachments.values()] : [],
                embeds: replyMsg.embeds || [],
                components: [disabledRow],
                skipV2: true
            }).catch(() => {});
        }
    });
}

module.exports = {
    executeQuoteCommand,
    resolveQuoteTargetAndText,
    buildOptionRow
};
