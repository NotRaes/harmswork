const build = require('../../structures/utils/builder.js');

class ShuffleCommand {
    constructor() {
        this.name = 'shuffle';
        this.aliases = ['shuff'];
        this.description = 'randomize the order of tracks in the queue.';
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
        if (!queue || queue.tracks.length < 2) {
            return message.reply({
                embeds: [build.warn(message.author, 'there must be at least 2 tracks in queue to shuffle.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        const count = queue.shuffle();
        return message.reply({
            embeds: [build.approved(message.author, `shuffled \`${count}\` tracks in the queue.`)]
        });
    }
}

module.exports = ShuffleCommand;
