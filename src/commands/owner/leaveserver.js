const build = require('../../structures/utils/builder.js');

class LeaveServerCommand {
    constructor() {
        this.name = 'leaveserver';
        this.aliases = ['leaveguild', 'guildleave'];
        this.description = 'force harm to leave a server by id.';
        this.syntax = ',leaveserver <guild_id>';
        this.example = ',leaveserver 123456789012345678';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 2;
    }

    async execute(message, args) {
        const guildId = args?.[0]?.trim() || message.guild?.id;
        if (!guildId) {
            return message.reply(build.warnBox('missing guild id', 'provide the target server id to leave.'));
        }

        const guild = message.client.guilds.cache.get(guildId)
            || await message.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return message.reply(build.denyBox('not found', `harm is not in a server with id \`${guildId}\`.`));
        }

        const guildName = guild.name;
        const isCurrentGuild = message.guild?.id === guild.id;

        try {
            if (isCurrentGuild) {
                await message.reply({ embeds: [build.approved(message.author, `leaving **${guildName.toLowerCase()}** (\`${guild.id}\`)...`)] }).catch(() => {});
                await guild.leave();
            } else {
                await guild.leave();
                return message.reply({ embeds: [build.approved(message.author, `left **${guildName.toLowerCase()}** (\`${guild.id}\`).`)] });
            }
        } catch (err) {
            return message.reply(build.denyBox('error', `failed to leave server: ${err.message}`));
        }
    }
}

module.exports = LeaveServerCommand;
