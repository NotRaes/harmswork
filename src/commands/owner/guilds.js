const { EmbedBuilder } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class GuildsCommand {
    constructor() {
        this.name = 'guilds';
        this.aliases = ['servers', 'serverlist'];
        this.description = 'list all servers harm is currently in.';
        this.syntax = ',guilds [page]';
        this.example = ',guilds 1';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 3;
    }

    async execute(message, args) {
        const client = message.client;
        const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);

        const totalGuilds = guilds.length;
        const totalUsers = guilds.reduce((acc, g) => acc + (g.memberCount || 0), 0);

        if (!totalGuilds) {
            return message.reply(build.warnBox('no servers', 'harm is not currently in any servers.'));
        }

        const pageSize = 10;
        const totalPages = Math.ceil(totalGuilds / pageSize) || 1;
        let page = parseInt(args?.[0] || '1', 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const currentGuilds = guilds.slice(start, end);

        const lines = currentGuilds.map((g, idx) => {
            const num = start + idx + 1;
            return `\`${num}.\` **${g.name.toLowerCase()}** (\`${g.id}\`)\n-# ${g.memberCount.toLocaleString()} members · owner: <@${g.ownerId}>`;
        });

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || 0x0A0A0C)
            .setTitle('harm servers')
            .setDescription(
                `*monitoring **${totalGuilds} servers** hosting **${totalUsers.toLocaleString()} members**.*\n\n` +
                lines.join('\n\n')
            )
            .setFooter({ text: `page ${page}/${totalPages} • total servers: ${totalGuilds}` });

        return message.reply({ embeds: [embed] });
    }
}

module.exports = GuildsCommand;
