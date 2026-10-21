const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class DivorceCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'divorce';
        this.aliases = ['breakup'];
        this.description = 'dissolve your marriage and reset your couple affinity perks.';
        this.syntax = ',divorce';
        this.example = ',divorce';
        this.category = 'fun';
        this.cooldown = 5;
        this.permissions = [];
        this.extraArguments = 'divorcing resets your marriage level and the +15% daily bonus.';
    }

    async execute(message) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const guildId = message.guild?.id || 'global';
        const marriage = await db.getMarriage(guildId, message.author.id);

        if (!marriage) {
            return message.reply({
                embeds: [build.warn(message.author, 'you are not married to anyone.')]
            });
        }

        const partnerMention = `<@${marriage.partnerId}>`;
        const warnEmbed = build.warn(
            message.author,
            `are you sure you want to divorce ${partnerMention}? this will permanently dissolve your marriage and reset your couple perks.`
        );

        const e = config.emojis || {};
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('divorce_confirm')
                .setLabel('confirm divorce')
                .setEmoji(e.deny || '<:harm_deny:1558811268608167939>')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('divorce_cancel')
                .setLabel('cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        const confirmMsg = await message.reply({
            embeds: [warnEmbed],
            components: [row]
        }).catch(() => null);

        if (!confirmMsg) return;

        const collector = confirmMsg.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    content: 'only the command author can confirm this divorce.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            collector.stop('answered');

            if (i.customId === 'divorce_confirm') {
                await db.deleteMarriage(guildId, message.author.id);
                const approvedEmbed = build.approved(
                    message.author,
                    `you have officially divorced ${partnerMention}. you are now single.`
                );
                return i.update({
                    embeds: [approvedEmbed],
                    components: []
                }).catch(() => {});
            } else {
                const cancelEmbed = build.say(
                    message.author,
                    'divorce cancelled. your marriage remains intact.'
                );
                return i.update({
                    embeds: [cancelEmbed],
                    components: []
                }).catch(() => {});
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'answered' || reason === 'deleted') return;
            const timedOutEmbed = build.warn(
                message.author,
                'divorce request timed out without confirmation.'
            );
            await confirmMsg.edit({
                embeds: [timedOutEmbed],
                components: []
            }).catch(() => {});
        });
    }
}

module.exports = DivorceCommand;
