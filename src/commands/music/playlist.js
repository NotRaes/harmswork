const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function formatDuration(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '0:00';
    const s = Math.floor(sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

class PlaylistCommand {
    constructor() {
        this.name = 'playlist';
        this.aliases = ['pl', 'playlists', 'savedplaylist'];
        this.description = 'create, manage, and queue custom saved music playlists.';
        this.syntax = ',playlist <create|delete|add|remove|play|list|view> [args]';
        this.example = ',playlist create vibes | ,playlist add vibes song | ,playlist play vibes';
        this.category = 'music';
        this.cooldown = 2;
        this.subcommands = ['create', 'delete', 'add', 'remove', 'play', 'load', 'list', 'view', 'info'];
        this.subcommandDetails = {
            create: {
                description: 'create a new personal saved music playlist.',
                syntax: ',playlist create <name>',
                example: ',playlist create lofi'
            },
            delete: {
                description: 'permanently delete one of your saved playlists.',
                syntax: ',playlist delete <name>',
                example: ',playlist delete lofi'
            },
            add: {
                description: 'add a song or currently playing track to your playlist.',
                syntax: ',playlist add <name> [query|url]',
                example: ',playlist add lofi https://... or ,playlist add lofi'
            },
            remove: {
                description: 'remove a track from your playlist by its position number.',
                syntax: ',playlist remove <name> <track #>',
                example: ',playlist remove lofi 3'
            },
            play: {
                description: 'enqueue all tracks from your saved playlist into the music queue.',
                syntax: ',playlist play <name>',
                example: ',playlist play lofi'
            },
            list: {
                description: 'display all of your saved playlists and total tracks.',
                syntax: ',playlist list',
                example: ',playlist list'
            },
            view: {
                description: 'browse and inspect all tracks inside a saved playlist.',
                syntax: ',playlist view <name> [page]',
                example: ',playlist view lofi'
            }
        };
    }

    async execute(message, args) {
        const db = message.client.db;
        if (!db) {
            return message.reply({ embeds: [build.deny(message.author, 'database is not initialized.')] });
        }

        const sub = (args[0] || '').toLowerCase();
        const bannerAttachment = build.getAssetAttachment('music.png');
        const files = bannerAttachment ? [bannerAttachment] : [];
        const e = config.emojis || {};

        // 1. Subcommand: create <name>
        if (sub === 'create' || sub === 'new' || sub === 'make') {
            const rawName = args.slice(1).join('-').trim().toLowerCase();
            if (!rawName) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,playlist create <name>`')] });
            }
            const cleanName = rawName.replace(/[^a-z0-9_-]/g, '').slice(0, 30);
            if (!cleanName || cleanName.length < 2) {
                return message.reply({ embeds: [build.deny(message.author, 'playlist name must be 2-30 characters (letters, numbers, hyphens only).')] });
            }

            const userPlaylists = await db.getUserPlaylists(message.author.id);
            if (userPlaylists.length >= 25) {
                return message.reply({ embeds: [build.deny(message.author, 'you have reached the limit of 25 personal playlists.')] });
            }

            const existing = await db.getPlaylist(message.author.id, cleanName);
            if (existing) {
                return message.reply({ embeds: [build.deny(message.author, `you already have a playlist named \`${cleanName}\`.'`)] });
            }

            const createdId = await db.createPlaylist(message.author.id, cleanName);
            if (!createdId) {
                return message.reply({ embeds: [build.deny(message.author, 'failed to create playlist. please try another name.')] });
            }

            return message.reply({
                embeds: [build.approved(message.author, `created playlist **${cleanName}**. add tracks with \`,playlist add ${cleanName} <query>\`.`)]
            });
        }

        // 2. Subcommand: delete <name>
        if (sub === 'delete' || sub === 'del' || sub === 'removeplaylist') {
            const cleanName = (args[1] || '').trim().toLowerCase();
            if (!cleanName) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,playlist delete <name>`')] });
            }

            const existing = await db.getPlaylist(message.author.id, cleanName);
            if (!existing) {
                return message.reply({ embeds: [build.warn(message.author, `you don't have a playlist named \`${cleanName}\`.`)] });
            }

            const deleted = await db.deletePlaylist(message.author.id, cleanName);
            if (!deleted) {
                return message.reply({ embeds: [build.deny(message.author, `failed to delete playlist \`${cleanName}\`.`)] });
            }

            return message.reply({
                embeds: [build.approved(message.author, `permanently deleted playlist **${cleanName}**.`)]
            });
        }

        // 3. Subcommand: add <name> [query|url]
        if (sub === 'add' || sub === 'append') {
            const cleanName = (args[1] || '').trim().toLowerCase();
            if (!cleanName) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,playlist add <name> [query|url]`')] });
            }

            const playlist = await db.getPlaylist(message.author.id, cleanName);
            if (!playlist) {
                return message.reply({ embeds: [build.warn(message.author, `you don't have a playlist named \`${cleanName}\`. create it with \`,playlist create ${cleanName}\`.`)] });
            }

            const currentTracks = await db.getPlaylistTracks(playlist.id);
            if (currentTracks.length >= 100) {
                return message.reply({ embeds: [build.deny(message.author, `playlist \`${cleanName}\` has reached the maximum capacity of 100 tracks.`)] });
            }

            const query = args.slice(2).join(' ').trim();
            const music = message.client.music;

            if (query) {
                // Search query or URL
                const searchMsg = await message.reply({
                    embeds: [build.say(message.author, `searching track for \`${cleanName}\`...`)]
                }).catch(() => null);

                try {
                    const result = await music.search(query, message.author);
                    if (!result || (!result.track && (!result.tracks || result.tracks.length === 0))) {
                        const failEmbed = [build.warn(message.author, `no results found for \`${query.slice(0, 70)}\`.`)];
                        if (searchMsg) return searchMsg.edit({ embeds: failEmbed }).catch(() => {});
                        return message.reply({ embeds: failEmbed });
                    }

                    if (result.isPlaylist && Array.isArray(result.tracks)) {
                        const availableSlots = 100 - currentTracks.length;
                        const toAdd = result.tracks.slice(0, availableSlots);
                        for (const t of toAdd) {
                            await db.addTrackToPlaylist(playlist.id, {
                                title: t.title || 'unknown track',
                                url: t.url,
                                duration: t.duration || 0,
                                author: t.author || 'unknown'
                            });
                        }
                        const confirmEmbed = [build.approved(
                            message.author,
                            `added **${toAdd.length}** track(s) from **${result.title || 'playlist'}** to **${cleanName}** (\`${currentTracks.length + toAdd.length}/100\` tracks).`
                        )];
                        if (searchMsg) return searchMsg.edit({ embeds: confirmEmbed }).catch(() => {});
                        return message.reply({ embeds: confirmEmbed });
                    } else {
                        const track = result.track;
                        await db.addTrackToPlaylist(playlist.id, {
                            title: track.title || 'unknown track',
                            url: track.url,
                            duration: track.duration || 0,
                            author: track.author || 'unknown'
                        });
                        const confirmEmbed = [build.approved(
                            message.author,
                            `added [${track.title.toLowerCase()}](${track.url}) to **${cleanName}** (\`${currentTracks.length + 1}/100\` tracks).`
                        )];
                        if (searchMsg) return searchMsg.edit({ embeds: confirmEmbed }).catch(() => {});
                        return message.reply({ embeds: confirmEmbed });
                    }
                } catch (err) {
                    const failEmbed = [build.deny(message.author, 'failed to fetch track details for this playlist.')];
                    if (searchMsg) return searchMsg.edit({ embeds: failEmbed }).catch(() => {});
                    return message.reply({ embeds: failEmbed });
                }
            } else {
                // Add currently playing song in guild
                const queue = music?.getQueue(message.guild?.id);
                if (!queue || !queue.current) {
                    return message.reply({
                        embeds: [build.warn(message.author, 'nothing is currently playing. provide a query: `,playlist add <name> <song url or name>`')]
                    });
                }

                const track = queue.current;
                await db.addTrackToPlaylist(playlist.id, {
                    title: track.title || 'unknown track',
                    url: track.url,
                    duration: track.duration || 0,
                    author: track.author || 'unknown'
                });

                return message.reply({
                    embeds: [build.approved(
                        message.author,
                        `bookmarked current track [${track.title.toLowerCase()}](${track.url}) into **${cleanName}** (\`${currentTracks.length + 1}/100\` tracks).`
                    )]
                });
            }
        }

        // 4. Subcommand: remove <name> <track #>
        if (sub === 'remove' || sub === 'rem' || sub === 'rm') {
            const cleanName = (args[1] || '').trim().toLowerCase();
            const trackNum = parseInt(args[2], 10);
            if (!cleanName || isNaN(trackNum)) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,playlist remove <name> <track #>`')] });
            }

            const playlist = await db.getPlaylist(message.author.id, cleanName);
            if (!playlist) {
                return message.reply({ embeds: [build.warn(message.author, `you don't have a playlist named \`${cleanName}\`.`)] });
            }

            const removed = await db.removeTrackFromPlaylist(playlist.id, trackNum);
            if (!removed) {
                return message.reply({ embeds: [build.deny(message.author, `invalid track number **#${trackNum}**. use \`,playlist view ${cleanName}\` to inspect tracks.`)] });
            }

            return message.reply({
                embeds: [build.approved(message.author, `removed track **#${trackNum}** from playlist **${cleanName}**.`)]
            });
        }

        // 5. Subcommand: play <name> / load <name>
        if (sub === 'play' || sub === 'load' || sub === 'start' || sub === 'queue') {
            const cleanName = (args[1] || '').trim().toLowerCase();
            if (!cleanName) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,playlist play <name>`')] });
            }

            const memberVoice = message.member?.voice?.channel;
            if (!memberVoice) {
                return message.reply({
                    embeds: [build.warn(message.author, 'you must be in a voice channel to stream a playlist.')]
                });
            }

            const permissions = memberVoice.permissionsFor(message.client.user);
            if (!permissions?.has('Connect') || !permissions?.has('Speak')) {
                return message.reply({
                    embeds: [build.deny(message.author, 'harm needs `connect` and `speak` permissions in your voice channel.')]
                });
            }

            const playlist = await db.getPlaylist(message.author.id, cleanName);
            if (!playlist) {
                return message.reply({ embeds: [build.warn(message.author, `you don't have a playlist named \`${cleanName}\`. create it with \`,playlist create ${cleanName}\`.`)] });
            }

            const tracks = await db.getPlaylistTracks(playlist.id);
            if (!tracks || tracks.length === 0) {
                return message.reply({ embeds: [build.warn(message.author, `playlist \`${cleanName}\` is empty. add tracks with \`,playlist add ${cleanName} <song>\`.`)] });
            }

            const music = message.client.music;
            const queue = music.getOrCreateQueue(message.guild, memberVoice, message.channel);

            const isFirst = !queue.current;
            for (const t of tracks) {
                queue.enqueue({
                    title: t.title,
                    url: t.url,
                    streamUrl: null,
                    duration: t.duration || 0,
                    durationFormatted: formatDuration(t.duration),
                    author: t.author || 'unknown',
                    thumbnail: null,
                    requester: message.author
                });
            }

            if (isFirst) {
                await queue.play();
            }

            return message.reply({
                embeds: [build.approved(
                    message.author,
                    `queued **${tracks.length}** track(s) from playlist **${cleanName}** into active queue.`
                )]
            });
        }

        // 6. Subcommand: view <name> [page]
        if (sub === 'view' || sub === 'info' || sub === 'show') {
            const cleanName = (args[1] || '').trim().toLowerCase();
            if (!cleanName) {
                return message.reply({ embeds: [build.warn(message.author, 'syntax: `,playlist view <name>`')] });
            }

            const playlist = await db.getPlaylist(message.author.id, cleanName);
            if (!playlist) {
                return message.reply({ embeds: [build.warn(message.author, `you don't have a playlist named \`${cleanName}\`.`)] });
            }

            const tracks = await db.getPlaylistTracks(playlist.id);
            if (!tracks || tracks.length === 0) {
                return message.reply({
                    embeds: [build.say(message.author, `playlist **${cleanName}** is currently empty. add tracks with \`,playlist add ${cleanName} <query>\`.`)]
                });
            }

            const pageSize = 8;
            const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
            let currentPage = 1;
            if (args[2] && !isNaN(args[2])) {
                const req = parseInt(args[2], 10);
                if (req >= 1 && req <= totalPages) currentPage = req;
            }

            const totalDurationSec = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

            const buildPagePayload = (page) => {
                const start = (page - 1) * pageSize;
                const end = Math.min(start + pageSize, tracks.length);
                const pageTracks = tracks.slice(start, end);

                let listMarkdown = '';
                pageTracks.forEach((t, i) => {
                    const idx = start + i + 1;
                    const dur = formatDuration(t.duration);
                    listMarkdown += `-# \`${idx}.\` [${t.title.toLowerCase()}](${t.url}) \`[${dur}]\` · *${t.author.toLowerCase()}*\n`;
                });

                const desc = `### [playlist • ${playlist.name}](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# **creator** <@${message.author.id}> · **tracks** \`${tracks.length}\` · **duration** \`${formatDuration(totalDurationSec)}\`\n` +
                    `-# **page** \`${page}/${totalPages}\` · use \`,playlist play ${playlist.name}\` to stream.\n\n` +
                    listMarkdown;

                const buttons = [];
                if (totalPages > 1) {
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId('pl_prev')
                            .setEmoji(e.harm_left || '<:harm_left:1560309043657052240>')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page <= 1),
                        new ButtonBuilder()
                            .setCustomId('pl_count')
                            .setLabel(`${page} / ${totalPages}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('pl_next')
                            .setEmoji(e.harm_right || '<:harm_right:1560309045720649819>')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page >= totalPages)
                    );
                }

                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('pl_play_this')
                        .setLabel(`play ${playlist.name}`)
                        .setStyle(ButtonStyle.Primary)
                );

                const row = new ActionRowBuilder().addComponents(buttons);

                try {
                    const container = new ContainerBuilder();
                    container.setAccentColor(0x0A0A0C);

                    const section = new SectionBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(desc)
                    );

                    const avatar = message.author.displayAvatarURL({ dynamic: true, size: 256 });
                    if (avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar));
                    container.addSectionComponents(section);

                    if (bannerAttachment) {
                        container.addMediaGalleryComponents(
                            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://music.png'))
                        );
                    }

                    container.addSeparatorComponents(
                        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                    );
                    container.addActionRowComponents(row);

                    return {
                        components: [container],
                        files,
                        flags: MessageFlags.IsComponentsV2
                    };
                } catch (_) {
                    const fallbackEmbed = new EmbedBuilder()
                        .setColor(config.colors?.c || '#0A0A0C')
                        .setDescription(desc);
                    if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
                    return {
                        embeds: [fallbackEmbed],
                        components: [row],
                        files
                    };
                }
            };

            const initialPayload = buildPagePayload(currentPage);
            const replyMsg = await message.reply(initialPayload);

            if (replyMsg && replyMsg.createMessageComponentCollector) {
                const collector = replyMsg.createMessageComponentCollector({ time: 45000 });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({
                            content: 'only the command author can browse this playlist view.',
                            ephemeral: true
                        }).catch(() => {});
                    }

                    if (i.customId === 'pl_play_this') {
                        collector.stop('play');
                        await i.deferUpdate().catch(() => {});
                        const memberVoice = message.member?.voice?.channel;
                        if (!memberVoice) {
                            return message.channel.send({
                                embeds: [build.warn(message.author, 'you must be in a voice channel to stream a playlist.')]
                            });
                        }
                        const music = message.client.music;
                        const queue = music.getOrCreateQueue(message.guild, memberVoice, message.channel);
                        const isFirst = !queue.current;
                        for (const t of tracks) {
                            queue.enqueue({
                                title: t.title,
                                url: t.url,
                                streamUrl: null,
                                duration: t.duration || 0,
                                durationFormatted: formatDuration(t.duration),
                                author: t.author || 'unknown',
                                thumbnail: null,
                                requester: message.author
                            });
                        }
                        if (isFirst) await queue.play();
                        return message.channel.send({
                            embeds: [build.approved(message.author, `queued **${tracks.length}** track(s) from **${playlist.name}** into active queue.`)]
                        });
                    }

                    if (i.customId === 'pl_prev' && currentPage > 1) {
                        currentPage--;
                    } else if (i.customId === 'pl_next' && currentPage < totalPages) {
                        currentPage++;
                    }

                    const updatedPayload = buildPagePayload(currentPage);
                    await i.update(updatedPayload).catch(() => {});
                });

                collector.on('end', async (_, reason) => {
                    if (reason === 'play' || reason === 'deleted') return;
                    // Disable pagination buttons on timeout
                    const expiredPayload = buildPagePayload(currentPage);
                    if (expiredPayload.components?.[0]?.components) {
                        for (const row of expiredPayload.components[0].components) {
                            if (row.components) {
                                for (const comp of row.components) {
                                    if (typeof comp.setDisabled === 'function') comp.setDisabled(true);
                                }
                            }
                        }
                    }
                    await replyMsg.edit(expiredPayload).catch(() => {});
                });
            }
            return;
        }

        // 7. Subcommand: list (or default overview dashboard)
        const userPlaylists = await db.getUserPlaylists(message.author.id);
        const totalSavedTracks = userPlaylists.reduce((acc, p) => acc + (p.track_count || 0), 0);

        let listText = '';
        if (userPlaylists.length === 0) {
            listText = `> *no saved playlists yet.*\n-# run \`,playlist create <name>\` to start building your library.`;
        } else {
            userPlaylists.slice(0, 10).forEach((p, idx) => {
                const dateRelative = `<t:${Math.floor(p.created_at / 1000)}:R>`;
                listText += `-# \`${idx + 1}.\` **${p.name}** · \`${p.track_count || 0}\` track(s) · created ${dateRelative}\n`;
            });
            if (userPlaylists.length > 10) {
                listText += `-# *...and ${userPlaylists.length - 10} more playlists.*`;
            }
        }

        const dashboardDesc = `### [playlist studio](https://discord.gg/hCQhTmPf2G)\n` +
            `-# save custom playlists, bookmark current songs, and stream anytime.\n\n` +
            `-# **library stats** · \`${userPlaylists.length}/25\` playlists · \`${totalSavedTracks}\` total songs\n` +
            `-# **quickstart commands**:\n` +
            `-# \`,playlist create <name>\` — create a new playlist\n` +
            `-# \`,playlist add <name> [query]\` — add song (or currently playing)\n` +
            `-# \`,playlist play <name>\` — load and stream all tracks\n` +
            `-# \`,playlist view <name>\` — inspect track listing\n` +
            `-# \`,playlist remove <name> <#>\` — delete a track\n` +
            `-# \`,playlist delete <name>\` — delete a playlist\n\n` +
            listText;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('support')
                .setURL(config.supportInvite || 'https://discord.gg/hCQhTmPf2G'),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('invite harm')
                .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId || '1490995846626545674'}&permissions=${config.invitePermissions || '1376435694838'}&scope=bot%20applications.commands`)
        );

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(0x0A0A0C);

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(dashboardDesc)
            );

            const avatar = message.author.displayAvatarURL({ dynamic: true, size: 256 });
            if (avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar));
            container.addSectionComponents(section);

            if (bannerAttachment) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://music.png'))
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addActionRowComponents(row);

            return await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors?.c || '#0A0A0C')
                .setDescription(dashboardDesc);
            if (bannerAttachment) fallbackEmbed.setImage('attachment://music.png');
            return await message.reply({
                embeds: [fallbackEmbed],
                components: [row],
                files
            }).catch(() => {});
        }
    }
}

module.exports = PlaylistCommand;
