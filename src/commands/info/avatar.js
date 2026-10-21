const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const https = require('https');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function fetchRawUser(token, userId) {
    return new Promise((resolve) => {
        const req = https.request(`https://discord.com/api/v10/users/${userId}`, {
            headers: { 'Authorization': `Bot ${token}` }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

class AvatarCommand {
    constructor() {
        this.name = 'avatar';
        this.aliases = ['av', 'pfp', 'deco', 'decoration'];
        this.description = "display a member's avatar, server avatar, or avatar decoration.";
        this.syntax = ',avatar [@user|server|deco]';
        this.example = ',avatar @user';
        this.category = 'info';
        this.cooldown = 2;
        this.subcommands = [
            'avatar [@user]',
            'avatar server [@user]',
            'avatar deco [@user]'
        ];
        this.subcommandDetails = {
            user: {
                description: "view a user's global profile avatar.",
                syntax: ',avatar [@user|uid]',
                example: ',avatar @user'
            },
            server: {
                description: "view a member's server-specific avatar in this guild.",
                syntax: ',avatar server [@user]',
                example: ',avatar server @user'
            },
            deco: {
                description: "extract and view a member's equipped avatar decoration preset.",
                syntax: ',avatar deco [@user]',
                example: ',avatar deco @user'
            }
        };
    }

    async execute(message, args, commandName) {
        const db = message.client.db;
        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();

        // Direct alias support for deco / decoration: ,deco [@user]
        if (invoked === 'deco' || invoked === 'decoration') {
            args = ['deco', ...args];
            sub = 'deco';
        }

        // ──────────────────────── 1. TARGET USER RESOLUTION ────────────────────────
        let targetUser = message.author;
        let isServerAvatarRequested = false;
        let isDecoRequested = false;

        const filteredArgs = [];
        if (args && args.length > 0) {
            for (const a of args) {
                const lower = a.toLowerCase();
                if (lower === 'server' || lower === '-server' || lower === 'guild') {
                    isServerAvatarRequested = true;
                } else if (lower === 'deco' || lower === 'decoration' || lower === 'preset') {
                    isDecoRequested = true;
                } else {
                    filteredArgs.push(a);
                }
            }
        }

        if (filteredArgs.length > 0) {
            const raw = (typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null) || filteredArgs[0];
            const resolved = db ? await db.resolveUserOrProfile(raw) : null;
            if (resolved) {
                targetUser = (typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null)
                    || message.guild?.members?.cache?.get(resolved.userId)?.user
                    || message.client.users.cache.get(resolved.userId)
                    || await message.client.users.fetch(resolved.userId).catch(() => null);
            } else {
                const cleanId = String(filteredArgs[0]).replace(/[<@!>]/g, '');
                targetUser = (typeof message.mentions?.users?.first === 'function' ? message.mentions.users.first() : null)
                    || message.guild?.members?.cache?.get(cleanId)?.user
                    || message.client.users.cache.get(cleanId)
                    || await message.client.users.fetch(cleanId).catch(() => null);
            }
        }

        if (!targetUser) {
            return message.reply(build.warnBox('nothing found', 'user could not be found.'));
        }

        // ──────────────────────── 3. AVATAR DECORATION MODE ────────────────────────
        if (isDecoRequested) {
            let fetchedUser = null;
            try {
                fetchedUser = await message.client.users.fetch(targetUser.id, { force: true });
            } catch (_) {
                fetchedUser = targetUser;
            }

            let asset = fetchedUser.avatarDecorationData?.asset;
            if (!asset) {
                const raw = await fetchRawUser(config.token, targetUser.id);
                asset = raw?.avatar_decoration_data?.asset;
            }

            if (!asset) {
                return message.reply(build.warnBox('nothing found', `${targetUser.username} has no avatar decoration equipped.`));
            }

            const decoUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=4096&passthrough=true`;
            const staticUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=4096`;
            const isAnimated = asset.startsWith('a_');

            const links = isAnimated
                ? `[animated](${decoUrl}) · [png](${staticUrl})`
                : `[png](${staticUrl})`;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### [${targetUser.username}'s decoration](https://discord.gg/hCQhTmPf2G)\n${links}`
                    )
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(decoUrl)
                    )
                );

            try {
                return await message.reply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setDescription(
                        `### [${targetUser.username}'s decoration](https://discord.gg/hCQhTmPf2G)\n\n${links}`
                    )
                    .setImage(decoUrl);
                return await message.reply({ embeds: [embed] });
            }
        }

        // ──────────────────────── 4. SERVER AVATAR MODE ────────────────────────
        if (isServerAvatarRequested) {
            const member = message.guild?.members?.cache?.get(targetUser.id)
                || (typeof message.guild?.members?.fetch === 'function' ? await message.guild.members.fetch(targetUser.id).catch(() => null) : null);

            if (!member?.avatar) {
                return message.reply(build.warnBox('nothing found', `${targetUser.username} has no server avatar set in this server.`));
            }

            const isAnimated = member.avatar.startsWith('a_');
            const pngUrl = member.displayAvatarURL({ extension: 'png', size: 2048 });
            const webpUrl = member.displayAvatarURL({ extension: 'webp', size: 2048 });
            const gifUrl = isAnimated ? member.displayAvatarURL({ extension: 'gif', size: 2048 }) : null;
            const displayUrl = gifUrl || pngUrl;

            const links = isAnimated
                ? `[gif](${gifUrl}) · [png](${pngUrl}) · [webp](${webpUrl})`
                : `[png](${pngUrl}) · [webp](${webpUrl})`;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### [${targetUser.username}'s server avatar](https://discord.gg/hCQhTmPf2G)\n${links}`)
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(displayUrl)
                    )
                );

            try {
                return await message.reply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setDescription(`### [${targetUser.username}'s server avatar](https://discord.gg/hCQhTmPf2G)\n\n${links}`)
                    .setImage(displayUrl);
                return await message.reply({ embeds: [embed] });
            }
        }

        // ──────────────────────── 5. GLOBAL USER AVATAR ────────────────────────
        const isAnimated = Boolean(targetUser.avatar?.startsWith('a_'));
        const pngUrl = targetUser.displayAvatarURL({ extension: 'png', size: 2048 });
        const webpUrl = targetUser.displayAvatarURL({ extension: 'webp', size: 2048 });
        const gifUrl = isAnimated ? targetUser.displayAvatarURL({ extension: 'gif', size: 2048 }) : null;
        const displayUrl = gifUrl || pngUrl;

        const links = isAnimated
            ? `[gif](${gifUrl}) · [png](${pngUrl}) · [webp](${webpUrl})`
            : `[png](${pngUrl}) · [webp](${webpUrl})`;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### [${targetUser.username}'s avatar](https://discord.gg/hCQhTmPf2G)\n${links}`)
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(displayUrl)
                )
            );

        try {
            return await message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setDescription(`### [${targetUser.username}'s avatar](https://discord.gg/hCQhTmPf2G)\n\n${links}`)
                .setImage(displayUrl);
            return await message.reply({ embeds: [embed] });
        }
    }
}

module.exports = AvatarCommand;
