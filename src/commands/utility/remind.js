const { EmbedBuilder } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function parseDuration(str) {
    if (!str) return null;
    const regex = /(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)/gi;
    let match;
    let totalMs = 0;
    let matchedAny = false;
    while ((match = regex.exec(str)) !== null) {
        matchedAny = true;
        const val = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        if (unit.startsWith('s')) totalMs += val * 1000;
        else if (unit.startsWith('m')) totalMs += val * 60 * 1000;
        else if (unit.startsWith('h')) totalMs += val * 3600 * 1000;
        else if (unit.startsWith('d')) totalMs += val * 86400 * 1000;
        else if (unit.startsWith('w')) totalMs += val * 7 * 86400 * 1000;
    }
    return matchedAny ? totalMs : null;
}

class RemindCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'remind';
        this.aliases = ['remindme', 'reminder', 'reminders'];
        this.description = 'set persistent reminders across bot restarts, list active timers, or cancel reminders.';
        this.syntax = ',remind <time> <task> or ,remind [list|cancel <id>]';
        this.example = ',remind 30m check pizza\n,remind 2h gym session\n,remind list\n,remind cancel 1';
        this.category = 'utility';
        this.cooldown = 2;
    }

    async execute(message, args) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not ready.')] });
        }

        const sub = (args[0] || '').toLowerCase();

        // 1. List active reminders
        if (sub === 'list' || sub === 'ls' || sub === 'all') {
            const reminders = await db.getUserReminders(message.author.id);
            if (!reminders || reminders.length === 0) {
                return message.reply({ embeds: [build.warn(message.author, 'you have no active reminders.')] });
            }

            const lines = reminders.map((r, i) => {
                const ts = Math.floor(r.trigger_at / 1000);
                return `\`#${r.id}\` ─ **${r.reason}**\n-# triggers <t:${ts}:R> · <t:${ts}:t>`;
            });

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### [active reminders](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# scheduled timers saved across bot sessions.\n\n` +
                    lines.join('\n\n')
                );

            return message.reply({ embeds: [embed] });
        }

        // 2. Cancel a reminder
        if (sub === 'cancel' || sub === 'delete' || sub === 'remove' || sub === 'rm') {
            const targetId = parseInt(args[1], 10);
            if (isNaN(targetId)) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,remind cancel <id>`')] });
            }

            const ok = await db.deleteReminder(targetId, message.author.id);
            if (!ok) {
                return message.reply({ embeds: [build.deny(message.author, `reminder \`#${targetId}\` not found or does not belong to you.`)] });
            }

            return message.reply({ embeds: [build.approved(message.author, `reminder \`#${targetId}\` cancelled.`)] });
        }

        // 3. Create a reminder
        if (args.length === 0) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: `,remind <time> <task>` (e.g. `,remind 30m check pizza`)')] });
        }

        const timeArg = args[0];
        const duration = parseDuration(timeArg);

        if (!duration || duration < 5000) {
            return message.reply({
                embeds: [build.warn(message.author, 'invalid time format. specify duration like `30s`, `15m`, `2h`, `1d`. minimum is `5s`.')]
            });
        }

        // Max 1 year
        if (duration > 365 * 86400 * 1000) {
            return message.reply({
                embeds: [build.deny(message.author, 'reminders cannot exceed 1 year.')]
            });
        }

        const task = args.slice(1).join(' ').trim() || 'something important';
        const triggerAt = Date.now() + duration;

        const id = await db.addReminder(
            message.author.id,
            message.channel.id,
            message.guild?.id || null,
            message.id,
            task,
            triggerAt
        );

        const bell = config.emojis?.harm_bell || '<:harm_bell:1559895594175172608>';
        const ts = Math.floor(triggerAt / 1000);

        return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(config.colors.c || '#0A0A0C')
                    .setDescription(
                        `${bell} <@${message.author.id}>**:** i will remind you: **${task}**\n-# triggers <t:${ts}:R> · <t:${ts}:t> · id: \`#${id}\``
                    )
            ]
        });
    }
}

module.exports = RemindCommand;
