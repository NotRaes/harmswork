const { PermissionFlagsBits, ChannelType } = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');

class FishbowlCommand {
    constructor() {
        this.name = 'fishbowl';
        this.aliases = ['cage', 'fb'];
        this.description = 'lock a member in the public fishbowl channel for server members to clown and spectate.';
        this.syntax = ',fishbowl <@user> [reason] or ,fishbowl setup or ,fishbowl reset or ,fishbowl lift <@user>';
        this.example = ',fishbowl @user clown exhibition';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.subcommands = ['fishbowl <@user> [reason]', 'fishbowl setup', 'fishbowl reset', 'fishbowl lift <@user>'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
            !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need moderate members or manage roles permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
            !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles and manage channels permissions to fishbowl members.')] });
        }

        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: ,fishbowl <@user> [reason] or ,fishbowl setup or ,fishbowl reset or ,fishbowl lift <@user>')] });
        }

        const sub = args[0].toLowerCase();

        // Subcommand: reset
        if (sub === 'reset' || sub === 'clear') {
            const cageConfig = await client.db?.getCageConfig(message.guild.id);
            const cageRoleId = cageConfig?.roleId;
            const cageChannelId = cageConfig?.channelId;

            const cageRole = (cageRoleId && message.guild.roles.cache.get(cageRoleId)) ||
                message.guild.roles.cache.find(r => r.name.toLowerCase() === 'fishbowled' || r.name.toLowerCase() === 'caged');
            const cageChannel = (cageChannelId && message.guild.channels.cache.get(cageChannelId)) ||
                message.guild.channels.cache.find(c => (c.name.toLowerCase() === 'fishbowl' || c.name.toLowerCase() === 'cage') && c.type === ChannelType.GuildText);

            if (!cageConfig && !cageRole && !cageChannel) {
                return message.reply(build.warnBox('check the usage', 'fishbowl is not configured in this server.'));
            }

            if (cageChannel && cageChannel.deletable) {
                await cageChannel.delete(`${message.author.tag}: automated harm fishbowl reset`).catch(() => {});
            }

            if (cageRole && cageRole.editable) {
                await cageRole.delete(`${message.author.tag}: automated harm fishbowl reset`).catch(() => {});
            }

            if (client.db?.clearCageConfig) {
                await client.db.clearCageConfig(message.guild.id);
            }

            return message.reply(build.approvedBox('fishbowl reset', 'fishbowl setup has been completely reset.'));
        }

        // Subcommand: setup
        if (sub === 'setup') {
            // Anti-Spam Check: ensure fishbowl is not already configured (matches voicemaster pattern)
            const existingConfig = await client.db?.getCageConfig(message.guild.id);
            if (existingConfig) {
                const roleExists = existingConfig.roleId && message.guild.roles.cache.has(existingConfig.roleId);
                const channelExists = existingConfig.channelId && message.guild.channels.cache.has(existingConfig.channelId);
                if (roleExists || channelExists) {
                    return message.reply(build.warnBox('check the usage', 'fishbowl is already set up here.\nrun `,fishbowl reset` first if you want to rebuild it.'));
                }
            }

            const existingRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'fishbowled' || r.name.toLowerCase() === 'caged');
            const existingChannel = message.guild.channels.cache.find(c => (c.name.toLowerCase() === 'fishbowl' || c.name.toLowerCase() === 'cage') && c.type === ChannelType.GuildText);
            if (existingRole && existingChannel) {
                if (client.db) {
                    await client.db.setCageConfig(message.guild.id, existingRole.id, existingChannel.id);
                }
                return message.reply(build.warnBox('check the usage', 'fishbowl is already set up here.\nrun `,fishbowl reset` first if you want to rebuild it.'));
            }

