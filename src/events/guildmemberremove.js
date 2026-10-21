const EmbedParser = require('../structures/utils/helpers/embedparser.js');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');

class GuildMemberRemoveEvent {
    constructor(client) {
        this.name = 'guildMemberRemove';
        this.once = false;
        this.client = client;
    }

    async execute(member) {
        if (!member || !member.guild || member.user?.bot) return;
        const db = this.client.db;
        if (!db) return;

        await db.recordGuildMovement(member.guild.id, 'leave').catch(() => {});
        await db.recordInviteLeave(member.guild.id, member.id).catch(() => {});

        // Dispatch Leave / Goodbye Message
        try {
            const leaveConfig = db.getLeaveConfig(member.guild.id);
            if (leaveConfig && leaveConfig.enabled && leaveConfig.channel_id) {
                const leaveCh = member.guild.channels.cache.get(leaveConfig.channel_id);
                if (leaveCh && leaveCh.isTextBased() && leaveCh.permissionsFor(member.guild.members.me)?.has(['ViewChannel', 'SendMessages'])) {
                    let payload;
                    if (leaveConfig.message) {
                        payload = await EmbedParser.parse(
                            leaveConfig.message,
                            { member, guild: member.guild },
                            db,
                            member.guild.id
                        );
                    } else {
                        const embed = new EmbedBuilder()
                            .setColor(config.colors.c || '#0A0A0C')
                            .setDescription(
                                `### goodbye <@${member.id}>\n` +
                                `-# **${member.user?.tag || member.user?.username}** left the server. down to \`${member.guild.memberCount}\` members.`
                            );
                        payload = { embeds: [embed] };
                    }

                    if (payload && (payload.content || payload.embeds?.length > 0)) {
                        const sent = await leaveCh.send(payload).catch(() => null);
                        if (sent && leaveConfig.autodelete > 0) {
                            setTimeout(() => sent.delete().catch(() => {}), leaveConfig.autodelete * 1000);
                        }
                    }
                }
            }
        } catch (_) {}
    }
}

module.exports = GuildMemberRemoveEvent;
