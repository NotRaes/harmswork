const {
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder
} = require('discord.js');
const config = require('../../../config');
const build = require('../builder');
const InvokeHelper = require('./invokehelper');

/**
 * Parses duration strings like '10s', '5m', '2h', '1d', '7d', '2w', or combinations like '1d12h' into milliseconds.
 */
function parseDuration(str) {
    if (!str || typeof str !== 'string') return null;
    const regex = /(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?|w|weeks?)/gi;
    let match;
    let totalMs = 0;
    let found = false;

    while ((match = regex.exec(str)) !== null) {
        found = true;
        const val = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        if (unit.startsWith('s')) totalMs += val * 1000;
        else if (unit.startsWith('m')) totalMs += val * 60 * 1000;
        else if (unit.startsWith('h')) totalMs += val * 60 * 60 * 1000;
        else if (unit.startsWith('d')) totalMs += val * 24 * 60 * 60 * 1000;
        else if (unit.startsWith('w')) totalMs += val * 7 * 24 * 60 * 60 * 1000;
    }

    if (!found || totalMs <= 0) return null;

    return {
        ms: totalMs,
        seconds: Math.floor(totalMs / 1000),
        formatted: formatDuration(totalMs)
    };
}

/**
 * Formats milliseconds into human readable lowercase string.
 */
function formatDuration(ms) {
    if (!ms || ms <= 0) return 'permanent';
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0s';
}

/**
 * Checks role hierarchy and safety between moderator, target, and bot.
 */
function canModerate(moderatorMember, targetMember, botMember) {
    if (!moderatorMember || !targetMember) return { can: false, reason: 'invalid member.' };
    const guild = moderatorMember.guild;

    if (targetMember.id === guild.ownerId) {
        return { can: false, reason: 'you cannot moderate the server owner.' };
    }
    if (targetMember.id === moderatorMember.id) {
        return { can: false, reason: 'you cannot moderate yourself.' };
    }
    if (botMember && targetMember.id === botMember.id) {
        return { can: false, reason: 'you cannot moderate me.' };
    }
    if (moderatorMember.id !== guild.ownerId && targetMember.roles.highest.position >= moderatorMember.roles.highest.position) {
        return { can: false, reason: 'you cannot moderate a member with a higher or equal role.' };
    }
    if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return { can: false, reason: 'i cannot moderate a member with a higher or equal role than mine.' };
    }

    return { can: true };
}

/**
 * Sends an aesthetic Welcomedm-styled DM notification to penalized user.
 */
