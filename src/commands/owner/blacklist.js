const { EmbedBuilder } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class BlacklistCommand {
    constructor() {
        this.name = 'blacklist';
        this.aliases = ['bl', 'unblacklist', 'ubl'];
        this.description = 'manage the global bot blacklist for abusive users.';
        this.syntax = ',blacklist <add|remove|list> <user> [reason]';
        this.example = ',blacklist add 123456789012345678 spamming';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 2;
        this.subcommands = ['blacklist add <user> [reason]', 'blacklist remove <user>', 'blacklist list'];
    }

    async execute(message, args, commandName) {
        const db = message.client.db;
        if (!db) {
            return message.reply(build.denyBox('unavailable', 'database manager is not initialized.'));
        }

        const invoked = (commandName || '').toLowerCase();
        const isUnbl = (invoked === 'unblacklist' || invoked === 'ubl');

        let sub = isUnbl ? 'remove' : (args?.[0]?.toLowerCase() || 'list');
        let targetArg = null;
        let reason = 'no reason provided';

        // 1. Shorthand Support: ,bl @user [reason] or ,bl <id> [reason]
        const firstClean = (args?.[0] || '').replace(/[<@!>]/g, '').trim();
        if (!isUnbl && (/^\d{17,20}$/.test(firstClean) || (message.mentions?.users?.size > 0 && message.mentions.users.first().id === firstClean))) {
            sub = 'add';
            targetArg = args[0];
            reason = args.slice(1).join(' ').trim() || 'no reason provided';
        }

        if (sub === 'add') {
            const target = targetArg || args[1];
            if (!target) {
                return message.reply(build.warnBox('missing user', 'specify a user mention or id to blacklist.'));
            }

            const cleanId = target.replace(/[<@!>]/g, '').trim();
            if (config.owners?.includes(cleanId)) {
                return message.reply(build.denyBox('invalid target', 'bot owners cannot be blacklisted.'));
            }

            if (!targetArg) {
                reason = args.slice(2).join(' ').trim() || 'no reason provided';
            }

            await db.addBlacklist(cleanId, reason, message.author.id);

            return message.reply({
                embeds: [build.approved(message.author, `added <@${cleanId}> (\`${cleanId}\`) to the bot blacklist.\n-# reason: ${reason}`)]
            });
        }

        if (sub === 'remove' || sub === 'delete' || sub === 'del') {
            const target = isUnbl ? args[0] : args[1];
            if (!target) {
                return message.reply(build.warnBox('missing user', 'specify a user mention or id to unblacklist.'));
            }

            const cleanId = target.replace(/[<@!>]/g, '').trim();
            const isCurrentlyBlocked = db.isBlacklisted(cleanId)
                || Boolean(await (db.get ? db.get('SELECT 1 FROM bot_blacklist WHERE user_id = ?', [cleanId]) : db.db?.get('SELECT 1 FROM bot_blacklist WHERE user_id = ?', [cleanId])));

            if (!isCurrentlyBlocked) {
                return message.reply(build.warnBox('not blacklisted', `<@${cleanId}> is not currently blacklisted.`));
            }

            await db.removeBlacklist(cleanId);
            return message.reply({
                embeds: [build.approved(message.author, `removed <@${cleanId}> from the bot blacklist.`)]
            });
        }

        // List
        if (sub !== 'list' && sub !== 'all' && sub !== 'show' && args.length > 0) {
            const valid = ['add', 'remove', 'list'];
            let best = null;
            let bestDist = Infinity;
            for (const v of valid) {
                const a = sub, b = v;
                const matrix = [];
                for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                for (let i = 1; i <= b.length; i++) {
                    for (let j = 1; j <= a.length; j++) {
                        if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                        else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                    }
                }
                const d = matrix[b.length][a.length];
                if (d < bestDist) { bestDist = d; best = v; }
            }

            if (best && bestDist <= 2) {
                return message.reply({
                    embeds: [build.say(message.author, `did you mean \`,blacklist ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,blacklist [add|remove|list]\``)]
            });
        }

        const list = await db.getBlacklist();
        if (!list || !list.length) {
            return message.reply({
                embeds: [build.approved(message.author, 'the bot blacklist is currently empty.')]
            });
        }

        const lines = list.map((b, idx) => {
            const time = `<t:${b.timestamp}:R>`;
            return `\`${idx + 1}.\` <@${b.user_id}> (\`${b.user_id}\`)\n-# reason: ${b.reason} · blacklisted ${time}`;
        });

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || 0x0A0A0C)
            .setDescription(
                `### bot blacklist\n` +
                `-# monitoring **${list.length} blacklisted user${list.length === 1 ? '' : 's'}** globally.\n\n` +
                lines.join('\n\n')
            );

        return message.reply({ embeds: [embed] });
    }
}

module.exports = BlacklistCommand;
