const { AttachmentBuilder } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    extractImageUrlFromMessage,
    findRecentImageInChannel,
    renderImageToGif
} = require('../../structures/utils/helpers/gifhelper.js');

class GifCommand {
    constructor() {
        this.name = 'gif';
        this.aliases = ['to-gif', 'makegif', 'togif'];
        this.description = 'convert an attached or replied image into a gif.';
        this.syntax = ',gif [url|@user]';
        this.example = ',gif';
        this.category = 'utility';
        this.cooldown = 2;
    }

    async resolveTargetImage(message, args) {
        // 1. Reply message
        if (message.reference && message.reference.messageId) {
            try {
                const refMsg = await message.channel.messages.fetch(message.reference.messageId);
                const url = extractImageUrlFromMessage(refMsg);
                if (url) return { url, source: 'reply' };
            } catch (_) {}
        }

        // 2. Direct attachment on current message
        const currentUrl = extractImageUrlFromMessage(message);
        if (currentUrl) return { url: currentUrl, source: 'attachment' };

        // 3. User Mention or ID in args
        if (args.length > 0) {
            const firstArg = args[0];
            const cleanId = firstArg.replace(/[<@!>]/g, '').trim();
            if (/^\d{17,20}$/.test(cleanId)) {
                try {
                    const targetUser = await message.client.users.fetch(cleanId);
                    if (targetUser) {
                        const avatarUrl = targetUser.displayAvatarURL({ size: 512, extension: 'png' });
                        return { url: avatarUrl, source: 'avatar' };
                    }
                } catch (_) {}
            }

            // Direct URL in args
            if (/^https?:\/\//i.test(firstArg)) {
                return { url: firstArg, source: 'url' };
            }
        }

        // 4. Fallback: Most recent image in channel
        const recent = await findRecentImageInChannel(message.channel, 25);
        if (recent) return { url: recent.url, source: 'channel' };

        return null;
    }

    async execute(message, args) {
        const resolved = await this.resolveTargetImage(message, args);
        if (!resolved || !resolved.url) {
            return message.reply({
                embeds: [build.warn(message.author, 'reply to an image or attach an image to convert it to gif.')]
            });
        }

        try {
            message.channel.sendTyping().catch(() => {});
            const renderResult = await renderImageToGif(resolved.url);
            if (!renderResult || !renderResult.buffer) {
                return message.reply({
                    embeds: [build.deny(message.author, 'failed to convert that image into a gif.')]
                });
            }

            const attachment = new AttachmentBuilder(renderResult.buffer, { name: 'image.gif' });
            return await message.reply({ files: [attachment] });
        } catch (err) {
            console.error('[gif command error]:', err);
            return message.reply({
                embeds: [build.deny(message.author, 'failed to convert that image into a gif.')]
            });
        }
    }
}

module.exports = GifCommand;
