const build = require('../../structures/utils/builder.js');

class SkipCommand {
    constructor() {
        this.name = 'skip';
        this.aliases = ['next', 'sk'];
        this.description = 'skip the currently playing song.';
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
                embeds: [build.warn(message.author, 'there is nothing currently playing to skip.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        const skipped = queue.current;
        queue.skip();

        return message.reply({
            embeds: [build.approved(message.author, `skipped [${skipped.title.toLowerCase()}](${skipped.url}).`)]
        });
    }
}

module.exports = SkipCommand;
