const {
    AttachmentBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const LevelingCard = require('../../structures/utils/helpers/levelingcard.js');
const build = require('../../structures/utils/builder.js');

class RankCommand {
    constructor() {
        this.name = 'rank';
        this.aliases = ['level', 'lvl', 'xp'];
        this.description = 'view your or another user\'s server rank, level, and progression card.';
        this.category = 'leveling';
        this.cooldown = 3;
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply({ embeds: [build.deny(message.author, 'this command can only be used in a server.')] });
        }

        let targetMember = message.member;
        let targetUser = message.author;

        if (args.length > 0) {
            const query = args.join(' ');
            const mentionMatch = query.match(/^<@!?(\d+)>$/);
            const targetId = mentionMatch ? mentionMatch[1] : (args[0].match(/^\d{17,20}$/) ? args[0] : null);

            if (targetId) {
                targetMember = message.guild.members.cache.get(targetId) || await message.guild.members.fetch(targetId).catch(() => null);
                if (targetMember) targetUser = targetMember.user;
                else targetUser = await message.client.users.fetch(targetId).catch(() => null);
            } else {
                const search = query.toLowerCase();
                targetMember = message.guild.members.cache.find(m => 
                    m.user.username.toLowerCase().includes(search) || 
                    (m.nickname && m.nickname.toLowerCase().includes(search))
                );
                if (targetMember) targetUser = targetMember.user;
            }
        }

        if (!targetUser) {
            return message.reply({ embeds: [build.warn(message.author, 'could not find that member.')] });
        }

        if (targetUser.bot) {
            return message.reply({ embeds: [build.warn(message.author, 'bots do not have server levels or progression.')] });
        }

        const db = message.client.db;
        const userData = await db.getUserLevel(message.guild.id, targetUser.id);
        const rank = await db.getUserLevelRank(message.guild.id, targetUser.id);
        const status = targetMember?.presence?.status || 'offline';

        const buffer = await LevelingCard.render({
            user: targetUser,
            member: targetMember,
            level: userData.level,
            totalXp: userData.xp,
            rank,
            messages: userData.messages,
            voiceSeconds: userData.voice_seconds,
            status
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://rank.png')
                )
            );

            return await message.reply({
                components: [container],
                files: [attachment],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setImage('attachment://rank.png');

            return await message.reply({
                embeds: [fallbackEmbed],
                files: [attachment]
            }).catch(() => {});
        }
    }
}

module.exports = RankCommand;
