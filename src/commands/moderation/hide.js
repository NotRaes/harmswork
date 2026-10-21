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
const { logToModLogs } = require('../../structures/utils/helpers/modhelper.js');

class HideCommand {
    constructor() {
        this.name = 'hide';
        this.aliases = [];
        this.description = 'hide a channel so @everyone cannot view it.';
        this.syntax = ',hide [#channel] [reason]';
        this.example = ',hide #discussion maintenance';
        this.category = 'moderation';
        this.permissions = ['ManageChannels'];
        this.cooldown = 2;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the manage channels permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the manage channels permission to execute this.')] });
        }

        let targetChannel = message.mentions.channels.first();
        let reasonArgs = args;

        if (targetChannel) {
            reasonArgs = args.filter(a => !a.startsWith('<#'));
        } else {
            targetChannel = message.channel;
        }

        const reason = reasonArgs.join(' ').trim() || 'no reason provided';

        if (!targetChannel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, `i cannot manage permissions in <#${targetChannel.id}>.`)] });
        }

        const everyoneRole = message.guild.roles.everyone;
        const currentOverwrite = targetChannel.permissionOverwrites.cache.get(everyoneRole.id);

        if (currentOverwrite && currentOverwrite.deny.has(PermissionFlagsBits.ViewChannel)) {
            return message.reply({ embeds: [build.warn(message.author, `<#${targetChannel.id}> is already hidden.`)] });
        }

        try {
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                ViewChannel: false
            }, {
                reason: `${message.author.tag} (${message.author.id}): ${reason}`
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to hide channel: ${err.message}`)] });
        }

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const approveEmoji = config.emojis?.approve || '<:harm_tick:1558811267014066366>';

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [channel hidden](${supportUrl})\n` +
                        `-# ${approveEmoji} hid <#${targetChannel.id}> from **@everyone**.\n` +
                        `-# **moderator:** <@${message.author.id}> · **reason:** ${reason}`
                    )
                );
            container.addSectionComponents(section);

            await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            await message.reply({
                embeds: [build.approved(message.author, `hid <#${targetChannel.id}> from @everyone — ${reason}`)]
            });
        }

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'hide',
            target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
            moderator: message.author,
            reason,
            caseId: 0
        });
    }
}

module.exports = HideCommand;
