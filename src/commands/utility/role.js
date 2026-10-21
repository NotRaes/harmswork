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

function resolveRole(guild, query) {
    if (!query) return null;
    const clean = query.trim();
    const mentionMatch = clean.match(/^<@&(\d{17,20})>$/);
    if (mentionMatch) return guild.roles.cache.get(mentionMatch[1]) || null;
    if (/^\d{17,20}$/.test(clean)) return guild.roles.cache.get(clean) || null;
    const lower = clean.toLowerCase();
    const exact = guild.roles.cache.find(r => r.name.toLowerCase() === lower);
    if (exact) return exact;
    const starts = guild.roles.cache.find(r => r.name.toLowerCase().startsWith(lower));
    if (starts) return starts;
    return guild.roles.cache.find(r => r.name.toLowerCase().includes(lower)) || null;
}

function resolveTwoRoles(guild, tokens) {
    if (!tokens || tokens.length < 2) return null;

    // Check if first token is a clean mention or ID
    const firstRole = resolveRole(guild, tokens[0]);
    if (firstRole && (tokens[0].startsWith('<@&') || /^\d{17,20}$/.test(tokens[0]))) {
        const secondRole = resolveRole(guild, tokens.slice(1).join(' '));
        if (secondRole) return { sourceRole: firstRole, targetRole: secondRole };
    }

    // Attempt multi-token split across boundaries
    for (let i = 1; i < tokens.length; i++) {
        const left = tokens.slice(0, i).join(' ');
        const right = tokens.slice(i).join(' ');
        const r1 = resolveRole(guild, left);
        const r2 = resolveRole(guild, right);
        if (r1 && r2 && r1.id !== r2.id) {
            return { sourceRole: r1, targetRole: r2 };
        }
    }

    return null;
}

async function resolveMember(guild, query, message) {
    if (message.mentions?.members?.size > 0) {
        return message.mentions.members.first();
    }
    if (!query) return null;
    const clean = query.replace(/[<@!>]/g, '').trim();
    if (/^\d{17,20}$/.test(clean)) {
        try {
            return await guild.members.fetch(clean);
        } catch (_) {}
    }
    const lower = clean.toLowerCase();
    const found = guild.members.cache.find(m =>
        m.user.username.toLowerCase() === lower ||
        m.displayName.toLowerCase() === lower ||
        m.user.tag.toLowerCase() === lower
    );
    if (found) return found;
    return null;
}

class RoleCommand {
    constructor() {
        this.name = 'role';
        this.aliases = ['inrole', 'rolemembers', 'roles'];
        this.description = 'assign, remove, mass-manage, or inspect role holders in the server.';
        this.syntax = ',role <user|all|humans|bots|in|inrole|create|delete> [role]';
        this.example = ',role @user Member';
        this.category = 'utility';
        this.permissions = ['ManageRoles'];
        this.cooldown = 2;
        this.subcommands = [
            'role <user> <role>',
            'role add <user> <role>',
            'role remove <user> <role>',
            'role in <sourceRole> <targetRole>',
            'role inrole <role>',
            'role all <role>',
            'role humans <role>',
            'role bots <role>',
            'role create <name> [hex]',
            'role delete <role>'
        ];
        this.subcommandDetails = {
            toggle: {
                description: 'toggle a role on a member (adds if missing, removes if present).',
                syntax: ',role <user> <role>',
                example: ',role @user Member'
            },
            add: {
                description: 'grant a role to a member or a group (all, humans, bots, in <role>).',
                syntax: ',role add <user|humans|bots|all|in> <role> [targetRole]',
                example: ',role add humans Member'
            },
            remove: {
                description: 'revoke a role from a member or group.',
                syntax: ',role remove <user|humans|bots|all|in> <role> [targetRole]',
                example: ',role remove bots OldRole'
            },
            in: {
                description: 'mass assign a new role to everyone currently holding a specific role.',
                syntax: ',role in <sourceRole> <targetRole>',
                example: ',role in @verified @updates'
            },
            inrole: {
                description: 'view an interactive paginated list of all members with a role.',
                syntax: ',role inrole <role>',
                example: ',role inrole Member'
            },
            all: {
                description: 'mass toggle or assign a role to all server members.',
                syntax: ',role all <role>',
                example: ',role all Member'
            },
            humans: {
                description: 'mass toggle or assign a role to all human members.',
                syntax: ',role humans <role>',
                example: ',role humans Member'
            },
            bots: {
                description: 'mass toggle or assign a role to all bot accounts.',
                syntax: ',role bots <role>',
                example: ',role bots BotRole'
            },
            create: {
                description: 'create a new role with an optional hex color.',
                syntax: ',role create <name> [hex]',
                example: ',role create aesthetic #0A0A0C'
            },
            delete: {
                description: 'delete an existing role from the server.',
                syntax: ',role delete <role>',
                example: ',role delete OldRole'
            }
        };
    }

