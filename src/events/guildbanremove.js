const { PermissionFlagsBits } = require('discord.js');

class GuildBanRemoveEvent {
    constructor(client) {
        this.name = 'guildBanRemove';
        this.once = false;
        this.client = client;
    }

    async execute(ban) {
        if (!ban || !ban.guild || !ban.user) return;
        const guild = ban.guild;
        const user = ban.user;
        const db = this.client.db;

        if (!db) return;

        try {
            // Check if user is registered in hardbans
            const isHardbanned = await db.isHardbanned(guild.id, user.id);
            if (isHardbanned) {
                const botMember = guild.members.me;
                if (botMember && botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
                    await guild.bans.create(user.id, {
                        reason: 'harm hardban: unauthorized manual unban prevented'
                    }).catch(() => {});
                }
            }
        } catch (_) {}
    }
}

module.exports = GuildBanRemoveEvent;
