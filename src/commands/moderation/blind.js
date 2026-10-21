const { PermissionFlagsBits } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class BlindCommand {
    constructor() {
        this.name = 'blind';
        this.aliases = ['blackout', 'isolate'];
        this.description = 'hide all channels from a member so no channels appear for them.';
        this.syntax = ',blind <@user> [reason] or ,blind lift <@user>';
        this.example = ',blind @user toxicity in all channels';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.cooldown = 3;
        this.subcommands = ['blind <@user> [reason]', 'blind lift <@user>'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
            !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need moderate members or manage roles permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
            !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles and manage channels permissions to blind members.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,blind <@user> [reason] or ,blind lift <@user>')] });
        }

        // Subcommand: lift / remove
        if (args[0].toLowerCase() === 'lift' || args[0].toLowerCase() === 'remove') {
            const unblindCmd = (client.commandHandler?.commands || client.commands)?.get('unblind');
            if (unblindCmd) {
                return unblindCmd.execute(client, message, args.slice(1));
            }
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

        // 1. Fetch or create Blinded role
        let blindRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'blinded');
        if (!blindRole) {
            try {
                blindRole = await message.guild.roles.create({
                    name: 'Blinded',
                    colors: { primaryColor: 0x111214 },
                    permissions: [],
                    reason: `${message.author.tag}: automated harm blind setup`
                });
            } catch (err) {
                return message.reply({ embeds: [build.deny(message.author, `failed to create blinded role: ${err.message}`)] });
            }
        }

        // Check if already blinded
        const alreadyBlinded = await client.db?.getBlindedUser(message.guild.id, targetUser.id);
        if (alreadyBlinded || targetMember.roles.cache.has(blindRole.id)) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already blinded.`)] });
        }

        const reason = args.slice(1).join(' ').trim() || 'no reason provided';

        // 2. Ensure Blinded role has ViewChannel: false across all manageable channels
        const channelsToHide = message.guild.channels.cache.filter(c =>
            c.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)
        );

        for (const ch of channelsToHide.values()) {
            const current = ch.permissionOverwrites.cache.get(blindRole.id);
            if (!current || !current.deny.has(PermissionFlagsBits.ViewChannel)) {
                await ch.permissionOverwrites.edit(blindRole, {
                    ViewChannel: false,
                    SendMessages: false,
                    Connect: false
                }).catch(() => {});
            }
        }

        // 3. Collect member's removable roles
        const memberRoles = targetMember.roles.cache.filter(r =>
            r.id !== message.guild.roles.everyone.id &&
            !r.managed &&
            r.position < botMember.roles.highest.position
        );
        const savedRoleIds = memberRoles.map(r => r.id);

        // 4. Strip roles & assign Blinded role
        try {
            if (savedRoleIds.length > 0) {
                await targetMember.roles.remove(savedRoleIds, `${message.author.tag} (${message.author.id}) [blinded]: stripping roles`);
            }
            await targetMember.roles.add(blindRole, `${message.author.tag} (${message.author.id}) [blinded]: hiding all channels`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to blind member: ${err.message}`)] });
        }

        // 5. Save to Database for persistence
        if (client.db) {
            await client.db.saveBlindedUser(message.guild.id, targetUser.id, savedRoleIds, reason, message.author.id);
        }

        // 6. Create DB Case
        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetUser.id,
                userTag: targetUser.tag || targetUser.username,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'blind',
                reason,
                duration: 0
            });
        }

        // 7. Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: 'blinded',
            reason: `${reason} (all channels hidden)`,
            moderator: message.author,
            caseId
        });

        // 8. Send Harm Response
        await sendModResponse(message, {
            action: 'blinded (all channels hidden & roles isolated)',
            target: targetUser,
            reason,
            caseId
        });

        // 9. Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'blind',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (all channels hidden)`,
            caseId
        });
    }
}

module.exports = BlindCommand;