    async execute(message, args, commandName) {
        if (!message.guild) {
            return message.reply(build.warnBox('nothing found', 'this command can only be used in servers.'));
        }

        const isOwner = config.owners?.includes(message.author.id) || message.guild.ownerId === message.author.id;
        const hasManageRoles = isOwner || message.member?.permissions?.has(PermissionFlagsBits.ManageRoles);
        if (!hasManageRoles) {
            return message.reply(build.denyBox('permission denied', 'you need manage roles permissions to use this command.'));
        }

        const botMember = message.guild.members.me;
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(build.denyBox('permission denied', 'i need manage roles permissions to manage roles.'));
        }

        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();

        // Direct alias support: ,inrole <role> or ,rolemembers <role>
        if (invoked === 'inrole' || invoked === 'rolemembers') {
            args = ['inrole', ...args];
            sub = 'inrole';
        }

        if (!args || args.length === 0) {
            return build.help(message, this);
        }

        const botHighest = botMember.roles.highest.position;
        const memberHighest = message.member.roles.highest.position;
        const bannerAttachment = build.getAssetAttachment('utility.png');

        // ──────────────────────── 1. CREATE ROLE ────────────────────────
        if (sub === 'create' || sub === 'new') {
            const raw = args.slice(1).join(' ').trim();
            if (!raw) {
                return message.reply(build.warnBox('syntax guide', 'specify a name for the new role.'));
            }

            const parts = raw.split(/\s+/);
            const lastPart = parts[parts.length - 1];
            let hexColor = null;
            let roleName = raw;

            if (/^#?[0-9a-fA-F]{6}$/.test(lastPart)) {
                hexColor = lastPart.startsWith('#') ? lastPart : `#${lastPart}`;
                parts.pop();
                roleName = parts.join(' ').trim();
            }

            if (!roleName) roleName = 'new role';

            try {
                const roleData = {
                    name: roleName,
                    reason: `harm role create requested by ${message.author.tag}`
                };
                if (hexColor) {
                    roleData.colors = { primaryColor: hexColor };
                }
                const newRole = await message.guild.roles.create(roleData);

                return message.reply({
                    embeds: [build.approved(message.author, `created role <@&${newRole.id}>.`)]
                });
            } catch (err) {
                return message.reply({
                    embeds: [build.deny(message.author, `failed to create role: ${err.message}`)]
                });
            }
        }