async function sendInfractionDM(user, guild, { action, reason, moderator, durationStr, caseId }) {
    if (!user || user.bot) return false;
    const cleanReason = reason || 'no reason provided';

    // 1. Check custom invoke DM configuration
    const normAction = InvokeHelper.normalizeAction(action);
    const invokeDm = normAction && guild?.id && guild.client?.db
        ? guild.client.db.getInvoke(guild.id, normAction, 'dm')
        : null;

    if (invokeDm) {
        try {
            const member = guild.members.cache.get(user.id) || null;
            const payload = InvokeHelper.parseInvokeString(invokeDm, {
                user,
                member,
                moderator,
                guild,
                reason: cleanReason,
                action: normAction,
                durationStr,
                caseId
            });
            await user.send(payload);
            return true;
        } catch (_) {}
    }

    const durationDisplay = durationStr ? ` · **duration:** \`${durationStr}\`` : '';
    const bannerAtt = build.getAssetAttachment('moderation.png') || build.getAssetAttachment('banner.png');
    const files = bannerAtt ? [bannerAtt] : [];

    const dmContent = [
        `### notice from **${guild.name.toLowerCase()}**`,
        `-# you have received an infraction in **${guild.name.toLowerCase()}**.\n`,
        `-# **action:** \`${action.toLowerCase()}\` · **case:** \`#${caseId}\`${durationDisplay}`,
        `-# **moderator:** ${moderator.tag || moderator.username || moderator.id}`,
        `-# **reason:** ${cleanReason}`,
        `-# **timestamp:** <t:${Math.floor(Date.now() / 1000)}:f>`
    ].join('\n');

    try {
        const container = new ContainerBuilder();
        container.setAccentColor(0x0A0A0C);

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(dmContent));

        if (guild.iconURL()) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(guild.iconURL({ size: 256 })));
        }

        container.addSectionComponents(section);

        if (bannerAtt) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                )
            );
        }

        await user.send({
            components: [container],
            files,
            flags: MessageFlags.IsComponentsV2
        });
        return true;
    } catch (_) {
        try {
            const fallback = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(dmContent);
            if (guild.iconURL()) fallback.setThumbnail(guild.iconURL());
            if (bannerAtt) fallback.setImage(`attachment://${bannerAtt.name}`);
            await user.send({ embeds: [fallback], files });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Delivers an aesthetic case card to the server's configured mod-log channel.
 */
async function logToModLogs(guild, client, { action, target, moderator, reason, durationStr, caseId }) {
    if (!guild || !client?.db) return;
    try {
        const settings = client.db.guildSettingsCache.get(guild.id);
        const logChannelId = settings?.modLogChannelId;
        if (!logChannelId) return;

        const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const cleanReason = reason || 'no reason provided';
        const durationDisplay = durationStr ? ` · **duration:** \`${durationStr}\`` : '';
        const targetTag = target.tag || target.user?.tag || target.username || target.id;
        const targetId = target.id;
        const modTag = moderator.tag || moderator.user?.tag || moderator.username || moderator.id;
        const modId = moderator.id;
        const userLink = `https://discord.com/users/${targetId}`;

        const avatarUrl = (typeof target.displayAvatarURL === 'function' ? target.displayAvatarURL({ size: 256 }) : null) ||
                          (target.user && typeof target.user.displayAvatarURL === 'function' ? target.user.displayAvatarURL({ size: 256 }) : null);

        const bannerAtt = build.getAssetAttachment('moderation.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const logContent = [
            `### [case #${caseId} — ${action.toLowerCase()}](${userLink})`,
            `-# **target:** <@${targetId}> (\`${targetTag}\` · \`${targetId}\`)`,
            `-# **moderator:** <@${modId}> (\`${modTag}\`)`,
            `-# **reason:** ${cleanReason}${durationDisplay}`,
            `-# **date:** <t:${Math.floor(Date.now() / 1000)}:f> (<t:${Math.floor(Date.now() / 1000)}:R>)`
        ].join('\n');

        const container = new ContainerBuilder();
        container.setAccentColor(0x0A0A0C);

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(logContent));

        if (avatarUrl) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
        }

        container.addSectionComponents(section);

        if (bannerAtt) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                )
            );
        }

        await channel.send({
            components: [container],
            files,
            flags: MessageFlags.IsComponentsV2
        }).catch(async () => {
            const embed = new EmbedBuilder()
                .setColor(0x0A0A0C)
                .setDescription(logContent);
            if (avatarUrl) embed.setThumbnail(avatarUrl);
            if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);
            await channel.send({ embeds: [embed], files }).catch(() => {});
        });
    } catch (_) {}
}

/**
 * Sends Harm's signature response in-channel for moderation actions.
 */
async function sendModResponse(message, { action, target, reason, caseId, durationStr }) {
    const cleanReason = reason || 'no reason provided';
    const targetUser = target.user || target;
    const targetId = target.id;

    // 1. Check custom invoke message configuration
    const normAction = InvokeHelper.normalizeAction(action);
    const invokeMsg = normAction && message.guild?.id && message.client?.db
        ? message.client.db.getInvoke(message.guild.id, normAction, 'message')
        : null;

    if (invokeMsg) {
        try {
            const member = target.member || (message.guild?.members?.cache?.get(targetId)) || null;
            const payload = InvokeHelper.parseInvokeString(invokeMsg, {
                user: targetUser,
                member,
                moderator: message.author,
                guild: message.guild,
                reason: cleanReason,
                action: normAction,
                durationStr,
                caseId
            });
            return await message.reply(payload);
        } catch (_) {}
    }

    const durationDisplay = durationStr ? ` · **duration:** \`${durationStr}\`` : '';
    const targetDisplay = (targetUser.globalName || targetUser.displayName || targetUser.username || target.tag || target.id).toLowerCase();
    const targetUsername = (targetUser.username || target.tag || target.id).toLowerCase();
    const userLink = `https://discord.com/users/${targetId}`;
    const avatarUrl = (typeof target.displayAvatarURL === 'function' ? target.displayAvatarURL({ size: 256 }) : null) ||
                      (target.user && typeof target.user.displayAvatarURL === 'function' ? target.user.displayAvatarURL({ size: 256 }) : null);

    const approveEmoji = config.emojis?.approve || '<:harm_tick:1558811267014066366>';
    const bannerAtt = build.getAssetAttachment('moderation.png') || build.getAssetAttachment('banner.png');
    const files = bannerAtt ? [bannerAtt] : [];

    const contentLines = [
        `### [${targetDisplay}](${userLink})`,
        `-# [@${targetUsername}](${userLink}) · \`${targetId}\`\n`,
        `-# ${approveEmoji} member has been **${action.toLowerCase()}**.`,
        `-# **moderator:** <@${message.author.id}> · **case:** \`#${caseId}\`${durationDisplay}`,
        `-# **reason:** ${cleanReason}`
    ];
    const textContent = contentLines.join('\n');

    try {
        const container = new ContainerBuilder();
        container.setAccentColor(0x0A0A0C);

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(textContent));

        if (avatarUrl) {
            section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
        }

        container.addSectionComponents(section);

        if (bannerAtt) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                )
            );
        }

        return await message.reply({
            components: [container],
            files,
            flags: MessageFlags.IsComponentsV2
        });
    } catch (_) {
        const fallback = new EmbedBuilder()
            .setColor(0x0A0A0C)
            .setDescription(textContent);
        if (avatarUrl) fallback.setThumbnail(avatarUrl);
        if (bannerAtt) fallback.setImage(`attachment://${bannerAtt.name}`);
        return await message.reply({ embeds: [fallback], files }).catch(() => {});
    }
}