            const statusMsg = await message.reply(build.sayBox('fishbowl setup', 'configuring public fishbowl spectator channel and role...'));
            try {
                let cageRole = existingRole;
                if (!cageRole) {
                    cageRole = await message.guild.roles.create({
                        name: 'Fishbowled',
                        colors: { primaryColor: 0x992d22 },
                        permissions: [],
                        reason: `${message.author.tag}: automated harm fishbowl setup`
                    });
                }

                let cageChannel = existingChannel;
                if (!cageChannel) {
                    cageChannel = await message.guild.channels.create({
                        name: 'fishbowl',
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: message.guild.roles.everyone.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
                                deny: [PermissionFlagsBits.SendMessages]
                            },
                            {
                                id: cageRole.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                                deny: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
                            },
                            {
                                id: botMember.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
                            }
                        ],
                        reason: `${message.author.tag}: automated harm fishbowl setup`
                    });
                }

                // Deny ViewChannel on all other channels for cageRole
                const channelsToRestrict = message.guild.channels.cache.filter(c =>
                    c.id !== cageChannel.id &&
                    c.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)
                );

                for (const ch of channelsToRestrict.values()) {
                    const current = ch.permissionOverwrites.cache.get(cageRole.id);
                    if (!current || !current.deny.has(PermissionFlagsBits.ViewChannel)) {
                        await ch.permissionOverwrites.edit(cageRole, {
                            ViewChannel: false,
                            SendMessages: false,
                            Connect: false
                        }).catch(() => {});
                    }
                }

                if (client.db) {
                    await client.db.setCageConfig(message.guild.id, cageRole.id, cageChannel.id);
                }

                return statusMsg.edit(build.approvedBox('fishbowl setup', `fishbowl setup complete — role: <@&${cageRole.id}> · channel: <#${cageChannel.id}>`));
            } catch (err) {
                return statusMsg.edit(build.denyBox('fishbowl setup', `failed to setup fishbowl: ${err.message}`));
            }
        }

        // Subcommand: lift / remove
        if (sub === 'lift' || sub === 'remove' || sub === 'uncage' || sub === 'unfishbowl') {
            const unfishbowlCmd = (client.commandHandler?.commands || client.commands)?.get('unfishbowl') || (client.commandHandler?.commands || client.commands)?.get('uncage');
            if (unfishbowlCmd) {
                return unfishbowlCmd.execute(client, message, args.slice(1));
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

        // Fetch cage config
        const cageConfig = await client.db?.getCageConfig(message.guild.id);
        const cageRoleId = cageConfig?.roleId;
        const cageRole = cageRoleId
            ? message.guild.roles.cache.get(cageRoleId)
            : message.guild.roles.cache.find(r => r.name.toLowerCase() === 'fishbowled' || r.name.toLowerCase() === 'caged');

        if (!cageRole) {
            return message.reply({
                embeds: [build.warn(message.author, 'fishbowl system is not configured yet. please run `,fishbowl setup` first.')]
            });
        }

        const alreadyCaged = await client.db?.getCagedUser(message.guild.id, targetUser.id);
        if (alreadyCaged || targetMember.roles.cache.has(cageRole.id)) {
            return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is already in the fishbowl.`)] });
        }

        const reason = args.slice(1).join(' ').trim() || 'clowning in chat';

        // Strip removable roles & give Caged role
        const memberRoles = targetMember.roles.cache.filter(r =>
            r.id !== message.guild.roles.everyone.id &&
            !r.managed &&
            r.position < botMember.roles.highest.position
        );
        const savedRoleIds = memberRoles.map(r => r.id);

        try {
            if (savedRoleIds.length > 0) {
                await targetMember.roles.remove(savedRoleIds, `${message.author.tag} (${message.author.id}) [fishbowl]: stripping roles`);
            }
            await targetMember.roles.add(cageRole, `${message.author.tag} (${message.author.id}) [fishbowl]: thrown into spectator bowl`);
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `failed to fishbowl member: ${err.message}`)] });
        }

        // Save to Database
        if (client.db) {
            await client.db.saveCagedUser(message.guild.id, targetUser.id, savedRoleIds, message.author.id);
        }

        // Create DB Case
        let caseId = 0;
        if (client.db) {
            caseId = await client.db.createModCase({
                guildId: message.guild.id,
                userId: targetUser.id,
                userTag: targetUser.tag || targetUser.username,
                moderatorId: message.author.id,
                moderatorTag: message.author.tag || message.author.username,
                action: 'fishbowl',
                reason,
                duration: 0
            });
        }

        // Send Infraction DM
        await sendInfractionDM(targetUser, message.guild, {
            action: 'fishbowled',
            reason: `${reason} (locked in the public fishbowl for exhibition)`,
            moderator: message.author,
            caseId
        });

        // Send Harm Response
        await sendModResponse(message, {
            action: 'fishbowled (thrown into the public fishbowl for exhibition)',
            target: targetUser,
            reason,
            caseId
        });

        // Log to ModLogs
        await logToModLogs(message.guild, client, {
            action: 'fishbowl',
            target: targetUser,
            moderator: message.author,
            reason: `${reason} (public spectator exhibition)`,
            caseId
        });
    }
}

module.exports = FishbowlCommand;
