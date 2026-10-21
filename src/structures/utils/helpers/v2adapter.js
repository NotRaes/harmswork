const {
    Message,
    BaseGuildTextChannel,
    ThreadChannel,
    DMChannel,
    MessageComponentInteraction,
    ModalSubmitInteraction,
    MessageFlags
} = require('discord.js');
const build = require('../builder.js');

let initialized = false;

function initV2Adapter() {
    if (initialized) return;
    initialized = true;

    function wrapMethod(proto, methodName, isEdit = false) {
        if (!proto || typeof proto[methodName] !== 'function') return;
        const original = proto[methodName];

        proto[methodName] = async function(options, ...rest) {
            if (!options) return original.call(this, options, ...rest);
            // If editing a message with components only, preserve existing embeds so they are not wiped!
            if (isEdit && typeof options === 'object') {
                const existingEmbeds = (this.embeds && this.embeds.length > 0)
                    ? this.embeds
                    : (this.message?.embeds && this.message.embeds.length > 0 ? this.message.embeds : null);
                if (options.components && options.embeds === undefined && existingEmbeds) {
                    options.embeds = existingEmbeds;
                }
            }

            if (options.skipV2) {
                return original.call(this, options, ...rest);
            }

            let v2Options;
            try {
                v2Options = build.transformToV2Options(options, isEdit);
            } catch (_) {
                return original.call(this, options, ...rest);
            }

            if (v2Options === options) {
                return original.call(this, options, ...rest);
            }

            try {
                return await original.call(this, v2Options, ...rest);
            } catch (err) {
                // If Components V2 payload was rejected by Discord, gracefully fall back
                return await original.call(this, options, ...rest);
            }
        };
    }

    wrapMethod(Message.prototype, 'reply', false);
    wrapMethod(Message.prototype, 'edit', true);
    if (BaseGuildTextChannel?.prototype) wrapMethod(BaseGuildTextChannel.prototype, 'send', false);
    if (ThreadChannel?.prototype) wrapMethod(ThreadChannel.prototype, 'send', false);
    if (DMChannel?.prototype) wrapMethod(DMChannel.prototype, 'send', false);
    if (MessageComponentInteraction?.prototype) {
        wrapMethod(MessageComponentInteraction.prototype, 'reply', false);
        wrapMethod(MessageComponentInteraction.prototype, 'update', true);
    }
    if (ModalSubmitInteraction?.prototype) {
        wrapMethod(ModalSubmitInteraction.prototype, 'reply', false);
    }
}

module.exports = { initV2Adapter };