/**
 * Resolves a member or user from an argument (mention, ID, or username tag).
 */
async function resolveUserOrMember(message, arg) {
    if (!arg) return null;
    const clean = arg.replace(/[<@!>]/g, '').trim();

    // 1. Try snowflake ID lookup
    if (/^\d{17,20}$/.test(clean)) {
        const member = message.guild.members.cache.get(clean) || await message.guild.members.fetch(clean).catch(() => null);
        if (member) return { member, user: member.user };

        // Fetch user directly if not in guild (for unban or ban by ID)
        const user = await message.client.users.fetch(clean).catch(() => null);
        if (user) return { member: null, user };
    }

    // 2. Try exact and prefix match from in-memory cache
    const search = clean.toLowerCase();
    let memberMatch = message.guild.members.cache.find(m =>
        m.user.username.toLowerCase() === search ||
        m.user.tag.toLowerCase() === search ||
        (m.nickname && m.nickname.toLowerCase() === search) ||
        (m.user.globalName && m.user.globalName.toLowerCase() === search)
    );
    if (memberMatch) return { member: memberMatch, user: memberMatch.user };

    memberMatch = message.guild.members.cache.find(m =>
        m.user.username.toLowerCase().startsWith(search) ||
        (m.nickname && m.nickname.toLowerCase().startsWith(search)) ||
        (m.user.globalName && m.user.globalName.toLowerCase().startsWith(search))
    );
    if (memberMatch) return { member: memberMatch, user: memberMatch.user };

    // 3. Query Discord API for members across the entire server
    try {
        const fetchedMembers = await message.guild.members.fetch({ query: search, limit: 10 });
        if (fetchedMembers && fetchedMembers.size > 0) {
            let apiMatch = fetchedMembers.find(m =>
                m.user.username.toLowerCase() === search ||
                m.user.tag.toLowerCase() === search ||
                (m.nickname && m.nickname.toLowerCase() === search) ||
                (m.user.globalName && m.user.globalName.toLowerCase() === search)
            );
            if (!apiMatch) apiMatch = fetchedMembers.first();
            if (apiMatch) return { member: apiMatch, user: apiMatch.user };
        }
    } catch (_) {}

    // 4. Fallback: check SQLite database for blinded users in this guild
    if (message.client.db) {
        try {
            const blinded = await message.client.db.getAllBlindedUsers(message.guild.id);
            for (const b of blinded) {
                const mem = message.guild.members.cache.get(b.user_id) || await message.guild.members.fetch(b.user_id).catch(() => null);
                if (mem) {
                    const u = mem.user;
                    if (
                        u.username.toLowerCase() === search ||
                        u.username.toLowerCase().startsWith(search) ||
                        u.tag.toLowerCase() === search ||
                        (u.globalName && u.globalName.toLowerCase().startsWith(search)) ||
                        (mem.nickname && mem.nickname.toLowerCase().startsWith(search)) ||
                        b.user_id === clean
                    ) {
                        return { member: mem, user: u };
                    }
                }
            }
        } catch (_) {}
    }

    return null;
}

/**
 * Authentic hyper-cringe phonetic Uwu engine.
 */
