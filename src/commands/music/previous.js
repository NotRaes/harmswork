const build = require('../../structures/utils/builder.js');

class PreviousCommand {
    constructor() {
        this.name = 'previous';
        this.aliases = ['prev', 'back'];
        this.description = 'play the previously played track.';
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
                embeds: [build.warn(message.author, 'there is no active music session.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        const ok = queue.previous();
        if (!ok) {
            return message.reply({
                embeds: [build.warn(message.author, 'no previous tracks in history.')]
            });
        }

        return message.reply({
            embeds: [build.approved(message.author, `replaying [${queue.current.title.toLowerCase()}](${queue.current.url}).`)]
        });
    }
}

module.exports = PreviousCommand;
