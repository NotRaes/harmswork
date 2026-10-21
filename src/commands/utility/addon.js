const {
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const {
    ADDONS,
    resolveAddon
} = require('../../structures/utils/helpers/addonhelper.js');

class AddonCommand {
    constructor() {
        this.name = 'addon';
        this.aliases = ['addons', 'module', 'modules', 'enable', 'disable', 'didsable'];
        this.description = 'view, enable, or disable modular server addons (such as voicemaster, economy, etc.).';
        this.syntax = ',addon [enable|disable|list|reset] [name]\n,enable [add] <name>\n,disable [add] <name>';
        this.example = ',addon\n,enable voicemaster\n,disable economy\n,addon enable voicemaster\n,addon disable economy';
        this.category = 'utility';
        this.cooldown = 2;
        this.subcommands = [
            'addon list',
            'addon enable <name>',
            'addon disable <name>',
            'addon reset',
            'enable <name>',
            'disable <name>'
        ];
        this.subcommandDetails = {
            dashboard: {
                description: 'open the interactive server addons dashboard.',
                syntax: ',addon',
                example: ',addon'
            },
            enable: {
                description: 'activate an optional modular addon for this server.',
                syntax: ',enable <name>',
                example: ',enable voicemaster'
            },
            disable: {
                description: 'deactivate an addon and disable its commands in this server.',
                syntax: ',disable <name>',
                example: ',disable economy'
            },
            list: {
                description: 'view all available addons and their current server status.',
                syntax: ',addon list',
                example: ',addon list'
            },
            reset: {
                description: 'reset all server addons to default settings.',
                syntax: ',addon reset',
                example: ',addon reset'
            }
        };
    }

    async execute(message, args, commandName) {
        if (!message.guild) {
            return message.reply(build.warnBox('servers only', 'addons can only be configured in servers.'));
        }

        const db = message.client.db;
        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();
        let targetName = (args?.[1] || '').toLowerCase();

        // 1. Direct invocation via ,enable or ,disable
        if (invoked === 'enable' || invoked === 'on') {
            sub = 'enable';
            if (args[0] && ['add', 'addon', 'module'].includes(args[0].toLowerCase())) {
                targetName = (args[1] || '').toLowerCase();
            } else {
                targetName = (args[0] || '').toLowerCase();
            }
        } else if (invoked === 'disable' || invoked === 'off' || invoked === 'didsable') {
            sub = 'disable';
            if (args[0] && ['add', 'addon', 'module', 'del', 'rem'].includes(args[0].toLowerCase())) {
                targetName = (args[1] || '').toLowerCase();
            } else {
                targetName = (args[0] || '').toLowerCase();
            }
        } else {
            // Invoked via ,addon ...
            if (sub === 'enable' || sub === 'on' || sub === 'add') {
                sub = 'enable';
                if (args[1] && ['add', 'addon', 'module'].includes(args[1].toLowerCase())) {
                    targetName = (args[2] || '').toLowerCase();
                } else {
                    targetName = (args[1] || '').toLowerCase();
                }
            } else if (['disable', 'off', 'didsable', 'dis', 'remove', 'rm', 'delete'].includes(sub)) {
                sub = 'disable';
                if (args[1] && ['add', 'addon', 'module'].includes(args[1].toLowerCase())) {
                    targetName = (args[2] || '').toLowerCase();
                } else {
                    targetName = (args[1] || '').toLowerCase();
                }
            }
        }

        const isOwner = config.owners?.includes(message.author.id);
        const hasAdmin = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
        const p = (message.client.db?.getGuildPrefix) ? (message.client.db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');

        // ──────────────────────── 1. ENABLE ADDON ────────────────────────
        if (sub === 'enable' || sub === 'on') {
            if (!hasAdmin) {
                return message.reply({ embeds: [build.deny(message.author, 'you need manage server permission to toggle addons.')] });
            }

            const syntaxText = (invoked === 'enable') ? `${p}enable <name>` : `${p}addon enable <name>`;
            if (!targetName) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: ${syntaxText}\n-# available: ` + Object.keys(ADDONS).map(k => `\`${k}\``).join(', '))] });
            }

            const addon = resolveAddon(targetName);
            if (!addon) {
                return message.reply({ embeds: [build.warn(message.author, `unknown addon **${targetName}**.\n-# available: ` + Object.keys(ADDONS).map(k => `\`${k}\``).join(', '))] });
            }

            if (db) await db.setAddonState(message.guild.id, addon.id, true);

            return message.reply({
                embeds: [build.approved(message.author, `enabled the **${addon.label}** addon for **${message.guild.name.toLowerCase()}**.`)]
            });
        }

        // ──────────────────────── 2. DISABLE ADDON ────────────────────────
        if (sub === 'disable' || sub === 'off') {
            if (!hasAdmin) {
                return message.reply({ embeds: [build.deny(message.author, 'you need manage server permission to toggle addons.')] });
            }

            const syntaxText = (invoked === 'disable' || invoked === 'didsable') ? `${p}disable <name>` : `${p}addon disable <name>`;
            if (!targetName) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: ${syntaxText}\n-# available: ` + Object.keys(ADDONS).map(k => `\`${k}\``).join(', '))] });
            }

            const addon = resolveAddon(targetName);
            if (!addon) {
                return message.reply({ embeds: [build.warn(message.author, `unknown addon **${targetName}**.\n-# available: ` + Object.keys(ADDONS).map(k => `\`${k}\``).join(', '))] });
            }

            if (db) await db.setAddonState(message.guild.id, addon.id, false);

            return message.reply({
                embeds: [build.approved(message.author, `disabled the **${addon.label}** addon for **${message.guild.name.toLowerCase()}**.`)]
            });
        }

        // ──────────────────────── 3. RESET ADDONS ────────────────────────
        if (sub === 'reset') {
            if (!hasAdmin) {
                return message.reply({ embeds: [build.deny(message.author, 'you need manage server permission to reset addons.')] });
            }

            if (db) await db.resetGuildAddons(message.guild.id);

            return message.reply({
                embeds: [build.approved(message.author, `reset all addons to default configuration for **${message.guild.name.toLowerCase()}**.`)]
            });
        }

        // ──────────────────────── 4. LIST ADDONS (COMPACT) ────────────────────────
        if (sub === 'list') {
            const lines = [];
            for (const [id, addon] of Object.entries(ADDONS)) {
                const isEnabled = db ? db.isAddonEnabled(message.guild.id, id) : addon.default;
                const statusBadge = isEnabled ? '`enabled`' : '`disabled`';
                lines.push(`${addon.emoji} **${addon.label}** · ${statusBadge} — ${addon.description}`);
            }

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### [server addons](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                    `-# current status for **${message.guild.name.toLowerCase()}**\n\n` +
                    lines.join('\n') +
                    `\n\n-# use \`,addon enable <name>\` or \`,addon disable <name>\` to toggle.`
                );

            return message.reply({ embeds: [embed] });
        }

        // ──────────────────────── 5. UNKNOWN SUBCOMMAND GUARD ────────────────────────
        if (sub) {
            const valid = ['enable', 'disable', 'list', 'reset'];
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
                    embeds: [build.say(message.author, `did you mean \`,addon ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,addon [enable|disable|list|reset]\``)]
            });
        }

        // ──────────────────────── 6. LIST / OVERVIEW EMBED (DEFAULT) ────────────────────────
        const lines = [];
        for (const [id, addon] of Object.entries(ADDONS)) {
            const isEnabled = db ? db.isAddonEnabled(message.guild.id, id) : addon.default;
            const statusBadge = isEnabled ? '`enabled`' : '`disabled`';
            lines.push(`${addon.emoji} **${addon.label}** · ${statusBadge} — ${addon.description}`);
        }

        const bannerAtt = build.getAssetAttachment('addons.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || 0x0A0A0C)
            .setDescription(
                `### [server addons](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                `-# current status for **${message.guild.name.toLowerCase()}**\n\n` +
                lines.join('\n') +
                `\n\n-# use \`,addon enable <name>\` or \`,addon disable <name>\` to toggle.`
            );

        if (bannerAtt) {
            embed.setImage(`attachment://${bannerAtt.name}`);
        }

        return message.reply({ embeds: [embed], files, allowedMentions: { repliedUser: false } });
    }
}

module.exports = AddonCommand;
