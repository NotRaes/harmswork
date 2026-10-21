const build = require('../../structures/utils/builder.js');

class AutoplayCommand {
    constructor() {
        this.name = 'autoplay';
        this.aliases = ['ap', 'auto'];
        this.description = 'toggle intelligent autoplay for continuous music playback.';
        this.category = 'music';
        this.cooldown = 2;
    }

    async execute(message) {
        const memberVoice = message.member?.voice?.channel;
        if (!memberVoice) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in a voice channel to use this command.')]
            });
        }

        const queue = message.client.music?.getQueue(message.guild.id);
        if (!queue) {
            return message.reply({
                embeds: [build.warn(message.author, 'there is no active music session. start playing with `,play <query>`.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        const enabled = queue.toggleAutoplay();
        const status = enabled ? 'enabled' : 'disabled';

        return message.reply({
            embeds: [build.approved(message.author, `intelligent autoplay is now **${status}**.`)]
        });
    }
}

module.exports = AutoplayCommand;
