const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

function getFilterSummary(filters) {
    const active = [];
    if (filters.bassboost) active.push(`bass: ${filters.bassboost}`);
    if (filters.nightcore) active.push('nightcore');
    if (filters.vaporwave) active.push('slowed');
    if (filters.eightD) active.push('8d audio');
    if (filters.karaoke) active.push('vocal cut');
    return active.length > 0 ? active.join(' · ') : 'clean (lossless defaults)';
}

function buildStudioContainer(state, disabled = false) {
    const container = new ContainerBuilder();
    container.setAccentColor(typeof config.colors.c === 'string' ? parseInt(config.colors.c.replace('#', ''), 16) : (config.colors.c || 0x0A0A0C));
    const e = config.emojis || {};

    const discEmoji = e.harm_disc || '<:harm_disc:1561738406403244033>';
    const voiceEmoji = e.harm_voice || '<:harm_voice:1561780897198514206>';
    const tempoEmoji = e.streak || '<:streak:1558818734582399007>';
    const loopEmoji = e.harm_loop || '<:harm_loop:1561738397318381678>';
    const chatEmoji = e.harm_chat || '<:harm_chat:1561780895038439606>';

    // 1. Header Section
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### [audio filter studio](https://discord.gg/hCQhTmPf2G)\n` +
                    `-# real-time digital signal processing & acoustics. click options to customize.`
                )
            )
    );

    // 2. Audio Preset
    const presetLabel = state.preset ? state.preset : 'custom / clean';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${discEmoji} **audio preset**\n` +
                    `-# active: \`${presetLabel}\` · click cycle to load ready configurations.`
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fx_cycle_preset')
                    .setLabel('cycle preset')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 3. Bass Boost
    const bassLabel = state.bassboost ? `${state.bassboost} (+${state.bassboost === 'soft' ? '6' : state.bassboost === 'medium' ? '11' : '16'}dB)` : 'off';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${voiceEmoji} **bass boost**\n` +
                    `-# level: \`${bassLabel}\` · deep sub-bass equalization.`
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fx_cycle_bass')
                    .setLabel('cycle bass')
                    .setStyle(state.bassboost ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 4. Tempo & Pitch
    let tempoLabel = 'standard 1.0x';
    if (state.nightcore) tempoLabel = 'nightcore (1.25x speed · elevated pitch)';
    else if (state.vaporwave) tempoLabel = 'slowed (0.82x speed · lowered pitch)';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${tempoEmoji} **tempo & pitch**\n` +
                    `-# speed: \`${tempoLabel}\``
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fx_cycle_tempo')
                    .setLabel('cycle tempo')
                    .setStyle((state.nightcore || state.vaporwave) ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 5. Spatial 8D Audio
    const eightDLabel = state.eightD ? 'enabled (360° rotating stereo oscillation)' : 'disabled (standard stereo)';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${loopEmoji} **spatial 8d audio**\n` +
                    `-# spatializer: \`${eightDLabel}\``
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fx_toggle_8d')
                    .setLabel(state.eightD ? 'disable 8d' : 'enable 8d')
                    .setStyle(state.eightD ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // 6. Vocal Filter / Karaoke
    const vocalLabel = state.karaoke ? 'vocal cut (center-channel phased instrumental)' : 'full vocals';
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${chatEmoji} **vocal filter**\n` +
                    `-# mode: \`${vocalLabel}\``
                )
            )
            .setButtonAccessory(
                new ButtonBuilder()
                    .setCustomId('fx_toggle_karaoke')
                    .setLabel(state.karaoke ? 'restore vocals' : 'cut vocals')
                    .setStyle(state.karaoke ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(disabled)
            )
    );

    // Bottom banner
    const bannerAtt = build.getAssetAttachment('music.png');
    if (bannerAtt) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://music.png')
            )
        );
    }

    // Separator
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    // Bottom Action Row
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fx_apply_now')
            .setLabel('apply & hot-swap')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('fx_reset_all')
            .setLabel('reset all')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('fx_close')
            .setLabel('close')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );
    container.addActionRowComponents(row);

    return container;
}

function buildFallbackEmbed(state) {
    const desc = `### [audio filter studio](https://discord.gg/hCQhTmPf2G)\n` +
        `-# active: \`${getFilterSummary(state)}\`\n\n` +
        `-# **preset** · \`${state.preset || 'custom'}\`\n` +
        `-# **bass boost** · \`${state.bassboost || 'off'}\`\n` +
        `-# **speed** · \`${state.nightcore ? 'nightcore' : state.vaporwave ? 'slowed' : '1.0x'}\`\n` +
        `-# **spatial 8d** · \`${state.eightD ? 'enabled' : 'disabled'}\`\n` +
        `-# **vocal cut** · \`${state.karaoke ? 'enabled' : 'disabled'}\`\n\n` +
        `-# use the controls below to configure your voice DSP stream.`;

    const embed = new EmbedBuilder()
        .setColor(config.colors?.c || '#0A0A0C')
        .setDescription(desc);

    const bannerAtt = build.getAssetAttachment('music.png');
    if (bannerAtt) embed.setImage('attachment://music.png');
    return embed;
}

class FilterCommand {
    constructor() {
        this.name = 'filter';
        this.aliases = ['filters', 'dsp', 'audiostudio'];
        this.description = 'launch the interactive visual studio to customize voice audio filters.';
        this.syntax = ',filter';
        this.example = ',filter';
        this.category = 'music';
        this.cooldown = 2;
    }

