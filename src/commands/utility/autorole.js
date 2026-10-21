const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function resolveRole(guild, query) {
    if (!query) return null;
    const clean = query.trim();
    const mentionMatch = clean.match(/^<@&(\d{17,20})>$/);
    if (mentionMatch) return guild.roles.cache.get(mentionMatch[1]) || null;
    if (/^\d{17,20}$/.test(clean)) return guild.roles.cache.get(clean) || null;
    const lower = clean.toLowerCase();
    const exact = guild.roles.cache.find(r => r.name.toLowerCase() === lower);
    if (exact) return exact;
    const starts = guild.roles.cache.find(r => r.name.toLowerCase().startsWith(lower));
    if (starts) return starts;
    return guild.roles.cache.find(r => r.name.toLowerCase().includes(lower)) || null;
}

class AutoroleCommand {
    constructor() {
        this.name = 'autorole';
        this.aliases = ['ar'];
        this.description = 'automatically assign roles to members or bots upon joining.';
        this.syntax = ',autorole <add|remove|list|clear|bots> [role]';
        this.example = ',autorole add Member';
        this.category = 'utility';
        this.permissions = ['ManageRoles'];
        this.cooldown = 3;
        this.subcommands = [
            'autorole add <role>',
            'autorole bots <role>',
            'autorole remove <role>',
            'autorole list',
            'autorole clear'
        ];
        this.subcommandDetails = {
            add: {
                description: 'add an autorole given to all joining human members.',
                syntax: ',autorole add <role>',
                example: ',autorole add Member'
            },
            bots: {
                description: 'add an autorole given to all joining bot members.',
                syntax: ',autorole bots <role>',
                example: ',autorole bots Bots'
            },
            remove: {
                description: 'remove an existing role from the autoroles list.',
                syntax: ',autorole remove <role>',
                example: ',autorole remove Member'
            },
            list: {
                description: 'view all configured autoroles for this server.',
                syntax: ',autorole list',
                example: ',autorole list'
            },
            clear: {
                description: 'remove all autoroles for this server.',
                syntax: ',autorole clear',
                example: ',autorole clear'
            }
        };
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply({ embeds: [build.warn(message.author, 'this command can only be used in servers.')] });
        }

