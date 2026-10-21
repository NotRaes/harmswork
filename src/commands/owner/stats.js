const { EmbedBuilder, version: djsVersion } = require('discord.js');
const os = require('os');
const config = require('../../config.js');

class StatsCommand {
    constructor() {
        this.name = 'stats';
        this.aliases = ['sys', 'system', 'host', 'telemetry'];
        this.description = 'display host system, process, and engine telemetry.';
        this.syntax = ',stats';
        this.example = ',stats';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 2;
    }

    async execute(message) {
        const client = message.client;
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeStr = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;

        const mem = process.memoryUsage();
        const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);

        const totalSysMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
        const freeSysMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);

        const guildsCount = client.guilds.cache.size;
        const usersCount = client.users.cache.size;
        const channelsCount = client.channels.cache.size;
        const ping = Math.round(client.ws.ping);

        const embed = new EmbedBuilder()
            .setColor(config.colors.c || 0x0A0A0C)
            .setDescription(
                `### [harm telemetry & runtime](https://discord.gg/hCQhTmPf2G)\n` +
                `-# internal operational telemetry and host performance statistics.\n\n` +
                `**system status**\n` +
                `**platform** \`${os.platform()} (${os.arch()})\` · **cpus** \`${os.cpus().length} cores\`\n` +
                `**ram** \`${freeSysMem} gb free / ${totalSysMem} gb total\` · **process rss** \`${rssMB} mb\`\n` +
                `**heap** \`${heapUsedMB} mb / ${heapTotalMB} mb\` · **uptime** \`${uptimeStr}\`\n\n` +
                `**runtime & bot**\n` +
                `**node** \`${process.version}\` · **discord.js** \`v${djsVersion}\`\n` +
                `**websocket** \`${ping}ms\` · **guilds** \`${guildsCount}\`\n` +
                `**users cached** \`${usersCount.toLocaleString()}\` · **channels** \`${channelsCount.toLocaleString()}\``
            );

        return message.reply({ embeds: [embed] });
    }
}

module.exports = StatsCommand;
