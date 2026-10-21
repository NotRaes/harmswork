const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const {
    SOCIAL_ACTIONS,
    fetchActionMedia,
    resolveTarget
} = require('../../structures/utils/helpers/socialhelper.js');

class SocialCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'social';
        this.aliases = ['interact', 'action'];
        this.description = 'interactive roleplay actions and expressions powered by live anime apis.';
        this.syntax = ',social <action> [@user]';
        this.example = ',social hug @user\n,social slap @user\n,social cry';
        this.category = 'fun';
        this.cooldown = 3;
    }

    renderDirectory() {
        const aff = ['hug', 'kiss', 'cuddle', 'pat', 'handhold'].map(a => `\`${a}\``).join(' · ');
        const chaos = ['slap', 'punch', 'bite', 'poke', 'tickle', 'yeet'].map(a => `\`${a}\``).join(' · ');
        const solo = ['cry', 'blush'].map(a => `\`${a}\``).join(' · ');

        return new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setDescription(
                `### [social interactions](https://discord.gg/hCQhTmPf2G)\n` +
                `-# interactive anime expressions and targeted roleplay actions.\n\n` +
                `**affection**\n` +
                `${aff}\n\n` +
                `**playful chaos**\n` +
                `${chaos}\n\n` +
                `**reactions**\n` +
                `${solo}\n\n` +
                `-# **syntax:** \`,social <action> <@user>\` or \`,social <reaction>\``
            );
    }

    async execute(message, args) {
        if (!args || args.length === 0) {
            return message.reply({ embeds: [this.renderDirectory()] });
        }

        const actName = args[0].toLowerCase();

        if (actName === 'list' || actName === 'help') {
            return message.reply({ embeds: [this.renderDirectory()] });
        }

        const act = SOCIAL_ACTIONS[actName];
        if (!act) {
            return message.reply({
                embeds: [build.warn(message.author, `unknown social action \`${actName}\`. run \`,social\` to view all actions.`)]
            });
        }

        // 1. Solo Reaction (cry, blush)
        if (act.solo) {
            const media = await fetchActionMedia(actName);
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### <@${message.author.id}> ${act.verb}\n` +
                    `-# ${act.phrase} · anime: ${media.anime}`
                )
                .setImage(media.url);
            return message.reply({ embeds: [embed] });
        }

        // 2. Targeted Action (Category A & B)
        const targetArgs = args.slice(1);
        const target = resolveTarget(message, targetArgs);

        if (!target) {
            return message.reply({
                embeds: [build.warn(message.author, `syntax: \`,social ${actName} <@user>\``)]
            });
        }

        // Self-interaction
        if (target.id === message.author.id) {
            const media = await fetchActionMedia(actName);
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### <@${message.author.id}> ${act.self}\n` +
                    `-# anime: ${media.anime}`
                )
                .setImage(media.url);
            return message.reply({ embeds: [embed] });
        }

        // Bot interaction
        if (target.id === message.client.user.id) {
            const media = await fetchActionMedia(actName);
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### <@${message.author.id}> ${act.verb} <@${target.id}>\n` +
                    `-# ${act.bot} · anime: ${media.anime}`
                )
                .setImage(media.url);
            return message.reply({ embeds: [embed] });
        }

        // Valid member target
        const media = await fetchActionMedia(actName);
        const embed = new EmbedBuilder()
            .setColor(config.colors.c || '#0A0A0C')
            .setDescription(
                `### <@${message.author.id}> ${act.verb} <@${target.id}>\n` +
                `-# ${act.phrase} · anime: ${media.anime}`
            )
            .setImage(media.url);

        const emoji = config.emojis?.[act.emojiKey] || config.emojis?.harm_heart || '<:harm_heart:1559895595848695960>';
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`soc_${actName}_${message.author.id}_${target.id}`)
                .setLabel(`${act.noun} back`)
                .setEmoji(emoji)
                .setStyle(ButtonStyle.Danger) // Red button
        );

        const replyMsg = await message.reply({ embeds: [embed], components: [row] }).catch(() => null);
        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({
            filter: i => i.customId === `soc_${actName}_${message.author.id}_${target.id}`,
            time: 45000
        });

        collector.on('collect', async i => {
            if (i.user.id !== target.id) {
                return i.reply({
                    content: `only <@${target.id}> can return this ${act.noun}.`,
                    ephemeral: true
                }).catch(() => {});
            }

            const retMedia = await fetchActionMedia(actName);
            const retEmbed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setDescription(
                    `### <@${target.id}> ${act.verb} <@${message.author.id}> back!\n` +
                    `-# ${act.phrase} · anime: ${retMedia.anime}`
                )
                .setImage(retMedia.url);

            await i.update({ components: [] }).catch(() => {});
            await message.channel.send({ embeds: [retEmbed] }).catch(() => {});
            collector.stop('returned');
        });

        collector.on('end', async (_, reason) => {
            if (reason !== 'returned') {
                await replyMsg.edit({ components: [] }).catch(() => {});
            }
        });
    }
}

module.exports = SocialCommand;
