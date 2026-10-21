const build = require('../../structures/utils/builder.js');

class PauseCommand {
    constructor() {
        this.name = 'pause';
        this.aliases = [];
        this.description = 'pause the currently playing song.';
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
        if (!queue || !queue.current) {
            return message.reply({
                embeds: [build.warn(message.author, 'there is nothing currently playing.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        if (queue.paused) {
            return message.reply({
                embeds: [build.warn(message.author, 'playback is already paused.')]
            });
        }

        queue.pause();
        return message.reply({
            embeds: [build.approved(message.author, 'paused playback.')]
        });
    }
}

module.exports = PauseCommand;