    async execute(message) {
        const music = message.client.music;
        const queue = music?.getQueue(message.guild?.id);

        if (!queue) {
            return message.reply({
                embeds: [build.warn(message.author, 'there is no active music session. start playing with `,play <query>`.')]
            });
        }

        const memberVoice = message.member?.voice?.channel;
        if (!memberVoice) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in a voice channel to open the audio filter studio.')]
            });
        }

        if (queue.voiceChannel && queue.voiceChannel.id !== memberVoice.id) {
            return message.reply({
                embeds: [build.warn(message.author, 'you must be in the same voice channel as harm.')]
            });
        }

        // Interactive Studio Hub State
        const state = {
            preset: null,
            bassboost: queue.filters.bassboost || null,
            nightcore: Boolean(queue.filters.nightcore),
            vaporwave: Boolean(queue.filters.vaporwave),
            eightD: Boolean(queue.filters.eightD),
            karaoke: Boolean(queue.filters.karaoke)
        };

        const bannerAtt = build.getAssetAttachment('music.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const renderPayload = (disabled = false) => {
            try {
                const container = buildStudioContainer(state, disabled);
                return {
                    components: [container],
                    files,
                    flags: MessageFlags.IsComponentsV2
                };
            } catch (_) {
                const embed = buildFallbackEmbed(state);
                return {
                    embeds: [embed],
                    files
                };
            }
        };

        const initialPayload = renderPayload();
        const replyMsg = await message.reply(initialPayload).catch(() => null);
        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 90_000 // 90s active studio session
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    embeds: [build.deny(i.user, 'only the command invoker can control this audio studio.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            // A. Cycle Presets
            if (i.customId === 'fx_cycle_preset') {
                const presets = ['clean', 'bassboosted', 'nightcore', 'slowed', '8d immersive', 'karaoke'];
                const currentIdx = presets.indexOf(state.preset || 'clean');
                const nextPreset = presets[(currentIdx + 1) % presets.length];
                state.preset = nextPreset;

                if (nextPreset === 'clean') {
                    state.bassboost = null;
                    state.nightcore = false;
                    state.vaporwave = false;
                    state.eightD = false;
                    state.karaoke = false;
                } else if (nextPreset === 'bassboosted') {
                    state.bassboost = 'medium';
                    state.nightcore = false;
                    state.vaporwave = false;
                } else if (nextPreset === 'nightcore') {
                    state.nightcore = true;
                    state.vaporwave = false;
                    state.bassboost = 'soft';
                } else if (nextPreset === 'slowed') {
                    state.vaporwave = true;
                    state.nightcore = false;
                    state.bassboost = 'soft';
                } else if (nextPreset === '8d immersive') {
                    state.eightD = true;
                    state.bassboost = 'soft';
                } else if (nextPreset === 'karaoke') {
                    state.karaoke = true;
                }
            }

            // B. Cycle Bass Level: null -> soft -> medium -> hard -> null
            else if (i.customId === 'fx_cycle_bass') {
                state.preset = 'custom';
                if (!state.bassboost) state.bassboost = 'soft';
                else if (state.bassboost === 'soft') state.bassboost = 'medium';
                else if (state.bassboost === 'medium') state.bassboost = 'hard';
                else state.bassboost = null;
            }

            // C. Cycle Tempo: standard -> nightcore -> slowed -> standard
            else if (i.customId === 'fx_cycle_tempo') {
                state.preset = 'custom';
                if (!state.nightcore && !state.vaporwave) {
                    state.nightcore = true;
                    state.vaporwave = false;
                } else if (state.nightcore) {
                    state.nightcore = false;
                    state.vaporwave = true;
                } else {
                    state.nightcore = false;
                    state.vaporwave = false;
                }
            }

            // D. Toggle 8D
            else if (i.customId === 'fx_toggle_8d') {
                state.preset = 'custom';
                state.eightD = !state.eightD;
            }

            // E. Toggle Karaoke
            else if (i.customId === 'fx_toggle_karaoke') {
                state.preset = 'custom';
                state.karaoke = !state.karaoke;
            }

            // F. Apply & Hot-swap
            else if (i.customId === 'fx_apply_now') {
                await queue.applyFilters({
                    bassboost: state.bassboost,
                    nightcore: state.nightcore,
                    vaporwave: state.vaporwave,
                    eightD: state.eightD,
                    karaoke: state.karaoke
                });
                await i.reply({
                    embeds: [build.approved(i.user, `applied filters live: \`${getFilterSummary(state)}\``)],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
                const updatedPayload = renderPayload(false);
                return i.message.edit(updatedPayload).catch(() => {});
            }

            // G. Reset All
            else if (i.customId === 'fx_reset_all') {
                state.preset = 'clean';
                state.bassboost = null;
                state.nightcore = false;
                state.vaporwave = false;
                state.eightD = false;
                state.karaoke = false;
                await queue.resetFilters();
                await i.reply({
                    embeds: [build.approved(i.user, 'reset all audio filters to clean playback.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
                const updatedPayload = renderPayload(false);
                return i.message.edit(updatedPayload).catch(() => {});
            }

            // H. Close
            else if (i.customId === 'fx_close') {
                collector.stop('user_closed');
                return i.deferUpdate().catch(() => {});
            }

            const updatedPayload = renderPayload(false);
            await i.update(updatedPayload).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'user_closed') {
                await replyMsg.delete().catch(() => {});
                return;
            }
            const disabledPayload = renderPayload(true);
            await replyMsg.edit(disabledPayload).catch(() => {});
        });
    }
}

module.exports = FilterCommand;