        // ──────────────────────── 2. DELETE ROLE ────────────────────────
        if (sub === 'delete' || sub === 'del') {
            const roleQuery = args.slice(1).join(' ').trim();
            if (!roleQuery) {
                return message.reply(build.warnBox('syntax guide', 'specify a role to delete.'));
            }

            const role = resolveRole(message.guild, roleQuery);
            if (!role) {
                return message.reply({
                    embeds: [build.warn(message.author, `could not find a role matching \`${roleQuery}\`.`)]
                });
            }

            if (role.id === message.guild.id) {
                return message.reply({
                    embeds: [build.deny(message.author, 'cannot delete the @everyone role.')]
                });
            }

            if (role.managed) {
                return message.reply({
                    embeds: [build.deny(message.author, 'cannot delete an integration managed role.')]
                });
            }

            if (role.position >= botHighest) {
                return message.reply({
                    embeds: [build.deny(message.author, 'that role is higher than or equal to my highest role.')]
                });
            }

            if (!isOwner && role.position >= memberHighest) {
                return message.reply({
                    embeds: [build.deny(message.author, 'that role is higher than or equal to your highest role.')]
                });
            }

            const deletedName = role.name;
            try {
                await role.delete(`harm role delete requested by ${message.author.tag}`);
                return message.reply({
                    embeds: [build.approved(message.author, `deleted role **${deletedName}**.`)]
                });
            } catch (err) {
                return message.reply({
                    embeds: [build.deny(message.author, `failed to delete role: ${err.message}`)]
                });
            }
        }

