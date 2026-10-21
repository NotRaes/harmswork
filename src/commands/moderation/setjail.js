const {
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ChannelType
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class SetjailCommand {
    constructor() {
        this.name = 'setjail';
        this.aliases = ['setupjail'];
        this.description = 'configure or automatically create the server jail system.';
        this.syntax = ',setjail [setup | role @role | channel #channel]';
        this.example = ',setjail setup';
        this.category = 'moderation';
        this.permissions = ['ManageGuild'];
        this.subcommands = ['setjail setup', 'setjail role <@role>', 'setjail channel <#channel>', 'setjail reset'];
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need manage server permission to configure jail.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles and manage channels permissions.')] });
        }

        const sub = args[0]?.toLowerCase();

        // Subcommand: setjail reset
        if (sub === 'reset' || sub === 'clear') {
            const existing = await client.db?.getJailConfig(message.guild.id);
            if (!existing || (!existing.roleId && !existing.channelId)) {
                return message.reply({ embeds: [build.warn(message.author, 'jail system is not configured in this server.')] });
            }

            if (client.db?.clearJailConfig) {
                await client.db.clearJailConfig(message.guild.id);
            }

            return message.reply({
                embeds: [build.approved(message.author, 'reset jail configuration.')]
            });
        }

        // Subcommand: setjail role @role
        if (sub === 'role') {
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
            if (!role) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,setjail role <@role>')] });
            }
            const existing = await client.db?.getJailConfig(message.guild.id);
            await client.db?.setJailConfig(message.guild.id, role.id, existing?.channelId || null);
            return message.reply({
                embeds: [build.approved(message.author, `bound <@&${role.id}> as the jail role.`)]
            });
        }

        // Subcommand: setjail channel #channel
        if (sub === 'channel') {
            const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
            if (!ch) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: ,setjail channel <#channel>')] });
            }
            const existing = await client.db?.getJailConfig(message.guild.id);
            await client.db?.setJailConfig(message.guild.id, existing?.roleId || null, ch.id);
            return message.reply({
                embeds: [build.approved(message.author, `bound <#${ch.id}> as the jail quarantine channel.`)]
            });
        }

        // Unknown subcommand check
        if (sub && sub !== 'setup' && sub !== 'auto') {
            const valid = ['setup', 'role', 'channel', 'reset'];
            let best = null;
            let bestDist = Infinity;
            for (const v of valid) {
                const a = sub, b = v;
                const matrix = [];
                for (let i = 0; i <= b.length; i++) matrix[i] = [i];
                for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
                for (let i = 1; i <= b.length; i++) {
                    for (let j = 1; j <= a.length; j++) {
                        if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                        else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                    }
                }
                const d = matrix[b.length][a.length];
                if (d < bestDist) { bestDist = d; best = v; }
            }

            if (best && bestDist <= 3) {
                return message.reply({
                    embeds: [build.say(message.author, `did you mean \`,setjail ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`,setjail [setup | role <@role> | channel <#channel> | reset]\``)]
            });
        }

        // Automatic Setup
        const statusMsg = await message.reply({
            embeds: [build.say(message.author, 'configuring jail roles and channel overrides...')]
        });

        try {
            // 1. Create or fetch Jailed role
            let jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
            if (!jailRole) {
                jailRole = await message.guild.roles.create({
                    name: 'Jailed',
                    colors: { primaryColor: 0x4f545c },
                    permissions: [],
                    reason: `${message.author.tag}: automated harm jail setup`
                });
            }

            // 2. Create or fetch #jail channel
            let jailChannel = message.guild.channels.cache.find(c => c.name.toLowerCase() === 'jail' && c.type === ChannelType.GuildText);
            if (!jailChannel) {
                jailChannel = await message.guild.channels.create({
                    name: 'jail',
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: message.guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: jailRole.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        },
                        {
                            id: botMember.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageChannels
                            ]
                        }
                    ],
                    reason: `${message.author.tag}: automated harm jail setup`
                });
            }

            // 3. Deny ViewChannel on all other channels for jailRole
            const channelsToRestrict = message.guild.channels.cache.filter(c =>
                c.id !== jailChannel.id &&
                c.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)
            );

            for (const ch of channelsToRestrict.values()) {
                const current = ch.permissionOverwrites.cache.get(jailRole.id);
                if (!current || !current.deny.has(PermissionFlagsBits.ViewChannel)) {
                    await ch.permissionOverwrites.edit(jailRole, {
                        ViewChannel: false,
                        SendMessages: false,
                        Connect: false
                    }).catch(() => {});
                }
            }

            // 4. Save to Database
            if (client.db) {
                await client.db.setJailConfig(message.guild.id, jailRole.id, jailChannel.id);
            }

            const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
            const approveEmoji = config.emojis?.approve || '<:harm_tick:1558811267014066366>';

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const section = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### [jail system ready](${supportUrl})\n` +
                            `-# ${approveEmoji} successfully initialized server isolation parameters.\n\n` +
                            `-# **quarantine channel:** <#${jailChannel.id}>\n` +
                            `-# **jail role:** <@&${jailRole.id}>\n` +
                            `-# **use:** \`,jail @member [reason]\` to isolate disruptive users.`
                        )
                    );
                container.addSectionComponents(section);

                await statusMsg.edit({
                    embeds: [],
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                await statusMsg.edit({
                    embeds: [build.approved(message.author, `jail setup complete — role: <@&${jailRole.id}> · channel: <#${jailChannel.id}>`)]
                });
            }
        } catch (err) {
            return statusMsg.edit({
                embeds: [build.deny(message.author, `failed to initialize jail: ${err.message}`)]
            });
        }
    }
}

module.exports = SetjailCommand;
