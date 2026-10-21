const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class InvitesCommand {
    constructor() {
        this.name = 'invites';
        this.aliases = ['invs', 'invitations'];
        this.description = 'check invite statistics, joins, leaves, and server referral leaderboard.';
        this.syntax = ',invites [top|add|remove|reset] [@user] [amount]';
        this.example = ',invites @user';
        this.category = 'utility';
        this.cooldown = 2;
        this.subcommands = [
            'invites top',
            'invites add <@user> <amount>',
            'invites remove <@user> <amount>',
            'invites reset <@user|all>'
        ];
        this.subcommandDetails = {
            top: {
                description: 'view the interactive top inviters leaderboard with pagination.',
                syntax: ',invites top [page]',
                example: ',invites top'
            },
            add: {
                description: 'add bonus invites to a member.',
                syntax: ',invites add <@user> <amount>',
                example: ',invites add @user 5'
            },
            remove: {
                description: 'remove bonus invites from a member.',
                syntax: ',invites remove <@user> <amount>',
                example: ',invites remove @user 2'
            },
            reset: {
                description: 'reset invite records for a specific member or the entire server.',
                syntax: ',invites reset <@user|all>',
                example: ',invites reset @user'
            }
        };
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply(build.warnBox('nothing found', 'invites can only be viewed in servers.'));
        }

        const db = message.client.db;
        const guildId = message.guild.id;

        if (!db) {
            return message.reply(build.denyBox('offline', 'database subsystem is currently offline.'));
        }

        const sub = (args[0] || '').toLowerCase();
        const bannerAttachment = build.getAssetAttachment('utility.png');

        // ──────────────────────── 1. INTERACTIVE LEADERBOARD / TOP ────────────────────────
        if (sub === 'top' || sub === 'lb' || sub === 'leaderboard') {
            const allInviters = await db.getTopInviters(guildId, 100);
            if (!allInviters || allInviters.length === 0) {
                return message.reply(build.warnBox('nothing found', 'no invite records found for this server yet.'));
            }

            const pageSize = 10;
            const totalPages = Math.ceil(allInviters.length / pageSize);

            let initialPage = 0;
            if (args[1] && !isNaN(parseInt(args[1], 10))) {
                const requestedPage = parseInt(args[1], 10) - 1;
                if (requestedPage >= 0 && requestedPage < totalPages) {
                    initialPage = requestedPage;
                }
            }

            let currentPage = initialPage;
            const guildIcon = message.guild.iconURL({ size: 1024, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

            const generatePayload = (page) => {
                const start = page * pageSize;
                const pageItems = allInviters.slice(start, start + pageSize);

                const lines = pageItems.map((item, idx) => {
                    const rank = start + idx + 1;
                    return `\`${rank}.\` <@${item.user_id}> ─ \`${item.total} invites\`\n` +
                        `-# **joined** \`+${item.joins}\` · **left** \`-${item.leaves}\` · **fake** \`${item.fakes}\` · **bonus** \`${item.bonus}\``;
                }).join('\n\n');

                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const headerSection = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### [${message.guild.name.toLowerCase()}'s invite leaderboard](https://discord.gg/hCQhTmPf2G)\n` +
                            `-# server referral metrics ranked by net verified invitations.`
                        )
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
                container.addSectionComponents(headerSection);

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(lines)
                );

                if (bannerAttachment) {
                    container.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachment.name}`)
                        )
                    );
                }

                const actionRows = [];
                if (totalPages > 1) {
                    container.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    );
                    const navRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('inv_prev')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('previous')
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('inv_counter')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel(`${page + 1} of ${totalPages}`)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('inv_next')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('next')
                            .setDisabled(page >= totalPages - 1)
                    );
                    actionRows.push(navRow);
                    container.addActionRowComponents(navRow);
                }

                const fallbackEmbed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(guildIcon)
                    .setDescription(
                        `### [${message.guild.name.toLowerCase()}'s invite leaderboard](https://discord.gg/hCQhTmPf2G)\n\n` +
                        lines
                    )
                    .setFooter({ text: `page ${page + 1} of ${totalPages} · total inviters: ${allInviters.length}` });
                if (bannerAttachment) fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);

                return {
                    container,
                    fallbackEmbed,
                    actionRows,
                    files: bannerAttachment ? [bannerAttachment] : []
                };
            };

            const initialPayload = generatePayload(currentPage);
            replyMsg = await message.reply({
                embeds: [initialPayload.fallbackEmbed],
                components: initialPayload.actionRows,
                files: initialPayload.files
            }).catch(() => null);

            if (!replyMsg || totalPages <= 1) return;

            const collector = replyMsg.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({
                        content: 'only the command author can navigate this leaderboard.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                if (i.customId === 'inv_prev' && currentPage > 0) {
                    currentPage--;
                } else if (i.customId === 'inv_next' && currentPage < totalPages - 1) {
                    currentPage++;
                }

                const updated = generatePayload(currentPage);
                await i.update({
                    embeds: [updated.fallbackEmbed],
                    components: updated.actionRows
                }).catch(() => {});
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'deleted' || !replyMsg) return;
                const disabledPayload = generatePayload(currentPage);
                for (const row of disabledPayload.actionRows) {
                    for (const btn of row.components) btn.setDisabled(true);
                }
                replyMsg.edit({
                    embeds: [disabledPayload.fallbackEmbed],
                    components: disabledPayload.actionRows
                }).catch(() => {});
            });

            return;
        }

        // ──────────────────────── 2. ADD BONUS INVITES ────────────────────────
        if (sub === 'add' || sub === 'bonus') {
            const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !isOwner) {
                return message.reply(build.denyBox('permission denied', 'you need manage server permissions to add bonus invites.'));
            }

            const rawId = args[1]?.replace(/[<@!>]/g, '');
            const targetUser = message.mentions?.users?.first() ||
                (rawId && (message.client.users.cache.get(rawId) || await message.client.users.fetch(rawId).catch(() => null)));
            const amount = parseInt(args[2], 10);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply(build.warnBox('syntax guide', 'syntax: `,invites add @user <amount>`'));
            }

            const newBonus = await db.adjustBonusInvites(guildId, targetUser.id, amount);
            return message.reply(build.approvedBox('bonus added', `added \`${amount}\` bonus invites to <@${targetUser.id}>. total bonus: \`${newBonus}\`.`));
        }

        // ──────────────────────── 3. REMOVE BONUS INVITES ────────────────────────
        if (sub === 'remove' || sub === 'sub' || sub === 'deduct') {
            const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !isOwner) {
                return message.reply(build.denyBox('permission denied', 'you need manage server permissions to remove bonus invites.'));
            }

            const rawId = args[1]?.replace(/[<@!>]/g, '');
            const targetUser = message.mentions?.users?.first() ||
                (rawId && (message.client.users.cache.get(rawId) || await message.client.users.fetch(rawId).catch(() => null)));
            const amount = parseInt(args[2], 10);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply(build.warnBox('syntax guide', 'syntax: `,invites remove @user <amount>`'));
            }

            const newBonus = await db.adjustBonusInvites(guildId, targetUser.id, -amount);
            return message.reply(build.approvedBox('bonus deducted', `deducted \`${amount}\` bonus invites from <@${targetUser.id}>. total bonus: \`${newBonus}\`.`));
        }

        // ──────────────────────── 4. RESET INVITES ────────────────────────
        if (sub === 'reset' || sub === 'clear') {
            const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) && !isOwner) {
                return message.reply(build.denyBox('permission denied', 'you need manage server permissions to reset invites.'));
            }

            const rawId = args[1]?.replace(/[<@!>]/g, '');
            const targetUser = message.mentions?.users?.first() ||
                (rawId && (message.client.users.cache.get(rawId) || await message.client.users.fetch(rawId).catch(() => null)));

            if (targetUser) {
                await db.resetUserInvites(guildId, targetUser.id);
                return message.reply(build.approvedBox('invites reset', `reset all invite data for <@${targetUser.id}>.`));
            } else if (args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'server') {
                await db.resetGuildInvites(guildId);
                return message.reply(build.approvedBox('invites reset', 'reset all invite data for this entire server.'));
            } else {
                return message.reply(build.warnBox('syntax guide', 'syntax: `,invites reset @user` or `,invites reset all`'));
            }
        }

        // ──────────────────────── 5. VIEW USER INVITES (DEFAULT) ────────────────────────
        let targetUser = message.author;
        if (args && args.length > 0) {
            const rawTargetId = args[0].replace(/[<@!>]/g, '');
            const resolved = message.mentions?.users?.first() ||
                (message.client.users.cache.get(rawTargetId) || await message.client.users.fetch(rawTargetId).catch(() => null));

            if (!resolved) {
                const valid = ['top', 'add', 'remove', 'reset'];
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
                        embeds: [build.say(message.author, `did you mean \`,invites ${best}\`?`)]
                    });
                }

                return message.reply(build.warnBox('nothing found', `user \`${args[0]}\` could not be found.\n-# syntax: \`,invites [@user | top | add | remove | reset]\``));
            }
            targetUser = resolved;
        }

        const data = await db.getUserInvites(guildId, targetUser.id);
        const avatarUrl = targetUser.displayAvatarURL({ size: 1024, dynamic: true });

        const container = new ContainerBuilder();
        container.setAccentColor(0x0A0A0C);

        const section = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### [${targetUser.username}'s invites](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# invitation tracking and referral metrics.\n\n` +
                    `**total invites** \`${data.total}\`\n` +
                    `-# **joined** \`+${data.joins}\` · **left** \`-${data.leaves}\` · **fake** \`${data.fakes}\` · **bonus** \`${data.bonus}\``
                )
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
        container.addSectionComponents(section);

        if (bannerAttachment) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAttachment.name}`)
                )
            );
        }

        try {
            return await message.reply({
                components: [container],
                files: bannerAttachment ? [bannerAttachment] : [],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(avatarUrl)
                .setDescription(
                    `### [${targetUser.username}'s invites](https://discord.gg/hCQhTmPf2G)\n` +
                    `*invitation tracking and referral metrics.*\n\n` +
                    `**user** <@${targetUser.id}>\n` +
                    `**total invites** \`${data.total}\`\n` +
                    `**joined** \`+${data.joins}\` · **left** \`-${data.leaves}\`\n` +
                    `**fake** \`${data.fakes}\` · **bonus** \`${data.bonus}\``
                );
            if (bannerAttachment) fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);
            return await message.reply({
                embeds: [fallbackEmbed],
                files: bannerAttachment ? [bannerAttachment] : []
            });
        }
    }
}

module.exports = InvitesCommand;
