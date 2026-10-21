const {
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class StaffroleCommand {
    constructor() {
        this.name = 'staffrole';
        this.aliases = ['bindstaff', 'staffroles'];
        this.description = 'bind or unbind server staff roles for security tracking and demotion protocols.';
        this.syntax = ',staffrole [add @role | remove @role | list]';
        this.example = ',staffrole add @Moderator or ,staffrole list';
        this.category = 'moderation';
        this.permissions = ['ManageGuild'];
        this.cooldown = 2;
        this.subcommands = ['staffrole add <@role>', 'staffrole remove <@role>', 'staffrole list', 'staffrole reset'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need manage server permission to configure staff roles.')] });
        }

        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const sub = (args[0] || '').toLowerCase();

        // Subcommand: reset
        if (sub === 'reset' || sub === 'clear') {
            const current = await client.db.getStaffRoles(message.guild.id);
            if (!current.length) {
                return message.reply({ embeds: [build.warn(message.author, 'no staff roles currently bound to reset.')] });
            }
            if (client.db.clearStaffRoles) {
                await client.db.clearStaffRoles(message.guild.id);
            }
            return message.reply({
                embeds: [build.approved(message.author, `cleared all (${current.length}) recognized staff roles.`)]
            });
        }

        // Subcommand: add
        if (sub === 'add') {
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
            if (!role) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,staffrole add <@role>')] });
            }
            await client.db.addStaffRole(message.guild.id, role.id);
            return message.reply({
                embeds: [build.approved(message.author, `bound <@&${role.id}> as a recognized staff role.`)]
            });
        }

        // Subcommand: remove
        if (sub === 'remove' || sub === 'delete' || sub === 'del') {
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
            if (!role) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,staffrole remove <@role>')] });
            }
            const removed = await client.db.removeStaffRole(message.guild.id, role.id);
            if (!removed) {
                return message.reply({ embeds: [build.warn(message.author, `<@&${role.id}> was not bound as a staff role.`)] });
            }
            return message.reply({
                embeds: [build.approved(message.author, `unbound <@&${role.id}> from recognized staff roles.`)]
            });
        }

        // Subcommand: unknown check
        if (sub && sub !== 'list' && sub !== 'show') {
            const valid = ['add', 'remove', 'list', 'reset'];
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
                    embeds: [build.say(message.author, `did you mean \`,staffrole ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,staffrole [add <@role> | remove <@role> | list | reset]\``)]
            });
        }

        // Subcommand: list (default)
        const staffRoleIds = await client.db.getStaffRoles(message.guild.id);
        const rolesList = staffRoleIds
            .map(id => message.guild.roles.cache.get(id))
            .filter(Boolean)
            .map(r => `<@&${r.id}> (\`${r.id}\`)`);

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';

        if (!rolesList.length) {
            return message.reply({
                embeds: [build.say(message.author, 'no custom staff roles are currently bound. use `,staffrole add <@role>` to bind one.')]
            });
        }

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [recognized staff roles](${supportUrl})\n` +
                        `-# server roles tracked for hierarchy checks and emergency stripstaff protocols.\n\n` +
                        rolesList.map(r => `• ${r}`).join('\n') + '\n\n' +
                        `-# total bound roles: \`${rolesList.length}\``
                    )
                );
            container.addSectionComponents(section);

            await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallback = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(
                    `### [recognized staff roles](${supportUrl})\n` +
                    rolesList.map(r => `• ${r}`).join('\n') + '\n\n' +
                    `*total bound roles: ${rolesList.length}*`
                );
            await message.reply({ embeds: [fallback] });
        }
    }
}

module.exports = StaffroleCommand;
