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
    AttachmentBuilder,
    EmbedBuilder
} = require('discord.js');
const build = require('../structures/utils/builder.js');
const config = require('../config.js');
const {
    extractImageUrlFromMessage,
    renderImageToGif
} = require('../structures/utils/helpers/gifhelper.js');

class MessageReactionAddEvent {
    constructor(client) {
        this.name = 'messageReactionAdd';
        this.once = false;
        this.client = client;
    }

    async execute(reaction, user) {
        if (!user || user.bot) return;

        // Fetch partial reaction and message if needed
        try {
            if (reaction.partial) await reaction.fetch();
            if (reaction.message?.partial) await reaction.message.fetch();
        } catch (_) {
            return;
        }

        const message = reaction.message;
        if (!message || !message.channel) return;

        // Emojis that trigger GIF conversion: 🎞️, 🎥, 🖼️, 🪄, or custom emojis with 'gif' in name
        const emojiName = (reaction.emoji.name || '').toLowerCase();
        const triggerEmojis = ['🎞️', '🎞', '🎥', '🖼️', '🖼', '🪄'];
        const isGifTrigger = triggerEmojis.includes(emojiName) || emojiName.includes('gif') || emojiName.includes('anim');

        if (!isGifTrigger) return;

        const imageUrl = extractImageUrlFromMessage(message);
        if (!imageUrl) return;

        try {
            const channel = message.channel;
            if (typeof channel.sendTyping === 'function') channel.sendTyping().catch(() => {});

            const renderResult = await renderImageToGif(imageUrl);
            if (!renderResult || !renderResult.buffer) return;

            const gifAttachment = new AttachmentBuilder(renderResult.buffer, { name: 'image.gif' });
            await channel.send({
                files: [gifAttachment],
                reply: { messageReference: message.id }
            }).catch(() => {});
        } catch (err) {
            console.error('[reaction to gif error]:', err);
        }
    }
}

module.exports = MessageReactionAddEvent;
