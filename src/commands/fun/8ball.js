const { EmbedBuilder } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

const ORACLE_RESPONSES = [
    // Positive
    { text: 'obviously.', type: 'positive' },
    { text: 'without question.', type: 'positive' },
    { text: 'the outcome is already decided in your favor.', type: 'positive' },
    { text: 'yes, move forward with confidence.', type: 'positive' },
    { text: 'most likely; stay composed.', type: 'positive' },
    { text: 'all indicators point to yes.', type: 'positive' },
    { text: 'the odds are heavily stacked for you.', type: 'positive' },
    // Neutral
    { text: 'ask again after coffee.', type: 'neutral' },
    { text: 'the signals are currently clouded; wait it out.', type: 'neutral' },
    { text: 'better left unasked for now.', type: 'neutral' },
    { text: 'focus on the present; the future will clarify.', type: 'neutral' },
    { text: 'neither yes nor no; you already know the real answer.', type: 'neutral' },
    // Negative
    { text: 'delusional thinking.', type: 'negative' },
    { text: 'absolutely not.', type: 'negative' },
    { text: 'save yourself the disappointment.', type: 'negative' },
    { text: 'don\'t count on it.', type: 'negative' },
    { text: 'prospects look remarkably dim.', type: 'negative' },
    { text: 'zero chance; pivot your plans.', type: 'negative' },
    { text: 'not in this lifetime.', type: 'negative' }
];

class EightBallCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = '8ball';
        this.aliases = ['oracle', 'ask'];
        this.description = 'consult the harm oracle for blunt, grounded answers.';
        this.syntax = ',8ball <question>';
        this.example = ',8ball will i get rich?\n,8ball should i sleep';
        this.category = 'fun';
        this.cooldown = 2;
    }

    async execute(message, args) {
        if (!args || args.length === 0) {
            return message.reply({
                embeds: [build.warn(message.author, 'syntax: `,8ball <question>`')]
            });
        }

        const question = args.join(' ').trim();
        const pick = ORACLE_RESPONSES[Math.floor(Math.random() * ORACLE_RESPONSES.length)];
        const confidence = (Math.random() * 20 + 80).toFixed(1);

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setDescription(
                `### [harm oracle](https://discord.gg/hCQhTmPf2G)\n` +
                `**question** *${question.replace(/\*/g, '')}*\n` +
                `**response** \`${pick.text}\`\n\n` +
                `-# confidence index: ${confidence}% · ${pick.type}`
            );

        return message.reply({ embeds: [embed] });
    }
}

module.exports = EightBallCommand;
