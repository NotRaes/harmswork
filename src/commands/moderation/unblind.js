const {
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const {
    logToModLogs,
    sendModResponse,
    resolveUserOrMember
} = require('../../structures/utils/helpers/modhelper.js');
const config = require('../../config.js');

class UnblindCommand {
    constructor() {
        this.name = 'unblind';
        this.aliases = ['unblackout', 'reblind'];
        this.description = 'restore channel visibility and original roles to a blinded member.';
        this.syntax = ',unblind [@user/username/id] [reason]';
        this.example = ',unblind @user punishment resolved';
        this.category = 'moderation';
        this.permissions = ['ManageRoles'];
        this.cooldown = 3;
    }

    async execute(client, message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
            !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'you need moderate members or manage roles permission.')] });
        }

        const botMember = message.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({ embeds: [build.deny(message.author, 'i need manage roles permission to execute this.')] });
        }

        const blindRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'blinded');

        // Helper to execute unblind on a confirmed target member
        const performUnblind = async (targetMember, reasonText = 'punishment lifted') => {
            const targetUser = targetMember.user;
            const blindedRecord = await client.db?.getBlindedUser(message.guild.id, targetUser.id);
            const hasBlindRole = blindRole && targetMember.roles.cache.has(blindRole.id);

            if (!blindedRecord && !hasBlindRole) {
                return message.reply({ embeds: [build.warn(message.author, `**${targetUser.tag || targetUser.username}** is not currently blinded.`)] });
            }

            // Remove Blinded role
            if (blindRole && targetMember.roles.cache.has(blindRole.id)) {
                await targetMember.roles.remove(blindRole, `${message.author.tag} (${message.author.id}) [unblind]: restored channel access`).catch(() => {});
            }

            // Restore saved roles
            const restoredRoles = [];
            if (blindedRecord && Array.isArray(blindedRecord.roles)) {
                for (const rId of blindedRecord.roles) {
                    const role = message.guild.roles.cache.get(rId);
                    if (role && role.position < botMember.roles.highest.position && !role.managed) {
                        restoredRoles.push(role.id);
                    }
                }
                if (restoredRoles.length > 0) {
                    await targetMember.roles.add(restoredRoles, `${message.author.tag} (${message.author.id}) [unblind]: restoring roles`).catch(() => {});
                }
            }

            // Remove from DB
            if (client.db) {
                await client.db.removeBlindedUser(message.guild.id, targetUser.id);
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
                    action: 'unblind',
                    reason: reasonText,
                    duration: 0
                });
            }

            // Send Harm Response
            await sendModResponse(message, {
                action: `unblinded (restored channel vision & ${restoredRoles.length} roles)`,
                target: targetUser,
                reason: reasonText,
                caseId
            });

            // Log to ModLogs
            await logToModLogs(message.guild, client, {
                action: 'unblind',
                target: targetUser,
                moderator: message.author,
                reason: `${reasonText} (${restoredRoles.length} roles restored)`,
                caseId
            });
        };

        // Case 1: No arguments provided — smart zero-argument flow
        if (!args.length) {
            const dbBlinded = client.db ? await client.db.getAllBlindedUsers(message.guild.id) : [];
            const blindedMap = new Map();

            for (const b of dbBlinded) {
                blindedMap.set(b.user_id, { userId: b.user_id, record: b });
            }

            if (blindRole) {
                for (const [id, m] of message.guild.members.cache) {
                    if (m.roles.cache.has(blindRole.id) && !blindedMap.has(id)) {
                        blindedMap.set(id, { userId: id, record: null });
                    }
                }
            }

            if (blindedMap.size === 0) {
                return message.reply({ embeds: [build.warn(message.author, 'no members are currently blinded in this server.')] });
            }

            // If exactly one member is blinded, auto-unblind them!
            if (blindedMap.size === 1) {
                const soleId = [...blindedMap.keys()][0];
                const soleMember = message.guild.members.cache.get(soleId) || await message.guild.members.fetch(soleId).catch(() => null);
                if (soleMember) {
                    return performUnblind(soleMember, 'punishment lifted');
                }
            }

            // If multiple members are blinded, present a clean list embed with syntax
            const lines = [];
            for (const [uId] of blindedMap) {
                lines.push(`• <@${uId}> (\`${uId}\`)`);
            }

            const bannerAtt = build.getAssetAttachment('moderation.png') || build.getAssetAttachment('banner.png');
            const files = bannerAtt ? [bannerAtt] : [];

            const embed = new EmbedBuilder()
                .setColor(config.colors.c || '#0A0A0C')
                .setThumbnail(message.guild.iconURL({ size: 256, dynamic: true }))
                .setDescription(
                    `### [blinded members](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                    `-# **${blindedMap.size}** members are currently blinded in **${message.guild.name.toLowerCase()}**.\n\n` +
                    lines.slice(0, 20).join('\n') +
                    (lines.length > 20 ? `\n-# ...and ${lines.length - 20} more` : '') +
                    `\n\n-# **syntax:** \`,unblind <@user|all> [reason]\``
                );

            if (bannerAtt) {
                embed.setImage(`attachment://${bannerAtt.name}`);
            }

            return message.reply({
                embeds: [embed],
                files,
                allowedMentions: { repliedUser: false }
            });
        }

        // Case 2: Argument provided — search via robust multi-tier resolution
        let targetMember = null;
        const resolved = await resolveUserOrMember(message, args[0]);

        if (resolved && resolved.member) {
            targetMember = resolved.member;
        } else {
            // Direct SQLite fallback lookup by username/id for blinded members
            const dbBlinded = client.db ? await client.db.getAllBlindedUsers(message.guild.id) : [];
            const cleanArg = args[0].toLowerCase().replace(/[<@!>]/g, '');

            for (const b of dbBlinded) {
                if (b.user_id === cleanArg) {
                    targetMember = message.guild.members.cache.get(b.user_id) || await message.guild.members.fetch(b.user_id).catch(() => null);
                    break;
                }
                const mem = message.guild.members.cache.get(b.user_id) || await message.guild.members.fetch(b.user_id).catch(() => null);
                if (mem) {
                    const u = mem.user;
                    if (u.username.toLowerCase() === cleanArg ||
                        u.username.toLowerCase().startsWith(cleanArg) ||
                        u.tag.toLowerCase() === cleanArg ||
                        (mem.nickname && mem.nickname.toLowerCase().startsWith(cleanArg))) {
                        targetMember = mem;
                        break;
                    }
                }
            }
        }

        if (!targetMember) {
            return message.reply({ embeds: [build.warn(message.author, 'unable to find that member in this server.')] });
        }

        const reason = args.slice(1).join(' ').trim() || 'punishment lifted';
        return performUnblind(targetMember, reason);
    }
}

module.exports = UnblindCommand;
