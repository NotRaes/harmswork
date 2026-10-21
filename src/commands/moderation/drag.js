const { PermissionFlagsBits, ChannelType } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class DragCommand {
    constructor() {
        this.name = 'drag';
        this.aliases = ['toss', 'movecycle'];
        this.description = 'rapidly cycle a member across accessible voice channels in the server.';
        this.syntax = ',drag <@user>';
        this.example = ',drag @user';
        this.category = 'moderation';
        this.permissions = ['MoveMembers'];
        this.cooldown = 5;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the move members permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need the move members permission to execute this.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,drag <@user>')] });
        }

        const resolved = await resolveUserOrMember(message, args[0]);
        if (!resolved || !resolved.member) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
        }

        const targetMember = resolved.member;
        const targetUser = targetMember.user;

        // Hierarchy check
        const check = canModerate(message.member, targetMember, botMember);
        if (!check.can) {
            return message.reply({ embeds: [build.deny(message.author, check.reason)] });
        }

        if (!targetMember.voice.channel) {
            return message.reply({
                embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not currently in a voice channel.`)]
            });
        }

        const originChannel = targetMember.voice.channel;
        const voiceChannels = message.guild.channels.cache.filter(c =>
            (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) &&
            c.id !== originChannel.id &&
            c.permissionsFor(botMember).has(PermissionFlagsBits.Connect) &&
            c.permissionsFor(botMember).has(PermissionFlagsBits.MoveMembers)
        );

        if (voiceChannels.size === 0) {
            return message.reply({
                embeds: [build.warn(message.author, 'there are not enough accessible voice channels to drag this member.')]
            });
        }

        const statusMsg = await message.reply({
            embeds: [build.say(message.author, `moving **${targetUser.tag || targetUser.username}** across voice channels...`)]
        });

        // Pick up to 6 random channels
        const channelsArray = Array.from(voiceChannels.values());
        const shuffled = channelsArray.sort(() => 0.5 - Math.random()).slice(0, 6);

        let hops = 0;
        for (const ch of shuffled) {
            // Check if member disconnected midway
            if (!targetMember.voice.channel) break;
            try {
                await targetMember.voice.setChannel(ch.id, `${message.author.tag} (${message.author.id}): harm drag`);
                hops++;
                await new Promise(r => setTimeout(r, 280));
            } catch (_) {
                break;
            }
        }

        // Return to origin channel if still connected
        if (targetMember.voice.channel) {
            await targetMember.voice.setChannel(originChannel.id, 'harm drag return').catch(() => {});
        }

        return statusMsg.edit({
            embeds: [build.approved(message.author, `moved **${targetUser.tag || targetUser.username}** across **${hops}** voice channels.`)]
        });
    }
}

module.exports = DragCommand;
