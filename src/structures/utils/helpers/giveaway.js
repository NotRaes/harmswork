const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder
} = require('discord.js');
const config = require('../../../config.js');

function parseDuration(input) {
    if (!input) return null;
    let totalSeconds = 0;
    const regex = /(\d+)\s*(mo|months?|w|weeks?|d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)/gi;
    let match;
    let found = false;
    while ((match = regex.exec(input)) !== null) {
        found = true;
        const val = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        if (unit.startsWith('mo')) totalSeconds += val * 2592000;
        else if (unit.startsWith('w')) totalSeconds += val * 604800;
        else if (unit.startsWith('d')) totalSeconds += val * 86400;
        else if (unit.startsWith('h')) totalSeconds += val * 3600;
        else if (unit.startsWith('m')) totalSeconds += val * 60;
        else if (unit.startsWith('s')) totalSeconds += val;
    }
    if (!found) {
        const num = parseInt(input, 10);
        if (!isNaN(num) && num > 0) totalSeconds = num * 60;
    }
    return totalSeconds > 0 ? totalSeconds : null;
}

class GiveawayHelper {
    static getEmojis() {
        return {
            gift: config.emojis?.gw_gift || config.emojis?.gift || '<:gift:1558198880296898630>',
            crown: config.emojis?.gw_crown || config.emojis?.crown || '<:gw_crown:1558198883883028621>',
            entries: config.emojis?.gw_entries || config.emojis?.entries || '<:entries:1558198887599050882>',
            trophy: config.emojis?.gw_trophy || config.emojis?.trophy || '<:trophy:1558198891248095366>',
            cheers: config.emojis?.gw_cheers || config.emojis?.cheers || '<:cheers:1558198895190741013>'
        };
    }

