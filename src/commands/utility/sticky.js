const {
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class StickyCommand {
    constructor() {
        this.name = 'sticky';
        this.aliases = ['stickymessage', 'stickymsg'];
        this.description = 'stick a persistent message to the bottom of a channel.';
        this.syntax = ',sticky [set <message> | remove | list]';
        this.example = ',sticky set please read the rules before chatting!';
        this.category = 'utility';
        this.permissions = ['ManageChannels'];
        this.cooldown = 3;
        this.subcommands = [
            'sticky set <message>',
            'sticky remove',
            'sticky list',
            'sticky reset'
        ];
        this.subcommandDetails = {
            set: {
                description: 'pin a message that stays at the bottom of the current channel.',
                syntax: ',sticky set <message>',
                example: ',sticky set welcome to general, keep it chill'
            },
            remove: {
                description: 'remove the sticky message from the current channel.',
                syntax: ',sticky remove',
                example: ',sticky remove'
            },
            list: {
                description: 'list all active sticky messages in this server.',
                syntax: ',sticky list',
                example: ',sticky list'
            },
            reset: {
                description: 'remove the sticky message from the current channel.',
                syntax: ',sticky reset',
                example: ',sticky reset'
            }
        };
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply(build.warnBox('this command can only be used in servers.'));
        }

        const isOwner = config.owners?.includes(message.author.id);
        const hasPerms = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageChannels);
        if (!hasPerms) {
            return message.reply(build.denyBox('permission denied', 'you need manage channels permission to manage sticky messages.'));
        }

        const db = message.client.db;
        const p = (db?.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
        const sub = (args?.[0] || '').toLowerCase();

        // ──────────────────────── 1. SET STICKY ────────────────────────
        if (sub === 'set' || sub === 'add' || sub === 'create') {
            const content = args.slice(1).join(' ').trim();
            if (!content) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${p}sticky set <message>\``)] });
            }

            if (content.length > 2000) {
                return message.reply({ embeds: [build.warn(message.author, 'sticky message content cannot exceed 2,000 characters.')] });
            }

            // Remove prior sticky message if one already existed
            const existing = await db.getSticky(message.channel.id);
            if (existing?.last_message_id) {
                try {
                    const oldMsg = await message.channel.messages.fetch(existing.last_message_id).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => {});
                } catch (_) {}
            }

            // Send initial sticky message
            const pinEmoji = config.emojis?.harm_pin || '';
            const stickyEmbed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(`${pinEmoji} **sticky message**\n\n${content}`);

            const sent = await message.channel.send({ embeds: [stickyEmbed] }).catch(() => null);
            await db.setSticky(message.guild.id, message.channel.id, content, message.author.id);
            if (sent) {
                await db.updateStickyLastMessage(message.channel.id, sent.id);
            }

            return message.reply({
                embeds: [build.approved(message.author, 'sticky message configured for this channel.\n-# harm will automatically keep it at the bottom of the chat.')]
            });
        }

        // ──────────────────────── 2. REMOVE STICKY ────────────────────────
        if (sub === 'remove' || sub === 'delete' || sub === 'clear' || sub === 'unset' || sub === 'reset') {
            const existing = await db.getSticky(message.channel.id);
            if (!existing) {
                return message.reply({ embeds: [build.warn(message.author, 'no active sticky message found in this channel.')] });
            }

            if (existing.last_message_id) {
                try {
                    const oldMsg = await message.channel.messages.fetch(existing.last_message_id).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => {});
                } catch (_) {}
            }

            await db.removeSticky(message.channel.id);
            return message.reply({
                embeds: [build.approved(message.author, 'removed sticky message from this channel.')]
            });
        }

        // ──────────────────────── 3. LIST STICKIES ────────────────────────
        if (sub === 'list' || sub === 'all' || sub === 'show') {
            const stickies = await db.getGuildStickies(message.guild.id);
            if (!stickies || stickies.length === 0) {
                return message.reply({
                    embeds: [build.warn(message.author, `no active sticky messages configured in this server.\n-# use \`${p}sticky set <text>\` to add one.`)]
                });
            }

            const lines = stickies.map((s, idx) => {
                const preview = s.content.length > 60 ? `${s.content.slice(0, 57)}...` : s.content;
                return `\`${idx + 1}.\` <#${s.channel_id}> (by <@${s.created_by}>)\n-# *"${preview}"*`;
            });

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### active sticky messages\n` +
                    `-# ${stickies.length} active sticky message(s) in this server\n\n` +
                    lines.join('\n\n') +
                    `\n\n-# use \`${p}sticky remove\` in a channel to remove its sticky.`
                );

            return message.reply({ embeds: [embed] });
        }

        // ──────────────────────── 4. UNKNOWN SUBCOMMAND GUARD ────────────────────────
        if (sub) {
            const valid = ['set', 'remove', 'list', 'reset'];
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

            if (best && bestDist <= 3) {
                return message.reply({
                    embeds: [build.say(message.author, `did you mean \`${p}sticky ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`${p}sticky [set|remove|list|reset]\``)]
            });
        }

        // ──────────────────────── 5. CHANNEL OVERVIEW (DEFAULT) ────────────────────────
        const existing = await db.getSticky(message.channel.id);
        if (existing) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### channel sticky message\n` +
                    `-# active in <#${message.channel.id}>\n\n` +
                    `>>> ${existing.content}\n\n` +
                    `-# configured by <@${existing.created_by}> <t:${Math.floor(existing.created_at / 1000)}:R>\n` +
                    `-# run \`${p}sticky remove\` to clear it.`
                );
            return message.reply({ embeds: [embed] });
        }

        return message.reply({
            embeds: [build.say(message.author, `no sticky message in this channel.\n-# run \`${p}sticky set <message>\` to pin a message to the bottom.`)]
        });
    }
}

module.exports = StickyCommand;