function uwuify(text) {
    if (!text || typeof text !== 'string') return text;
    let s = text;

    s = s.replace(/\bwhat\b/gi, 'wat');
    s = s.replace(/\byou\b/gi, 'yuw');
    s = s.replace(/\byour\b/gi, 'yur');
    s = s.replace(/\bthe\b/gi, 'da');
    s = s.replace(/\bthis\b/gi, 'dis');
    s = s.replace(/\bplease\b/gi, 'pwease');
    s = s.replace(/\bthanks\b/gi, 'thxies');
    s = s.replace(/\bno\b/gi, 'nyo');
    s = s.replace(/\bhello\b/gi, 'hewwo');
    s = s.replace(/\bhi\b/gi, 'hai');
    s = s.replace(/\blove\b/gi, 'wuv');

    s = s.replace(/[rl]/g, 'w');
    s = s.replace(/[RL]/g, 'W');
    s = s.replace(/ove/g, 'uv');
    s = s.replace(/OVE/g, 'UV');
    s = s.replace(/na/g, 'nya');
    s = s.replace(/ne/g, 'nye');
    s = s.replace(/ni/g, 'nyi');
    s = s.replace(/no/g, 'nyo');
    s = s.replace(/nu/g, 'nyu');

    s = s.split(' ').map(word => {
        if (word.length > 3 && !word.startsWith('http') && !word.startsWith('<') && Math.random() < 0.35) {
            const firstChar = word.charAt(0);
            return `${firstChar}-${word}`;
        }
        return word;
    }).join(' ');

    const kaomojis = [
        'uwu', 'owo', '>w<', '(⑅˘꒳˘)', '(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)',
        '*nuzzles*', '*blushes*', '*pounces on u*', '(◕ᴗ◕)', 'x3', '˘ᵕ˘'
    ];
    const randomKaomoji = kaomojis[Math.floor(Math.random() * kaomojis.length)];
    return `${s} ${randomKaomoji}`;
}

/**
 * Alternating mocking SpongeBob case.
 */
function mockify(text) {
    if (!text || typeof text !== 'string') return text;
    let result = '';
    let upper = false;
    for (const char of text) {
        if (/[a-zA-Z]/.test(char)) {
            result += upper ? char.toUpperCase() : char.toLowerCase();
            upper = !upper;
        } else {
            result += char;
        }
    }
    return result;
}

/**
 * Pedantic pseudo-intellectual nerd formatting.
 */
function nerdify(text) {
    if (!text || typeof text !== 'string') return text;
    const intros = [
        '☝️🤓 "erm, actually...',
        '🤓☝️ "to be technically accurate,',
        '☝️🤓 "per my comprehensive calculations,',
        '🤓 "um, theoretically speaking,'
    ];
    const citations = [
        '[citation needed]',
        '[source: trust me]',
        '[peer-reviewed by myself]',
        '[statistically verified]'
    ];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    const cite = citations[Math.floor(Math.random() * citations.length)];
    const clean = text.trim().replace(/^["']|["']$/g, '');
    return `${intro} ${clean} ${cite}" 📚`;
}

/**
 * Circus clown sound effects and honks formatting.
 */
function clownify(text) {
    if (!text || typeof text !== 'string') return text;
    const clownEmoji = config.emojis?.harm_clown || '';
    const soundEffects = ['*honk honk*', '*squeak*', '*balloon pops*', '*pie in face*'];
    const words = text.trim().split(/\s+/);
    if (words.length <= 2) {
        return `${clownEmoji} *honk honk* ${text} *squeak* ${clownEmoji}`.trim();
    }
    const newWords = [];
    for (let i = 0; i < words.length; i++) {
        newWords.push(words[i]);
        if ((i + 1) % 3 === 0 || Math.random() < 0.25) {
            const sound = soundEffects[Math.floor(Math.random() * soundEffects.length)];
            newWords.push(sound);
        }
    }
    return `${clownEmoji} ${newWords.join(' ')} ${clownEmoji}`.trim();
}

/**
 * Impersonates a user in a channel using a webhook.
 */
async function sendAsUser(channel, user, content, member = null) {
    if (!channel || !content) return;
    const name = member?.displayName || user.globalName || user.username;
    const avatarURL = user.displayAvatarURL({ dynamic: true });

    let webhook = null;
    try {
        if (typeof channel.fetchWebhooks === 'function') {
            const webhooks = await channel.fetchWebhooks().catch(() => null);
            if (webhooks) {
                webhook = webhooks.find(wh => wh.name === 'harm-lock-mirror' || wh.owner?.id === channel.client.user?.id);
            }
            if (!webhook && typeof channel.createWebhook === 'function') {
                webhook = await channel.createWebhook({
                    name: 'harm-lock-mirror',
                    avatar: channel.client.user?.displayAvatarURL()
                }).catch(() => null);
            }
        }
    } catch (_) {}

    if (webhook) {
        await webhook.send({
            content,
            username: name.slice(0, 80),
            avatarURL
        }).catch(() => {});
    } else {
        await channel.send(`**${name}:** ${content}`).catch(() => {});
    }
}

module.exports = {
    parseDuration,
    formatDuration,
    canModerate,
    sendInfractionDM,
    logToModLogs,
    sendModResponse,
    resolveUserOrMember,
    uwuify,
    mockify,
    nerdify,
    clownify,
    sendAsUser
};
