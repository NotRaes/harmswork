const build = require('../../structures/utils/builder.js');

class LoopCommand {
    constructor() {
        this.name = 'loop';
        this.aliases = ['repeat', 'lp'];
        this.description = 'toggle or set repeat mode (off, track, queue).';
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

        const arg = (args[0] || '').toLowerCase();
        let newMode;

        if (['track', 'song', 'current', '1'].includes(arg)) {
            newMode = 'track';
            queue.loop = 'track';
        } else if (['queue', 'all', 'q'].includes(arg)) {
            newMode = 'queue';
            queue.loop = 'queue';
        } else if (['off', 'disable', 'none', '0'].includes(arg)) {
            newMode = 'off';
            queue.loop = 'off';
        } else {
            // Cycle
            newMode = queue.cycleLoop();
        }

        return message.reply({
            embeds: [build.approved(message.author, `loop mode set to \`${newMode}\`.`)]
        });
    }
}

module.exports = LoopCommand;
