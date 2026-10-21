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
const { parseDuration, logToModLogs } = require('../../structures/utils/helpers/modhelper.js');

const MAX_SLOWMODE_SECONDS = 21600; // Discord limit: 6 hours

class SlowmodeCommand {
    constructor() {
        this.name = 'slowmode';
        this.aliases = ['sm'];
        this.description = 'set or disable the message rate limit in a channel.';
        this.syntax = ',slowmode <duration/off> [#channel]';
        this.example = ',slowmode 5s or ,slowmode off';
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

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,slowmode <duration/off> [#channel]')] });
        }

        let targetChannel = message.mentions.channels.first() || message.channel;
        const inputArg = args.find(a => !a.startsWith('<#')) || args[0];

        let seconds = 0;
        let isOff = false;

        if (inputArg.toLowerCase() === 'off' || inputArg === '0' || inputArg === '0s') {
            seconds = 0;
            isOff = true;
        } else {
            const parsed = parseDuration(inputArg);
            if (!parsed || parsed.seconds < 0 || parsed.seconds > MAX_SLOWMODE_SECONDS) {
                return message.reply({
                    embeds: [build.warn(message.author, 'slowmode duration must be between `1s` and `6h` (e.g. `5s`, `10s`, `1m`, `off`).')]
                });
            }
            seconds = parsed.seconds;
        }

        if (!targetChannel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, `i cannot manage permissions in <#${targetChannel.id}>.`)] });
        }

        try {
            await targetChannel.setRateLimitPerUser(seconds, `${message.author.tag} (${message.author.id}): slowmode updated`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to update slowmode: ${err.message}`)] });
        }

        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const approveEmoji = config.emojis?.approve || '<:harm_tick:1558811267014066366>';

        const statusText = isOff
            ? `disabled slowmode in <#${targetChannel.id}>.`
            : `set slowmode in <#${targetChannel.id}> to \`${seconds}s\`.`;

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [channel slowmode](${supportUrl})\n` +
                        `-# ${approveEmoji} ${statusText}\n` +
                        `-# **moderator:** <@${message.author.id}>`
                    )
                );
            container.addSectionComponents(section);

            await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            await message.reply({
                embeds: [build.approved(message.author, statusText)]
            });
        }

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'slowmode',
            target: { id: targetChannel.id, tag: `#${targetChannel.name}` },
            moderator: message.author,
            reason: isOff ? 'disabled' : `${seconds}s delay`,
            caseId: 0
        });
    }
}

module.exports = SlowmodeCommand;
