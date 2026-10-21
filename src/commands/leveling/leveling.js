const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');
const LevelingHelper = require('../../structures/utils/helpers/levelinghelper.js');

class LevelingCommand {
    constructor() {
        this.name = 'leveling';
        this.aliases = ['lvlconfig', 'levelconfig'];
        this.description = 'configure server leveling, multipliers, channels, and milestone role rewards.';
        this.category = 'leveling';
        this.permissions = ['ManageGuild'];
        this.cooldown = 2;
    }

    async execute(message, args) {
        if (!message.guild) {
            return message.reply({ embeds: [build.deny(message.author, 'this command can only be used in a server.')] });
        }

        if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
            return message.reply({ embeds: [build.deny(message.author, 'you need the **Manage Server** permission to configure leveling.')] });
        }

        const db = message.client.db;
        const prefix = (db.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
        const settings = await db.getLevelingSettings(message.guild.id);

        if (!args.length) {
            // Flagship Interactive Overview Hub
            const bannerAtt = build.getAssetAttachment('banner.png');
            const files = bannerAtt ? [bannerAtt] : [];
            const guildIcon = message.guild.iconURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

            const totalRanked = await db.getLevelLeaderboardCount(message.guild.id);
            const rewards = await db.getLevelRewards(message.guild.id);

            let channelDisplay = 'current channel';
            if (settings.channel_id === 'off') channelDisplay = 'disabled (silent)';
            else if (settings.channel_id === 'dm') channelDisplay = 'direct messages';
            else if (settings.channel_id) channelDisplay = `<#${settings.channel_id}>`;

            const statusText = settings.enabled ? '`active`' : '`disabled`';
            const multText = `\`${(settings.multiplier || 1.0).toFixed(1)}x\``;
            const stackText = settings.stack_roles ? '`enabled` (keep all)' : '`disabled` (highest only)';
            const ignoredChCount = settings.ignored_channels?.length || 0;
            const ignoredRoCount = settings.ignored_roles?.length || 0;

            const content =
                `### [${message.guild.name} — **leveling hub**](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                `-# configure xp gain, milestone roles, and level-up announcements.\n\n` +
                `**status** ${statusText} · **multiplier** ${multText} · **stacking** ${stackText}\n` +
                `**announcements** ${channelDisplay}\n` +
                `**metrics** \`${totalRanked}\` ranked members · \`${rewards.length}\` role rewards\n` +
                `**ignored** \`${ignoredChCount}\` channels · \`${ignoredRoCount}\` roles\n\n` +
                `-# **subcommands**:\n` +
                `-# \`${prefix}leveling toggle\` — enable or disable leveling\n` +
                `-# \`${prefix}leveling channel <#ch|dm|current|off>\` — announcement channel\n` +
                `-# \`${prefix}leveling multiplier <0.1–5.0>\` — global xp multiplier\n` +
                `-# \`${prefix}leveling stacking\` — toggle milestone role stacking\n` +
                `-# \`${prefix}leveling ignore <channel|role> <#ch|@role>\` — ignore from gaining xp\n` +
                `-# \`${prefix}leveling reward add <level> <@role>\` — add milestone reward\n` +
                `-# \`${prefix}leveling reward remove <level>\` — delete milestone reward\n` +
                `-# \`${prefix}leveling set @user <xp|level> <amount>\` — manual progression edit\n` +
                `-# \`${prefix}leveling reset <@user|server>\` — clear leveling progression`;

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(0x0A0A0C);

                const section = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(content)
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder().setURL(guildIcon)
                    );
                container.addSectionComponents(section);

                if (bannerAtt) {
                    container.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL('attachment://banner.png')
                        )
                    );
                }

                return await message.reply({
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                const fallbackEmbed = new EmbedBuilder()
                    .setColor(0x0A0A0C)
                    .setDescription(content)
                    .setThumbnail(guildIcon);
                if (bannerAtt) fallbackEmbed.setImage('attachment://banner.png');

                return await message.reply({
                    embeds: [fallbackEmbed],
                    files
                }).catch(() => {});
            }
        }

        const sub = args[0].toLowerCase();

        // 1. Toggle leveling
        if (sub === 'toggle' || sub === 'enable' || sub === 'disable') {
            const newState = sub === 'enable' ? 1 : (sub === 'disable' ? 0 : (settings.enabled ? 0 : 1));
            await db.setLevelingSettings(message.guild.id, { enabled: newState });
            const label = newState ? 'enabled' : 'disabled';
            return message.reply({ embeds: [build.approved(message.author, `leveling progression has been **${label}**.`)] });
        }

        // 2. Announcement Channel
        if (sub === 'channel' || sub === 'ch') {
            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling channel <#channel | dm | current | off>\``)] });
            }
            const target = args[1].toLowerCase();
            if (target === 'off' || target === 'none' || target === 'silent') {
                await db.setLevelingSettings(message.guild.id, { channel_id: 'off' });
                return message.reply({ embeds: [build.approved(message.author, 'level-up announcements are now **disabled** (silent).')] });
            }
            if (target === 'dm') {
                await db.setLevelingSettings(message.guild.id, { channel_id: 'dm' });
                return message.reply({ embeds: [build.approved(message.author, 'level-up announcements will now be sent in **direct messages**.')] });
            }
            if (target === 'current' || target === 'here') {
                await db.setLevelingSettings(message.guild.id, { channel_id: null });
                return message.reply({ embeds: [build.approved(message.author, 'level-up announcements will now be sent in the **current channel** where the member leveled up.')] });
            }

            const match = args[1].match(/^<#(\d+)>$/) || args[1].match(/^\d{17,20}$/);
            const channelId = match ? (match[1] || match[0]) : null;
            const channel = channelId ? message.guild.channels.cache.get(channelId) : message.guild.channels.cache.find(c => c.name.toLowerCase() === args[1].toLowerCase());

            if (!channel || !channel.isTextBased()) {
                return message.reply({ embeds: [build.deny(message.author, 'could not find that text channel.')] });
            }

            await db.setLevelingSettings(message.guild.id, { channel_id: channel.id });
            return message.reply({ embeds: [build.approved(message.author, `level-up announcements will now be sent in <#${channel.id}>.`)] });
        }

        // 3. Multiplier
        if (sub === 'multiplier' || sub === 'mult') {
            if (!args[1] || isNaN(args[1])) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling multiplier <0.1 - 5.0>\``)] });
            }
            const mult = parseFloat(args[1]);
            if (mult < 0.1 || mult > 5.0) {
                return message.reply({ embeds: [build.deny(message.author, 'multiplier must be between **0.1x** and **5.0x**.')] });
            }

            await db.setLevelingSettings(message.guild.id, { multiplier: mult });
            return message.reply({ embeds: [build.approved(message.author, `xp multiplier has been set to **${mult.toFixed(1)}x**.`)] });
        }

        // 4. Role Stacking
        if (sub === 'stacking' || sub === 'stack') {
            const newState = settings.stack_roles ? 0 : 1;
            await db.setLevelingSettings(message.guild.id, { stack_roles: newState });
            const desc = newState
                ? 'role stacking is now **enabled** (members keep all unlocked milestone roles).'
                : 'role stacking is now **disabled** (members only keep their highest milestone role).';
            return message.reply({ embeds: [build.approved(message.author, desc)] });
        }

        // 5. Ignore channels or roles
        if (sub === 'ignore') {
            if (!args[1] || !args[2]) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling ignore <channel|role> <#channel|@role>\``)] });
            }
            const type = args[1].toLowerCase();

            if (type === 'channel' || type === 'ch') {
                const match = args[2].match(/^<#(\d+)>$/) || args[2].match(/^\d{17,20}$/);
                const channelId = match ? (match[1] || match[0]) : null;
                const channel = channelId ? message.guild.channels.cache.get(channelId) : message.guild.channels.cache.find(c => c.name.toLowerCase() === args[2].toLowerCase());

                if (!channel) {
                    return message.reply({ embeds: [build.deny(message.author, 'could not find that channel.')] });
                }

                let ignored = [...(settings.ignored_channels || [])];
                let isIgnored = ignored.includes(channel.id);
                if (isIgnored) {
                    ignored = ignored.filter(id => id !== channel.id);
                    await db.setLevelingSettings(message.guild.id, { ignored_channels: ignored });
                    return message.reply({ embeds: [build.approved(message.author, `<#${channel.id}> is no longer ignored for xp.`)] });
                } else {
                    ignored.push(channel.id);
                    await db.setLevelingSettings(message.guild.id, { ignored_channels: ignored });
                    return message.reply({ embeds: [build.approved(message.author, `<#${channel.id}> is now **ignored** for xp.`)] });
                }
            } else if (type === 'role') {
                const match = args[2].match(/^<@&(\d+)>$/) || args[2].match(/^\d{17,20}$/);
                const roleId = match ? (match[1] || match[0]) : null;
                const role = roleId ? message.guild.roles.cache.get(roleId) : message.guild.roles.cache.find(r => r.name.toLowerCase() === args[2].toLowerCase());

                if (!role) {
                    return message.reply({ embeds: [build.deny(message.author, 'could not find that role.')] });
                }

                let ignored = [...(settings.ignored_roles || [])];
                let isIgnored = ignored.includes(role.id);
                if (isIgnored) {
                    ignored = ignored.filter(id => id !== role.id);
                    await db.setLevelingSettings(message.guild.id, { ignored_roles: ignored });
                    return message.reply({ embeds: [build.approved(message.author, `<@&${role.id}> is no longer ignored for xp.`)] });
                } else {
                    ignored.push(role.id);
                    await db.setLevelingSettings(message.guild.id, { ignored_roles: ignored });
                    return message.reply({ embeds: [build.approved(message.author, `<@&${role.id}> is now **ignored** for xp.`)] });
                }
            } else {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling ignore <channel|role> <#channel|@role>\``)] });
            }
        }

        // 6. Milestone Role Rewards
        if (sub === 'reward' || sub === 'rewards' || sub === 'role') {
            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling reward <add|remove> <level> [@role]\``)] });
            }
            const action = args[1].toLowerCase();

            if (action === 'add') {
                if (!args[2] || isNaN(args[2]) || !args[3]) {
                    return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling reward add <level> <@role>\``)] });
                }
                const level = parseInt(args[2], 10);
                if (level < 1 || level > 1000) {
                    return message.reply({ embeds: [build.deny(message.author, 'level milestone must be between 1 and 1000.')] });
                }

                const match = args[3].match(/^<@&(\d+)>$/) || args[3].match(/^\d{17,20}$/);
                const roleId = match ? (match[1] || match[0]) : null;
                const role = roleId ? message.guild.roles.cache.get(roleId) : message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(3).join(' ').toLowerCase());

                if (!role) {
                    return message.reply({ embeds: [build.deny(message.author, 'could not find that role.')] });
                }

                if (role.managed) {
                    return message.reply({ embeds: [build.deny(message.author, 'cannot assign managed or bot integration roles.')] });
                }

                const botMember = message.guild.members.me;
                if (botMember && role.position >= botMember.roles.highest.position) {
                    return message.reply({ embeds: [build.deny(message.author, 'that role is higher than harm\'s highest role.')] });
                }

                await db.addLevelReward(message.guild.id, level, role.id);
                return message.reply({
                    embeds: [build.approved(message.author, `added reward: reaching **level ${level}** will automatically grant <@&${role.id}>.`)]
                });
            } else if (action === 'remove' || action === 'del' || action === 'delete') {
                if (!args[2] || isNaN(args[2])) {
                    return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling reward remove <level>\``)] });
                }
                const level = parseInt(args[2], 10);
                await db.removeLevelReward(message.guild.id, level);
                return message.reply({
                    embeds: [build.approved(message.author, `removed role rewards for **level ${level}**.`)]
                });
            } else {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling reward <add|remove> <level> [@role]\``)] });
            }
        }

        // 7. Manual Level/XP Set
        if (sub === 'set') {
            if (!args[1] || !args[2] || !args[3] || isNaN(args[3])) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling set <@user> <xp|level> <amount>\``)] });
            }

            const mentionMatch = args[1].match(/^<@!?(\d+)>$/) || args[1].match(/^\d{17,20}$/);
            const targetId = mentionMatch ? (mentionMatch[1] || mentionMatch[0]) : null;
            const targetUser = targetId ? (await message.client.users.fetch(targetId).catch(() => null)) : null;

            if (!targetUser) {
                return message.reply({ embeds: [build.deny(message.author, 'could not find that user.')] });
            }

            const type = args[2].toLowerCase();
            const amount = parseInt(args[3], 10);
            if (amount < 0) {
                return message.reply({ embeds: [build.deny(message.author, 'amount cannot be negative.')] });
            }

            if (type === 'level' || type === 'lvl') {
                const totalXp = LevelingHelper.getTotalXpForLevel(amount);
                await db.setUserLevel(message.guild.id, targetUser.id, totalXp, amount);
                return message.reply({ embeds: [build.approved(message.author, `set <@${targetUser.id}> to **level ${amount}** (\`${totalXp.toLocaleString()} xp\`).`)] });
            } else if (type === 'xp') {
                const progress = LevelingHelper.getLevelFromTotalXp(amount);
                await db.setUserLevel(message.guild.id, targetUser.id, amount, progress.level);
                return message.reply({ embeds: [build.approved(message.author, `set <@${targetUser.id}> xp to \`${amount.toLocaleString()} xp\` (**level ${progress.level}**).`)] });
            } else {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling set <@user> <xp|level> <amount>\``)] });
            }
        }

        // 8. Reset Progression
        if (sub === 'reset') {
            if (!args[1]) {
                return message.reply({ embeds: [build.warn(message.author, `syntax: \`${prefix}leveling reset <@user | server>\``)] });
            }

            if (args[1].toLowerCase() === 'server' || args[1].toLowerCase() === 'guild') {
                if (args[2]?.toLowerCase() !== 'confirm') {
                    return message.reply({
                        embeds: [build.warn(message.author, `this will **permanently erase** all leveling progression and ranks for everyone in this server. to confirm, run \`${prefix}leveling reset server confirm\`.`)]
                    });
                }
                await db.resetGuildLevels(message.guild.id);
                return message.reply({ embeds: [build.approved(message.author, 'all server leveling data and ranks have been reset.')] });
            } else {
                const mentionMatch = args[1].match(/^<@!?(\d+)>$/) || args[1].match(/^\d{17,20}$/);
                const targetId = mentionMatch ? (mentionMatch[1] || mentionMatch[0]) : null;
                const targetUser = targetId ? (await message.client.users.fetch(targetId).catch(() => null)) : null;

                if (!targetUser) {
                    return message.reply({ embeds: [build.deny(message.author, 'could not find that user.')] });
                }

                await db.resetUserLevel(message.guild.id, targetUser.id);
                return message.reply({ embeds: [build.approved(message.author, `reset leveling progression for <@${targetUser.id}>.`)] });
            }
        }

        return message.reply({ embeds: [build.warn(message.author, `unknown subcommand. type \`${prefix}leveling\` for the admin hub.`)] });
    }
}

module.exports = LevelingCommand;