        const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
        const hasPerms = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageRoles);
        if (!hasPerms) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the manage roles permission to configure autoroles.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles permission to assign autoroles.')] });
        }

        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database subsystem is currently offline.')] });
        }

        const sub = (args?.[0] || '').toLowerCase();
        const roleQuery = args.slice(1).join(' ').trim();
        const p = (db?.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');

        // ──────────────────────── 1. LIST / OVERVIEW ────────────────────────
        if (sub === 'list' || sub === 'show' || sub === '') {
            const list = db.getAutoroles(message.guild.id);
            if (!list || list.length === 0) {
                return message.reply({
                    embeds: [build.warn(message.author, `no autoroles configured in this server.\n-# run \`${p}autorole add <role>\` to set one.`)]
                });
            }

            const humanRoles = list.filter(r => r.targetType !== 'bots');
            const botRoles = list.filter(r => r.targetType === 'bots');

            const humanFormatted = humanRoles.length > 0
                ? humanRoles.map(r => message.guild.roles.cache.has(r.roleId) ? `<@&${r.roleId}>` : `\`deleted-role (${r.roleId})\``).join(' · ')
                : '*none configured*';

            const botFormatted = botRoles.length > 0
                ? botRoles.map(r => message.guild.roles.cache.has(r.roleId) ? `<@&${r.roleId}>` : `\`deleted-role (${r.roleId})\``).join(' · ')
                : '*none configured*';

            const bannerAtt = build.getAssetAttachment('utility.png') || build.getAssetAttachment('banner.png');
            const files = bannerAtt ? [bannerAtt] : [];

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(
                    `### [autoroles](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                    `-# automatic role assignments for joining members.\n\n` +
                    `**humans**\n${humanFormatted}\n\n` +
                    `**bots**\n${botFormatted}\n\n` +
                    `-# total: \`${list.length}\` configured • \`${p}autorole add <role>\` • \`${p}autorole reset\``
                );

            if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

            return message.reply({ embeds: [embed], files });
        }

        // ──────────────────────── 2. CLEAR ────────────────────────
        if (sub === 'clear' || sub === 'reset') {
            await db.clearAutoroles(message.guild.id);
            return message.reply({
                embeds: [build.approved(message.author, 'cleared all configured autoroles.')]
            });
        }

        // ──────────────────────── 3. ADD / BOT / BOTS ────────────────────────
        if (sub === 'add' || sub === 'bot' || sub === 'bots') {
            if (!roleQuery) {
                return message.reply({ embeds: [build.warn(message.author, `specify a role name, id, or mention. syntax: \`${p}autorole add <role>\``)] });
            }

            const role = resolveRole(message.guild, roleQuery);
            if (!role) {
                return message.reply({
                    embeds: [build.warn(message.author, `could not find a role matching \`${roleQuery}\`.`)]
                });
            }

            if (role.id === message.guild.id) {
                return message.reply({
                    embeds: [build.deny(message.author, 'cannot assign the @everyone role as an autorole.')]
                });
            }

            if (role.managed) {
                return message.reply({
                    embeds: [build.deny(message.author, 'cannot assign an integration or managed role as an autorole.')]
                });
            }

            const botHighest = botMember.roles.highest.position;
            if (role.position >= botHighest) {
                return message.reply({
                    embeds: [build.deny(message.author, 'that role is higher than or equal to my highest role.')]
                });
            }

            const memberHighest = message.member.roles.highest.position;
            if (!isOwner && role.position >= memberHighest) {
                return message.reply({
                    embeds: [build.deny(message.author, 'that role is higher than or equal to your highest role.')]
                });
            }

            const targetType = (sub === 'bot' || sub === 'bots') ? 'bots' : 'humans';
            const currentList = db.getAutoroles(message.guild.id);
            const alreadyExists = currentList.some(r => r.roleId === role.id && r.targetType === targetType);
            if (alreadyExists) {
                return message.reply({
                    embeds: [build.warn(message.author, `<@&${role.id}> is already an autorole for **${targetType}**.`)]
                });
            }

            await db.addAutorole(message.guild.id, role.id, targetType);
            return message.reply({
                embeds: [build.approved(message.author, `added <@&${role.id}> to **${targetType}** autoroles.`)]
            });
        }

        // ──────────────────────── 4. REMOVE ────────────────────────
        if (sub === 'remove' || sub === 'delete' || sub === 'del' || sub === 'rem') {
            if (!roleQuery) {
                return message.reply({ embeds: [build.warn(message.author, `specify a role name, id, or mention to remove. syntax: \`${p}autorole remove <role>\``)] });
            }

            const role = resolveRole(message.guild, roleQuery);
            const roleIdToRemove = role ? role.id : roleQuery.replace(/[<@&>]/g, '').trim();

            const removed = await db.removeAutorole(message.guild.id, roleIdToRemove);
            if (!removed) {
                return message.reply({
                    embeds: [build.warn(message.author, `that role is not in the server autoroles list.`)]
                });
            }

            return message.reply({
                embeds: [build.approved(message.author, `removed <@&${roleIdToRemove}> from autoroles.`)]
            });
        }

        // Unknown subcommand -> typo check or syntax warning
        if (sub) {
            const valid = ['add', 'remove', 'list', 'clear', 'reset', 'bots'];
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
                    embeds: [build.say(message.author, `did you mean \`,autorole ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,autorole [add|remove|list|clear|reset]\``)]
            });
        }

        return build.help(message, this);
    }
}

module.exports = AutoroleCommand;
