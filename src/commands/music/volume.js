const build = require('../../structures/utils/builder.js');

class VolumeCommand {
    constructor() {
        this.name = 'volume';
        this.aliases = ['vol', 'v'];
        this.description = 'adjust the music playback volume (1-200%).';
        this.category = 'music';
        this.cooldown = 2;
    }

    async execute(message, args) {
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

        if (!args[0]) {
            return message.reply({
                embeds: [build.say(message.author, `current playback volume is \`${queue.volume}%\`.`)]
            });
        }

        const vol = parseInt(args[0], 10);
        if (isNaN(vol) || vol < 1 || vol > 200) {
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: ,volume <1-200>')]
            });
        }

        const newVol = queue.setVolume(vol);
        return message.reply({
            embeds: [build.approved(message.author, `volume set to \`${newVol}%\`.`)]
        });
    }
}

module.exports = VolumeCommand;
