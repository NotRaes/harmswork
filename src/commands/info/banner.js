const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class BannerCommand {
    constructor() {
        this.name = 'banner';
        this.aliases = ['userbanner', 'ubanner', 'serverbanner', 'splash'];
        this.description = "display a member's banner, member server banner, guild banner, or splash.";
        this.syntax = ',banner [@user|uid|server|splash]';
        this.example = ',banner @user';
        this.category = 'info';
        this.cooldown = 2;
        this.subcommands = [
            'banner [@user]',
            'banner server [@user]',
            'banner server',
            'banner splash'
        ];
        this.subcommandDetails = {
            user: {
                description: "view a user's global profile banner.",
                syntax: ',banner [@user|uid]',
                example: ',banner @user'
            },
            server_member: {
                description: "view a member's server-specific profile banner in this guild.",
                syntax: ',banner server @user',
                example: ',banner server @user'
            },
            server: {
                description: "view the current server's banner.",
                syntax: ',banner server',
                example: ',banner server'
            },
            splash: {
                description: "view the current server's invite splash background.",
                syntax: ',banner splash',
                example: ',banner splash'
            }
        };
    }

    async execute(message, args, commandName) {
        const db = message.client.db;
        const invoked = (commandName || '').toLowerCase();
        let sub = (args?.[0] || '').toLowerCase();

        // Direct alias support: ,splash
        if (invoked === 'splash') {
            args = ['splash', ...args];
            sub = 'splash';
        }

        // ──────────────────────── 1. SERVER INVITE SPLASH ────────────────────────
        if (sub === 'splash') {
            if (!message.guild) {
                return message.reply(build.warnBox('nothing found', 'server splash is only available inside servers.'));
            }

            const splashUrl = message.guild.splashURL({ size: 2048 });
            if (!splashUrl) {
                return message.reply(build.warnBox('nothing found', `${message.guild.name} has no invite splash set.`));
            }

            const pngUrl = message.guild.splashURL({ extension: 'png', size: 2048 });
            const webpUrl = message.guild.splashURL({ extension: 'webp', size: 2048 });

            const links = `[png](${pngUrl}) · [webp](${webpUrl})`;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### [${message.guild.name.toLowerCase()}'s splash](https://discord.gg/hCQhTmPf2G)\n${links}`)
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(pngUrl || splashUrl)
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
                    .setDescription(`### [${message.guild.name.toLowerCase()}'s splash](https://discord.gg/hCQhTmPf2G)\n\n${links}`)
                    .setImage(pngUrl || splashUrl);
                return await message.reply({ embeds: [embed] });
            }
        }

        // ──────────────────────── 2. SERVER GUILD BANNER (NO TARGET USER) ────────────────────────
        if ((sub === 'server' || sub === 'guild') && (!args[1] || args.length === 1)) {
            if (!message.guild) {
                return message.reply(build.warnBox('nothing found', 'server banner is only available inside servers.'));
            }
            const bannerUrl = message.guild.bannerURL({ size: 2048 });
            if (!bannerUrl) {
                return message.reply(build.warnBox('nothing found', `${message.guild.name} has no banner set.`));
            }
            const pngUrl = message.guild.bannerURL({ extension: 'png', size: 2048 });
            const webpUrl = message.guild.bannerURL({ extension: 'webp', size: 2048 });
            const isAnimated = Boolean(message.guild.banner?.startsWith('a_'));
            const gifUrl = isAnimated ? message.guild.bannerURL({ extension: 'gif', size: 2048 }) : null;
            const displayUrl = gifUrl || pngUrl || bannerUrl;

            const links = isAnimated
                ? `[gif](${gifUrl}) · [png](${pngUrl}) · [webp](${webpUrl})`
                : `[png](${pngUrl}) · [webp](${webpUrl})`;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### [${message.guild.name.toLowerCase()}'s banner](https://discord.gg/hCQhTmPf2G)\n${links}`)
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
                    .setDescription(`### [${message.guild.name.toLowerCase()}'s banner](https://discord.gg/hCQhTmPf2G)\n\n${links}`)
                    .setImage(displayUrl);
                return await message.reply({ embeds: [embed] });
            }
        }

        // ──────────────────────── 3. TARGET USER & SERVER-MEMBER BANNER RESOLUTION ────────────────────────
        let targetUser = message.author;
        let isServerBannerRequested = false;

        const filteredArgs = [];
        if (args && args.length > 0) {
            for (const a of args) {
                const lower = a.toLowerCase();
                if (lower === 'server' || lower === '-server' || lower === 'guild') {
                    isServerBannerRequested = true;
                } else if (lower !== 'splash') {
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

        // ──────────────────────── 4. MEMBER SERVER-SPECIFIC BANNER ────────────────────────
        if (isServerBannerRequested && message.guild) {
            const member = message.guild?.members?.cache?.get(targetUser.id)
                || (typeof message.guild?.members?.fetch === 'function' ? await message.guild.members.fetch(targetUser.id).catch(() => null) : null);

            const memberBanner = member && typeof member.bannerURL === 'function' ? member.bannerURL({ size: 2048 }) : null;

            if (!memberBanner) {
                return message.reply(build.warnBox('nothing found', `${targetUser.username} has no server banner set in this server.`));
            }

            const pngUrl = member.bannerURL({ extension: 'png', size: 2048 });
            const webpUrl = member.bannerURL({ extension: 'webp', size: 2048 });
            const isAnimated = Boolean(member.banner?.startsWith('a_'));
            const gifUrl = isAnimated ? member.bannerURL({ extension: 'gif', size: 2048 }) : null;
            const displayUrl = gifUrl || pngUrl || memberBanner;

            const links = isAnimated
                ? `[gif](${gifUrl}) · [png](${pngUrl}) · [webp](${webpUrl})`
                : `[png](${pngUrl}) · [webp](${webpUrl})`;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### [${targetUser.username}'s server banner](https://discord.gg/hCQhTmPf2G)\n${links}`)
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
                    .setDescription(`### [${targetUser.username}'s server banner](https://discord.gg/hCQhTmPf2G)\n\n${links}`)
                    .setImage(displayUrl);
                return await message.reply({ embeds: [embed] });
            }
        }

        // ──────────────────────── 5. GLOBAL USER BANNER ────────────────────────
        const fetchedUser = (typeof targetUser.fetch === 'function')
            ? await targetUser.fetch({ force: true }).catch(() => targetUser)
            : (message.client?.users?.fetch ? await message.client.users.fetch(targetUser.id, { force: true }).catch(() => targetUser) : targetUser);

        if (!fetchedUser.banner) {
            return message.reply(build.warnBox('nothing found', `${targetUser.username} has no banner set.`));
        }

        const isAnimated = Boolean(fetchedUser.banner?.startsWith('a_'));
        const pngUrl = fetchedUser.bannerURL({ extension: 'png', size: 2048 });
        const webpUrl = fetchedUser.bannerURL({ extension: 'webp', size: 2048 });
        const gifUrl = isAnimated ? fetchedUser.bannerURL({ extension: 'gif', size: 2048 }) : null;
        const displayUrl = gifUrl || pngUrl;

        const links = isAnimated
            ? `[gif](${gifUrl}) · [png](${pngUrl}) · [webp](${webpUrl})`
            : `[png](${pngUrl}) · [webp](${webpUrl})`;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### [${targetUser.username}'s banner](https://discord.gg/hCQhTmPf2G)\n${links}`)
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
                .setDescription(`### [${targetUser.username}'s banner](https://discord.gg/hCQhTmPf2G)\n\n${links}`)
                .setImage(displayUrl);
            return await message.reply({ embeds: [embed] });
        }
    }
}

module.exports = BannerCommand;
