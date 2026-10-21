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

class UnhideCommand {
    constructor() {
        this.name = 'unhide';
        this.aliases = ['uh'];
        this.description = 'unhide a previously hidden channel for @everyone.';
        this.syntax = ',unhide [#channel] [reason]';
        this.example = ',unhide #discussion public view restored';
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

        if (!currentOverwrite || !currentOverwrite.deny.has(PermissionFlagsBits.ViewChannel)) {
            return message.reply({ embeds: [build.warn(message.author, `<#${targetChannel.id}> is not currently hidden.`)] });
        }

        try {
            await targetChannel.permissionOverwrites.edit(everyoneRole, {
                ViewChannel: null
            }, {
                reason: `${message.author.tag} (${message.author.id}): ${reason}`
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to unhide channel: ${err.message}`)] });
        }

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const approveEmoji = config.emojis?.approve || '<:harm_tick:1558811267014066366>';

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [channel unhidden](${supportUrl})\n` +
                        `-# ${approveEmoji} unhid <#${targetChannel.id}> for **@everyone**.\n` +
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
                embeds: [build.approved(message.author, `unhid <#${targetChannel.id}> for @everyone — ${reason}`)]
            });
        }

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'unhide',
            target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
            moderator: message.author,
            reason,
            caseId: 0
        });
    }
}

module.exports = UnhideCommand;
