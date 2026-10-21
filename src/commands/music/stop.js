const build = require('../../structures/utils/builder.js');

class StopCommand {
    constructor() {
        this.name = 'stop';
        this.aliases = ['leave', 'dc', 'disconnect'];
        this.description = 'stop music playback and disconnect harm.';
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
                embeds: [build.warn(message.author, 'harm is not currently playing any music.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        queue.stop();
        return message.reply({
            embeds: [build.approved(message.author, 'stopped playback and left voice channel.')]
        });
    }
}

module.exports = StopCommand;
