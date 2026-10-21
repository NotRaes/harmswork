const {
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const { formatDuration } = require('../../structures/utils/helpers/modhelper.js');

class CaseCommand {
    constructor() {
        this.name = 'case';
        this.aliases = ['c'];
        this.description = 'view detailed information for a specific moderation case.';
        this.syntax = ',case <id>';
        this.example = ',case 14';
        this.category = 'moderation';
        this.permissions = ['ModerateMembers'];
        this.cooldown = 2;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the moderate members permission.')] });
        }

        if (!args.length || isNaN(args[0])) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,case <id>')] });
        }

        const caseId = parseInt(args[0], 10);
        if (!client.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const c = await client.db.getModCase(message.guild.id, caseId);
        if (!c) {
            return message.reply({ embeds: [build.warn(message.author, `no moderation case found with id \`#${caseId}\` in this server.`)] });
        }

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const relTime = `<t:${Math.floor(c.created_at / 1000)}:R>`;
        const fullTime = `<t:${Math.floor(c.created_at / 1000)}:f>`;
        const durationText = c.duration > 0 ? ` · **duration:** \`${formatDuration(c.duration)}\`` : '';

        // Fetch user avatar if possible
        const user = await client.users.fetch(c.user_id).catch(() => null);
        const avatarUrl = user ? user.displayAvatarURL({ size: 256 }) : null;

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [case #${c.case_id} — ${c.action.toLowerCase()}](${supportUrl})\n` +
                        `-# **target:** <@${c.user_id}> (\`${c.user_tag || c.user_id}\` · \`${c.user_id}\`)\n` +
                        `-# **moderator:** <@${c.moderator_id}> (\`${c.moderator_tag || c.moderator_id}\`)\n` +
                        `-# **action:** \`${c.action}\`${durationText}\n` +
                        `-# **reason:** ${c.reason || 'no reason provided'}\n` +
                        `-# **date:** ${fullTime} (${relTime})`
                    )
                );

            if (avatarUrl) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
            }
            container.addSectionComponents(section);

            await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallback = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(
                    `### [case #${c.case_id} — ${c.action.toLowerCase()}](${supportUrl})\n` +
                    `**target:** <@${c.user_id}> (\`${c.user_tag || c.user_id}\` · \`${c.user_id}\`)\n` +
                    `**moderator:** <@${c.moderator_id}> (\`${c.moderator_tag || c.moderator_id}\`)\n` +
                    `**action:** \`${c.action}\`${durationText}\n` +
                    `**reason:** ${c.reason || 'no reason provided'}\n` +
                    `**date:** ${fullTime} (${relTime})`
                );
            if (avatarUrl) fallback.setThumbnail(avatarUrl);
            await message.reply({ embeds: [fallback] });
        }
    }
}

module.exports = CaseCommand;