        // ──────────────────────── 3. INROLE / MEMBERS LIST ────────────────────────
        if (sub === 'inrole' || sub === 'members' || sub === 'list') {
            const roleQuery = args.slice(1).join(' ').trim();
            if (!roleQuery) {
                return message.reply(build.warnBox('syntax guide', 'syntax: `,role inrole <role>`'));
            }

            const role = resolveRole(message.guild, roleQuery);
            if (!role) {
                return message.reply(build.warnBox('nothing found', `could not find a role matching \`${roleQuery}\`.`));
            }

            await message.guild.members.fetch().catch(() => {});
            const members = Array.from(message.guild.members.cache.filter(m => m.roles.cache.has(role.id)).values())
                .sort((a, b) => (a.displayName || a.user.username).localeCompare(b.displayName || b.user.username));

            if (members.length === 0) {
                return message.reply(build.warnBox('nothing found', `no members currently hold the <@&${role.id}> role.`));
            }

            const pageSize = 15;
            const totalPages = Math.ceil(members.length / pageSize);
            let currentPage = 0;

            const generatePayload = (page) => {
                const start = page * pageSize;
                const pageMembers = members.slice(start, start + pageSize);
                const memberLines = pageMembers.map((m, idx) => `\`${start + idx + 1}.\` <@${m.id}> · **${m.user.tag}**`).join('\n');

                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `### [members with ${role.name.toLowerCase()}](https://discord.gg/hCQhTmPf2G)\n` +
                                `-# <@&${role.id}> · **${members.length}** total members.`
                            )
                        )
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(message.guild.iconURL({ size: 1024, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png'))
                );

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );

                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(memberLines)
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
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('inrole_prev')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('previous')
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('inrole_counter')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel(`${page + 1} of ${totalPages}`)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('inrole_next')
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('next')
                            .setDisabled(page >= totalPages - 1)
                    );
                    actionRows.push(row);
                    container.addActionRowComponents(row);
                }

                const fallbackEmbed = new EmbedBuilder()
                    .setColor(role.color || config.colors.c || 0x0A0A0C)
                    .setDescription(
                        `### members with ${role.name.toLowerCase()} (${members.length})\n\n` +
                        memberLines
                    )
                    .setFooter({ text: `page ${page + 1} of ${totalPages} · total: ${members.length}` });
                if (bannerAttachment) fallbackEmbed.setImage(`attachment://${bannerAttachment.name}`);

                return { container, fallbackEmbed, actionRows, files: bannerAttachment ? [bannerAttachment] : [] };
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
                    return i.reply({ content: 'only the command author can navigate this list.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }

                if (i.customId === 'inrole_prev' && currentPage > 0) {
                    currentPage--;
                } else if (i.customId === 'inrole_next' && currentPage < totalPages - 1) {
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
                const disabled = generatePayload(currentPage);
                for (const row of disabled.actionRows) {
                    for (const btn of row.components) btn.setDisabled(true);
                }
                replyMsg.edit({
                    embeds: [disabled.fallbackEmbed],
                    components: disabled.actionRows
                }).catch(() => {});
            });

            return;
        }

        // ──────────────────────── 4. MASS ROLE OPERATIONS (ALL / HUMANS / BOTS / IN) ────────────────────────
        let explicitAction = null;
        let massTargetType = null;
        let massSourceRole = null;
        let massTargetRole = null;

        // Check for explicit action keyword: ,role add ... / ,role remove ...
        let shiftIndex = 0;
        if (sub === 'add' || sub === 'give') {
            explicitAction = 'add';
            shiftIndex = 1;
        } else if (sub === 'remove' || sub === 'take') {
            explicitAction = 'remove';
            shiftIndex = 1;
        }

        const keyword = (args[shiftIndex] || '').toLowerCase();

        if (keyword === 'all' || keyword === 'humans' || keyword === 'human' || keyword === 'bots' || keyword === 'bot') {
            massTargetType = (keyword === 'human') ? 'humans' : ((keyword === 'bot') ? 'bots' : keyword);
            const roleTokens = args.slice(shiftIndex + 1).join(' ').trim();
            if (!roleTokens) {
                return message.reply(build.warnBox('syntax guide', `specify a role to mass assign to \`${massTargetType}\`.`));
            }
            massTargetRole = resolveRole(message.guild, roleTokens);
            if (!massTargetRole) {
                return message.reply(build.warnBox('nothing found', `could not find a role matching \`${roleTokens}\`.`));
            }
        } else if (keyword === 'in' || keyword === 'has') {
            massTargetType = 'in';
            const dualRoles = resolveTwoRoles(message.guild, args.slice(shiftIndex + 1));
            if (!dualRoles) {
                return message.reply(build.warnBox('syntax guide', 'syntax: `,role in <sourceRole> <targetRole>`\n-# example: `,role in @verified @updates`'));
            }
            massSourceRole = dualRoles.sourceRole;
            massTargetRole = dualRoles.targetRole;
        }

        // Execute Mass Role if detected
        if (massTargetType) {
            const hasAdmin = isOwner || message.member?.permissions?.has(PermissionFlagsBits.Administrator);
            if (!hasAdmin) {
                return message.reply(build.denyBox('permission denied', 'you need administrator permissions to run mass role operations.'));
            }

            const role = massTargetRole;
            if (role.id === message.guild.id) {
                return message.reply(build.denyBox('permission denied', 'cannot assign or remove the @everyone role.'));
            }
            if (role.managed) {
                return message.reply(build.denyBox('permission denied', 'cannot modify an integration managed role.'));
            }
            if (role.position >= botHighest) {
                return message.reply(build.denyBox('hierarchy error', 'that role is higher than or equal to my highest role.'));
            }
            if (!isOwner && role.position >= memberHighest) {
                return message.reply(build.denyBox('hierarchy error', 'that role is higher than or equal to your highest role.'));
            }

            await message.guild.members.fetch().catch(() => {});
            let candidateMembers = message.guild.members.cache;

            if (massTargetType === 'humans') {
                candidateMembers = candidateMembers.filter(m => !m.user.bot);
            } else if (massTargetType === 'bots') {
                candidateMembers = candidateMembers.filter(m => m.user.bot);
            } else if (massTargetType === 'in') {
                candidateMembers = candidateMembers.filter(m => m.roles.cache.has(massSourceRole.id));
            }

            if (candidateMembers.size === 0) {
                const targetLabel = massTargetType === 'in' ? `members with <@&${massSourceRole.id}>` : `\`${massTargetType}\``;
                return message.reply(build.warnBox('nothing found', `no matching members found for ${targetLabel}.`));
            }

            const membersWithoutRole = candidateMembers.filter(m => !m.roles.cache.has(role.id));
            const isAdding = explicitAction === 'add'
                ? true
                : (explicitAction === 'remove' ? false : (membersWithoutRole.size > 0));

            const targetList = isAdding ? membersWithoutRole.values() : candidateMembers.filter(m => m.roles.cache.has(role.id)).values();
            const totalCount = isAdding ? membersWithoutRole.size : candidateMembers.filter(m => m.roles.cache.has(role.id)).size;

            if (totalCount === 0) {
                return message.reply(build.warnBox('nothing to update', `all matching members already have <@&${role.id}> updated.`));
            }

            const actionLabel = isAdding ? 'adding' : 'removing';
            const statusMsg = await message.reply({
                embeds: [build.approved(message.author, `${actionLabel} <@&${role.id}> for \`${totalCount}\` members...`)]
            });

            let completed = 0;
            for (const targetMember of targetList) {
                try {
                    if (isAdding) {
                        await targetMember.roles.add(role.id, `harm mass role by ${message.author.tag}`);
                    } else {
                        await targetMember.roles.remove(role.id, `harm mass role by ${message.author.tag}`);
                    }
                    completed++;
                } catch (_) {}

                if (completed % 10 === 0) {
                    await new Promise(r => setTimeout(r, 250));
                }
            }

            const pastLabel = isAdding ? 'added' : 'removed';
            const prep = isAdding ? 'to' : 'from';
            return statusMsg.edit({
                embeds: [build.approved(message.author, `successfully ${pastLabel} <@&${role.id}> ${prep} \`${completed}\` of \`${totalCount}\` members.`)]
            }).catch(() => {});
        }

        // ──────────────────────── 5. INDIVIDUAL MEMBER ROLE UPDATE ────────────────────────
        let memberArg = null;
        let roleArg = null;

        if (explicitAction) {
            memberArg = args[1];
            roleArg = args.slice(2).join(' ').trim();
        } else {
            memberArg = args[0];
            roleArg = args.slice(1).join(' ').trim();
        }

        if (!memberArg || !roleArg) {
            return build.help(message, this);
        }

        const targetMember = await resolveMember(message.guild, memberArg, message);
        if (!targetMember) {
            return message.reply(build.warnBox('nothing found', `could not find a member matching \`${memberArg}\`.`));
        }

        const role = resolveRole(message.guild, roleArg);
        if (!role) {
            return message.reply(build.warnBox('nothing found', `could not find a role matching \`${roleArg}\`.`));
        }

        if (role.id === message.guild.id) {
            return message.reply(build.denyBox('permission denied', 'cannot assign or remove the @everyone role.'));
        }
        if (role.managed) {
            return message.reply(build.denyBox('permission denied', 'cannot modify an integration managed role.'));
        }
        if (role.position >= botHighest) {
            return message.reply(build.denyBox('hierarchy error', 'that role is higher than or equal to my highest role.'));
        }
        if (!isOwner && role.position >= memberHighest) {
            return message.reply(build.denyBox('hierarchy error', 'that role is higher than or equal to your highest role.'));
        }

        if (!isOwner && targetMember.id !== message.author.id && targetMember.roles.highest.position >= memberHighest) {
            return message.reply(build.denyBox('hierarchy error', 'you cannot modify roles for a member with equal or higher rank.'));
        }

        const hasRole = targetMember.roles.cache.has(role.id);
        const shouldAdd = explicitAction === 'add' ? true : (explicitAction === 'remove' ? false : !hasRole);

        if (explicitAction === 'add' && hasRole) {
            return message.reply(build.warnBox('already assigned', `<@${targetMember.id}> already has the <@&${role.id}> role.`));
        }
        if (explicitAction === 'remove' && !hasRole) {
            return message.reply(build.warnBox('not assigned', `<@${targetMember.id}> does not have the <@&${role.id}> role.`));
        }

        try {
            if (shouldAdd) {
                await targetMember.roles.add(role.id, `harm role add by ${message.author.tag}`);
                return message.reply({
                    embeds: [build.approved(message.author, `added <@&${role.id}> to **${targetMember.user.tag}**.`)]
                });
            } else {
                await targetMember.roles.remove(role.id, `harm role remove by ${message.author.tag}`);
                return message.reply({
                    embeds: [build.approved(message.author, `removed <@&${role.id}> from **${targetMember.user.tag}**.`)]
                });
            }
        } catch (err) {
            return message.reply(build.denyBox('failed', `failed to update roles: ${err.message}`));
        }
    }
}

module.exports = RoleCommand;