    static buildPayload(gw, entriesCount = 0, ended = false) {
        const emojis = GiveawayHelper.getEmojis();
        const endTimestamp = Math.floor(gw.ends_at / 1000);

        let timeLine;
        if (gw.cancelled) {
            timeLine = 'Cancelled by host · no winners drawn';
        } else if (ended || gw.ended) {
            timeLine = `Ended <t:${endTimestamp}:R> · <t:${endTimestamp}:f>`;
        } else {
            timeLine = `Ends <t:${endTimestamp}:R> · <t:${endTimestamp}:f>`;
        }

        let reqText = '';
        if (gw.requirement) {
            try {
                const reqObj = typeof gw.requirement === 'string' ? JSON.parse(gw.requirement) : gw.requirement;
                const lockEmoji = config.emojis?.harm_lock || config.emojis?.lockvc || '<:lockvc:1558818774772089003>';
                if (reqObj?.type === 'role') {
                    reqText = `\n${lockEmoji} **requirement:** <@&${reqObj.value}>`;
                } else if (reqObj?.type === 'boost') {
                    reqText = `\n${lockEmoji} **requirement:** server booster`;
                } else if (reqObj?.type === 'age') {
                    reqText = `\n${lockEmoji} **requirement:** account age ${reqObj.value}d+`;
                }
            } catch (_) {}
        }

        const bodyContent = `${timeLine}\n\n` +
            `${emojis.crown} **Hosted by:** <@${gw.host_id}>\n` +
            `${emojis.entries} **Entries:** ${entriesCount}\n` +
            `${emojis.trophy} **Winners:** ${gw.winners_count || 1}${reqText}`;

        const enterButton = new ButtonBuilder()
            .setCustomId(`gw_enter_${gw.id}`)
            .setLabel(`Enter (${entriesCount})`)
            .setEmoji('1558198880296898630')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(Boolean(ended || gw.ended || gw.cancelled));

        const viewButton = new ButtonBuilder()
            .setCustomId(`gw_view_${gw.id}`)
            .setLabel('View entries')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(enterButton, viewButton);

        const defaultColor = config.colors?.c || '#0A0A0C';
        const defaultAccent = typeof defaultColor === 'string' ? parseInt(defaultColor.replace('#', ''), 16) : defaultColor;

        const container = new ContainerBuilder()
            .setAccentColor(defaultAccent)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${emojis.gift} ${gw.prize}`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(bodyContent)
            );

        if (gw.image_url) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(gw.image_url)
                )
            );
        }

        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addActionRowComponents(row);

        const fallbackEmbed = new EmbedBuilder()
            .setColor(defaultColor)
            .setTitle(`${gw.prize}`)
            .setDescription(bodyContent);

        if (gw.image_url) {
            fallbackEmbed.setImage(gw.image_url);
        }

        return {
            componentsV2: {
                components: [container],
                flags: MessageFlags.IsComponentsV2
            },
            embedFallback: {
                embeds: [fallbackEmbed],
                components: [row]
            }
        };
    }

    static async endGiveaway(client, gw) {
        if (!client.db || !gw || gw.ended) return null;

        const entries = await client.db.getGiveawayEntries(gw.id);
        const winnersCount = Math.max(1, gw.winners_count || 1);
        const winners = [];

        if (entries.length > 0) {
            const shuffled = [...entries].sort(() => 0.5 - Math.random());
            for (let i = 0; i < Math.min(winnersCount, shuffled.length); i++) {
                winners.push(shuffled[i]);
            }
        }

        await client.db.endGiveaway(gw.id, winners);
        gw.ended = 1;

        // Fetch channel and message to edit and announce
        try {
            const channel = await client.channels.fetch(gw.channel_id).catch(() => null);
            if (!channel) return winners;

            const message = await channel.messages.fetch(gw.message_id).catch(() => null);
            const emojis = GiveawayHelper.getEmojis();

            if (message) {
                const payload = GiveawayHelper.buildPayload(gw, entries.length, true);
                await message.edit(payload.embedFallback).catch(() => null);

                // Announce winner
                let winText;
                if (winners.length === 1) {
                    winText = `${emojis.cheers} <@${winners[0]}> won **${gw.prize}**!`;
                } else if (winners.length > 1) {
                    const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
                    winText = `${emojis.cheers} ${winnerMentions} won **${gw.prize}**!`;
                } else {
                    winText = `${emojis.cheers} no entries were submitted for **${gw.prize}**!`;
                }

                const winContainer = new ContainerBuilder()
                    .setAccentColor(typeof config.colors?.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors?.c || 0x0A0A0C))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(winText)
                    );

                try {
                    await message.reply({
                        components: [winContainer],
                        flags: MessageFlags.IsComponentsV2
                    });
                } catch (_) {
                    const winEmbed = new EmbedBuilder()
                        .setColor(config.colors?.c || 0x0A0A0C)
                        .setDescription(winText);
                    await message.reply({ embeds: [winEmbed] }).catch(() => null);
                }
            }
        } catch (err) {
            console.error('[GiveawayHelper.endGiveaway]', err);
        }

        return winners;
    }

    static async cancelGiveaway(client, gw) {
        if (!client.db || !gw) return false;
        await client.db.cancelGiveaway(gw.id);
        gw.ended = 1;
        gw.cancelled = 1;

        try {
            const channel = await client.channels.fetch(gw.channel_id).catch(() => null);
            if (channel) {
                const message = await channel.messages.fetch(gw.message_id).catch(() => null);
                if (message) {
                    const entriesCount = await client.db.getGiveawayEntriesCount(gw.id);
                    const payload = GiveawayHelper.buildPayload(gw, entriesCount, true);
                    await message.edit(payload.embedFallback).catch(() => null);
                }
            }
        } catch (err) {
            console.error('[GiveawayHelper.cancelGiveaway]', err);
        }
        return true;
    }

    static async rerollGiveaway(client, gw) {
        if (!client.db || !gw) return null;
        const entries = await client.db.getGiveawayEntries(gw.id);
        if (!entries.length) return [];

        const winnersCount = Math.max(1, gw.winners_count || 1);
        const shuffled = [...entries].sort(() => 0.5 - Math.random());
        const newWinners = shuffled.slice(0, Math.min(winnersCount, shuffled.length));

        await client.db.endGiveaway(gw.id, newWinners);

        try {
            const channel = await client.channels.fetch(gw.channel_id).catch(() => null);
            if (channel) {
                const message = await channel.messages.fetch(gw.message_id).catch(() => null);
                const emojis = GiveawayHelper.getEmojis();
                const winnerMentions = newWinners.map(w => `<@${w}>`).join(', ');
                const winText = `${emojis.cheers} rerolled: ${winnerMentions} won **${gw.prize}**!`;

                const winContainer = new ContainerBuilder()
                    .setAccentColor(typeof config.colors?.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors?.c || 0x0A0A0C))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(winText)
                    );

                if (message) {
                    try {
                        await message.reply({ components: [winContainer], flags: MessageFlags.IsComponentsV2 });
                    } catch (_) {
                        await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors?.c || 0x0A0A0C).setDescription(winText)] });
                    }
                } else {
                    await channel.send({ components: [winContainer], flags: MessageFlags.IsComponentsV2 });
                }
            }
        } catch (err) {
            console.error('[GiveawayHelper.rerollGiveaway]', err);
        }

        return newWinners;
    }

    static startWorker(client) {
        if (client._giveawayWorkerInterval) return;

        client._giveawayWorkerInterval = setInterval(async () => {
            if (!client.db) return;
            try {
                const active = await client.db.getActiveGiveaways();
                const now = Date.now();
                for (const gw of active) {
                    if (gw.ends_at <= now) {
                        await GiveawayHelper.endGiveaway(client, gw);
                    }
                }
            } catch (err) {
                console.error('[giveawayWorker]', err.message);
            }
        }, 5000);
    }

    static async handleInteraction(interaction) {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;
        if (!customId.startsWith('gw_enter_') && !customId.startsWith('gw_view_')) return;

        const db = interaction.client.db;
        if (!db) {
            return interaction.reply({ content: 'database subsystem offline.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        let gw = null;
        if (interaction.message?.id) {
            gw = await db.getGiveawayByMessageId(interaction.message.id);
        }

        if (!gw) {
            const rawId = customId.replace(/^(gw_enter_|gw_view_)/, '').split('_')[0];
            const giveawayId = parseInt(rawId, 10);
            if (giveawayId && giveawayId > 0) {
                gw = await db.getGiveawayById(giveawayId);
            }
        }

        if (!gw) {
            return interaction.reply({ content: 'this giveaway no longer exists.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (customId.startsWith('gw_enter_')) {
            if (gw.ended || gw.cancelled) {
                return interaction.reply({ content: 'this giveaway has concluded.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            // Check requirement if set
            if (gw.requirement) {
                try {
                    const reqObj = typeof gw.requirement === 'string' ? JSON.parse(gw.requirement) : gw.requirement;
                    if (reqObj.type === 'role') {
                        const member = interaction.member || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                        if (!member || !member.roles.cache.has(reqObj.value)) {
                            return interaction.reply({
                                content: `you need the <@&${reqObj.value}> role to enter this giveaway.`,
                                flags: MessageFlags.Ephemeral
                            }).catch(() => {});
                        }
                    } else if (reqObj.type === 'boost') {
                        const member = interaction.member || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
                        if (!member || !member.premiumSince) {
                            return interaction.reply({
                                content: 'you must be a server booster to enter this giveaway.',
                                flags: MessageFlags.Ephemeral
                            }).catch(() => {});
                        }
                    } else if (reqObj.type === 'age') {
                        const minDays = parseInt(reqObj.value, 10) || 1;
                        const ageMs = Date.now() - interaction.user.createdTimestamp;
                        const ageDays = ageMs / (1000 * 60 * 60 * 24);
                        if (ageDays < minDays) {
                            return interaction.reply({
                                content: `your account must be at least ${minDays} days old to enter this giveaway.`,
                                flags: MessageFlags.Ephemeral
                            }).catch(() => {});
                        }
                    }
                } catch (_) {}
            }

            const hasEntered = await db.hasUserEnteredGiveaway(gw.id, interaction.user.id);
            let responseText = '';

            if (hasEntered) {
                await db.removeGiveawayEntry(gw.id, interaction.user.id);
                responseText = `you left the giveaway for **${gw.prize}**.`;
            } else {
                await db.addGiveawayEntry(gw.id, interaction.user.id);
                responseText = `you entered the giveaway for **${gw.prize}**!`;
            }

            const newCount = await db.getGiveawayEntriesCount(gw.id);
            const payload = GiveawayHelper.buildPayload(gw, newCount, false);

            await interaction.update(payload.embedFallback).catch(() => {});

            return interaction.followUp({ content: responseText, flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (customId.startsWith('gw_view_') || customId.startsWith('gw_ent_')) {
            let page = 0;
            if (customId.startsWith('gw_ent_')) {
                const parts = customId.split('_');
                const action = parts[2];
                const curPage = parseInt(parts[4] || '0', 10);
                const totalEntries = await db.getGiveawayEntriesCount(gw.id);
                const totalPages = Math.max(1, Math.ceil(totalEntries / 10));

                if (action === 'first') page = 0;
                else if (action === 'prev') page = Math.max(0, curPage - 1);
                else if (action === 'next') page = Math.min(totalPages - 1, curPage + 1);
                else if (action === 'last') page = totalPages - 1;
            }

            const entries = db.getGiveawayDetailedEntries
                ? await db.getGiveawayDetailedEntries(gw.id)
                : await db.getGiveawayEntries(gw.id);

            const payload = GiveawayHelper.buildEntriesPayload(gw, entries, page, interaction.guild);

            if (customId.startsWith('gw_ent_')) {
                return await interaction.update({
                    embeds: payload.embeds,
                    components: payload.components
                }).catch(() => {});
            } else {
                return await interaction.reply({
                    embeds: payload.embeds,
                    components: payload.components,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }

    static parseStartArgs(args) {
        if (!args || !args.length) return null;
        let list = [...args];
        let winnersCount = 1;
        let durationSec = null;

        // 1. Look for winner format: 2w, 3w, etc.
        for (let i = 0; i < list.length; i++) {
            const m = list[i].match(/^(\d+)w$/i);
            if (m) {
                const count = parseInt(m[1], 10);
                if (count > 0 && count <= 50) {
                    winnersCount = count;
                    list.splice(i, 1);
                    break;
                }
            }
        }

        // 2. Look for duration token anywhere in list
        const durIndex = list.findIndex(tok => GiveawayHelper.parseDuration(tok) !== null);
        if (durIndex !== -1) {
            durationSec = GiveawayHelper.parseDuration(list[durIndex]);
            list.splice(durIndex, 1);
        }

        // 3. Look for isolated numeric winner count
        if (winnersCount === 1 && list.length > 1) {
            if (/^\d+$/.test(list[0])) {
                const count = parseInt(list[0], 10);
                if (count > 0 && count <= 50) {
                    winnersCount = count;
                    list.shift();
                }
            } else if (/^\d+$/.test(list[list.length - 1])) {
                const count = parseInt(list[list.length - 1], 10);
                if (count > 0 && count <= 50) {
                    winnersCount = count;
                    list.pop();
                }
            }
        }

        const prize = list.join(' ').trim() || 'gift';
        return { durationSec, winnersCount, prize };
    }

    static buildEntriesPayload(gw, entries = [], page = 0, guild = null) {
        const defaultColor = config.colors?.c || '#0A0A0C';

        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
        const safePage = Math.max(0, Math.min(page, totalPages - 1));
        const start = safePage * pageSize;
        const currentEntries = entries.slice(start, start + pageSize);

        const prize = (gw.prize || 'gift').toLowerCase();
        const host = gw.host_id ? `<@${gw.host_id}>` : '*unknown*';
        const winners = gw.winners_count || 1;

        let lines;
        if (!entries.length) {
            lines = '*no entries recorded yet.*';
        } else {
            lines = currentEntries.map((item, idx) => {
                const rank = start + idx + 1;
                const userId = typeof item === 'object' ? item.user_id : item;
                const enteredSec = typeof item === 'object' && item.entered_at
                    ? (item.entered_at > 10_000_000_000 ? Math.floor(item.entered_at / 1000) : item.entered_at)
                    : null;
                const enteredAt = enteredSec ? ` · <t:${enteredSec}:R>` : '';
                return `\`${rank}.\` <@${userId}>${enteredAt}`;
            }).join('\n');
        }

        const guildName = guild?.name ? guild.name.toLowerCase() : 'harm';
        const guildIcon = guild?.iconURL?.({ size: 1024, dynamic: true });

        const embed = new EmbedBuilder()
            .setColor(defaultColor)
            .setAuthor({
                name: `${guildName} • giveaway entries`,
                iconURL: guildIcon || undefined
            })
            .setDescription(
                `### [${prize}](${config.supportInvite || 'https://discord.gg/hCQhTmPf2G'})\n` +
                `-# **hosted by** ${host} · **winners:** \`${winners}\` · **total entries:** \`${entries.length}\`\n\n` +
                lines
            );

        if (guildIcon) {
            embed.setThumbnail(guildIcon);
        }

        if (totalPages > 1) {
            embed.setFooter({
                text: `page ${safePage + 1} of ${totalPages} · ${entries.length} participant${entries.length === 1 ? '' : 's'}`
            });
        } else if (entries.length > 0) {
            embed.setFooter({
                text: `${entries.length} participant${entries.length === 1 ? '' : 's'}`
            });
        }

        const rows = [];
        if (totalPages > 1) {
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`gw_ent_first_${gw.id}_${safePage}`)
                    .setEmoji(config.emojis?.first || config.emojis?.harm_first || '<:harm_first:1560309039592636657>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === 0),
                new ButtonBuilder()
                    .setCustomId(`gw_ent_prev_${gw.id}_${safePage}`)
                    .setEmoji(config.emojis?.al || config.emojis?.harm_left || '<:harm_left:1560309043657052240>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === 0),
                new ButtonBuilder()
                    .setCustomId(`gw_ent_page_${gw.id}_${safePage}`)
                    .setLabel(`${safePage + 1} / ${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`gw_ent_next_${gw.id}_${safePage}`)
                    .setEmoji(config.emojis?.ar || config.emojis?.harm_right || '<:harm_right:1560309045720649819>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId(`gw_ent_last_${gw.id}_${safePage}`)
                    .setEmoji(config.emojis?.last || config.emojis?.harm_last || '<:harm_last:1560309041618755585>')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages - 1)
            );
            rows.push(navRow);
        }

        const payload = {
            embeds: [embed],
            components: rows
        };
        payload.embedFallback = payload;
        payload.componentsV2 = payload;

        return payload;
    }
}

GiveawayHelper.parseDuration = parseDuration;

module.exports = GiveawayHelper;
