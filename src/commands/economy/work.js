const {
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder
} = require('discord.js');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

const COOLDOWN_SECONDS = 20 * 60; // 20 minutes
const EXP_THRESHOLDS = [0, 100, 250, 500, 1000];
const LEVEL_MULTIPLIERS = [1.00, 1.25, 1.55, 1.90, 2.30];

const CAREERS = {
    hacker: {
        id: 'hacker',
        title: 'cyber operative',
        emoji: '<:channels:1558818707281547304>',
        description: 'infiltrate corporate networks and claim zero-day bounties.',
        baseMin: 800,
        baseMax: 1400,
        ranks: ['script novice', 'penetration tester', 'zero-day researcher', 'cyber operative', 'ghost in the shell'],
        scenarios: [
            'breached an offshore mainframe and extracted an encrypted seed',
            'patched a critical zero-day exploit for a decentralized protocol',
            'bypassed a biometric firewall with a custom hardware injector',
            'identified a covert backdoor and published the telemetry',
            'defended an international cloud cluster against a multi-terabit ddos'
        ]
    },
    engineer: {
        id: 'engineer',
        title: 'systems architect',
        emoji: '<:boost:1558818693629214760>',
        description: 'architect microservices, optimize runtime performance, and deploy clusters.',
        baseMin: 750,
        baseMax: 1350,
        ranks: ['junior scripter', 'backend dev', 'systems architect', 'principal engineer', 'chief architect'],
        scenarios: [
            'refactored a core database engine, cutting p99 response latency by 85%',
            'deployed a fault-tolerant distributed consensus engine with zero downtime',
            'trained a neural weights model that cut inference memory in half',
            'squashed an elusive memory leak that had troubled production servers',
            'architected an event-driven cluster handling 200,000 events/second'
        ]
    },
    trader: {
        id: 'trader',
        title: 'venture quant',
        emoji: '<:coin:1558818714055479421>',
        description: 'execute algorithmic arbitrage and balance liquidity pools.',
        baseMin: 900,
        baseMax: 1600,
        ranks: ['floor clerk', 'quant analyst', 'derivatives trader', 'portfolio manager', 'venture capitalist'],
        scenarios: [
            'captured an algorithmic spread discrepancy across twin exchanges for clean alpha',
            'hedged a macro currency crash with delta-neutral options positions',
            'closed an early-stage private equity syndicate ahead of target valuation',
            'orchestrated an otc block settlement for an institutional fund',
            'liquidated a predatory short squeeze, securing historic intraday yield'
        ]
    },
    producer: {
        id: 'producer',
        title: 'sound architect',
        emoji: '<:harm_disc:1561738406403244033>',
        description: 'master analog synths, engineer vocal stems, and drop chart-topping tracks.',
        baseMin: 700,
        baseMax: 1300,
        ranks: ['bedroom beatmaker', 'audio engineer', 'session artist', 'platinum producer', 'label mogul'],
        scenarios: [
            'produced a dark ambient trap anthem that hit one million streaming plays',
            'mixed and mastered a vinyl release on vintage tube consoles',
            'crafted an iconic bassline that ignited dancefloors across underground venues',
            'recorded raw analog synth stems with rare vintage modular racks',
            'signed a breakthrough underground duo to an independent recording label'
        ]
    },
    racer: {
        id: 'racer',
        title: 'midnight drifter',
        emoji: '<:streak:1558818734582399007>',
        description: 'pilot twin-turbo builds through highway passes and neon-lit circuits.',
        baseMin: 750,
        baseMax: 1450,
        ranks: ['street rookie', 'circuit racer', 'touge specialist', 'drift king', 'apex legend'],
        scenarios: [
            'outran modified imports across a rain-slicked highway pass at 3 am',
            'tuned a sequential twin-turbo setup, extracting 900 wheel horsepower on pump gas',
            'dominated the midnight underground drift trials with a flawless tandem lead',
            'delivered a high-priority contraband crate across borders in record time',
            'won an unsanctioned pink-slip grudge race against a heavily favored rival'
        ]
    },
    mercenary: {
        id: 'mercenary',
        title: 'recon operative',
        emoji: '<:gw_crown:1558198883883028621>',
        description: 'handle high-stakes escort missions, asset extractions, and VIP defense.',
        baseMin: 850,
        baseMax: 1500,
        ranks: ['hired guard', 'field scout', 'recon operative', 'black-ops contractor', 'warlord'],
        scenarios: [
            'secured a fortified transport convoy carrying private bullion reserves',
            'extracted a high-value whistleblower from a hostile border crossing',
            'neutralized an extortionist ring targeting local small business owners',
            'retrieved compromised cryptographic hardware from a decommissioned research outpost',
            'coordinated rooftop overwatch security for an international summit'
        ]
    },
    casino: {
        id: 'casino',
        title: 'high roller host',
        emoji: '<a:card:1555845967381528586>',
        description: 'manage VIP gaming suites, shuffle high-limit decks, and supervise private tables.',
        baseMin: 800,
        baseMax: 1550,
        ranks: ['chip runner', 'blackjack dealer', 'floor supervisor', 'high roller host', 'casino director'],
        scenarios: [
            'managed a high-stakes baccarat session with ten-thousand-dollar minimum hands',
            'spotted an illegal counting syndicate at the private blackjack tables',
            'hosted an exclusive penthouse poker invitational for high-roller patrons',
            'balanced a multi-million-dollar casino vault audit with zero discrepancy',
            'negotiated a historic rebate settlement for an overseas whale investor'
        ]
    },
    surgeon: {
        id: 'surgeon',
        title: 'neuro specialist',
        emoji: '<:harm_heart:1559895595848695960>',
        description: 'perform complex reconstructive procedures and trauma interventions.',
        baseMin: 1000,
        baseMax: 1800,
        ranks: ['medical intern', 'resident surgeon', 'attending specialist', 'neuro specialist', 'chief of medicine'],
        scenarios: [
            'successfully completed a grueling ten-hour micro-vascular brain bypass',
            'stabilized a critical trauma casualty following a multi-vehicle highway collision',
            'pioneered a minimally-invasive robotic surgical technique with zero complications',
            'implanted a prototype neural sensory bypass that restored patient mobility',
            'authored a landmark surgical case study published in international medical journals'
        ]
    },
    pilot: {
        id: 'pilot',
        title: 'aerospace aviator',
        emoji: '<:harm_mail:1560309035327291547>',
        description: 'navigate commercial jets and chartered supersonic transports through any weather.',
        baseMin: 950,
        baseMax: 1700,
        ranks: ['first officer', 'charter captain', 'heavy jet pilot', 'aerospace aviator', 'sky commander'],
        scenarios: [
            'landed a twin-engine transport during zero-visibility crosswinds and heavy squalls',
            'piloted a supersonic transcontinental private charter ahead of scheduled arrival',
            'safely managed an engine flameout at thirty thousand feet with flawless protocols',
            'ferried sensitive cargo through turbulent mountain passes under radar surveillance',
            'commanded a high-altitude orbital drop flight for aerospace research payloads'
        ]
    },
    artist: {
        id: 'artist',
        title: 'atelier designer',
        emoji: '<:harm_wand:1560309018973442169>',
        description: 'create bespoke visual artworks, street murals, and limited luxury fashion.',
        baseMin: 650,
        baseMax: 1200,
        ranks: ['sketch apprentice', 'digital creator', 'ink specialist', 'master tattooist', 'visionary atelier'],
        scenarios: [
            'inked an intricate full-sleeve geometric tattoo over an eight-hour session',
            'unveiled a solo modern gallery exhibition that sold out within minutes',
            'designed a limited-edition streetwear vinyl figure that achieved collector cult status',
            'restored a rare Japanese woodblock print with meticulous archival precision',
            'painted a towering urban mural that became an iconic district landmark'
        ]
    }
};

// Convenient Aliases
CAREERS.dev = CAREERS.engineer;
CAREERS.developer = CAREERS.engineer;
CAREERS.coder = CAREERS.engineer;
CAREERS.courier = CAREERS.racer;
CAREERS.barista = CAREERS.artist;
CAREERS.medic = CAREERS.surgeon;
CAREERS.doctor = CAREERS.surgeon;
CAREERS.merc = CAREERS.mercenary;
CAREERS.music = CAREERS.producer;
CAREERS.crypto = CAREERS.trader;
CAREERS.hustler = CAREERS.mercenary;

function getRankTitle(career, level) {
    const job = CAREERS[career] || CAREERS.engineer;
    const idx = Math.max(1, Math.min(5, level)) - 1;
    return job.ranks[idx] || job.ranks[0];
}

class WorkCommand {
    constructor() {
        this.name = 'work';
        this.aliases = ['shift', 'job', 'clockin'];
        this.description = 'clock in for your career shift, earn wages, and climb professional ranks.';
        this.syntax = ',work [jobs|apply <job>|info]';
        this.example = ',work\n,work jobs\n,work apply hacker\n,work info';
        this.category = 'economy';
        this.cooldown = 2;
        this.subcommands = [
            'work',
            'work jobs',
            'work apply <job>',
            'work info'
        ];
        this.subcommandDetails = {
            work: {
                description: 'clock in for a work shift and claim your pay.',
                syntax: ',work',
                example: ',work'
            },
            jobs: {
                description: 'view all 10 available careers and their wage ranges.',
                syntax: ',work jobs',
                example: ',work jobs'
            },
            apply: {
                description: 'switch your active career.',
                syntax: ',work apply <career>',
                example: ',work apply hacker'
            },
            info: {
                description: 'inspect your complete employment dossier, level, and stats.',
                syntax: ',work info',
                example: ',work info'
            }
        };
    }

    async execute(message, args) {
        const sub = (args[0] || '').toLowerCase();
        const p = config.prefix || ',';

        // 1. Job Board
        if (sub === 'jobs' || sub === 'list' || sub === 'board') {
            return this.sendJobBoard(message);
        }

        // 2. Career Application
        if (sub === 'apply' || sub === 'choose' || sub === 'switch') {
            const target = (args[1] || '').toLowerCase();
            return this.applyForJob(message, target);
        }

        // 3. Career Dossier / Info
        if (sub === 'info' || sub === 'profile' || sub === 'stats' || sub === 'dossier') {
            return this.sendCareerInfo(message);
        }

        // Direct career application via ,work <career> (e.g. ,work hacker)
        if (CAREERS[sub]) {
            return this.applyForJob(message, sub);
        }

        // Unknown Subcommand Guard
        if (sub && sub !== 'shift' && sub !== 'clockin') {
            const valid = ['jobs', 'apply', 'info', 'hacker', 'engineer', 'trader', 'producer', 'racer', 'mercenary', 'casino', 'surgeon', 'pilot', 'artist'];
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
                    embeds: [build.say(message.author, `did you mean \`${p}work ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown subcommand \`${sub}\`.\n-# syntax: \`${p}work [jobs|apply <career>|info]\``)]
            });
        }

        // 4. Default: CLOCK IN AND WORK
        return this.clockIn(message);
    }

    // ─────────────────────────────────────────────────────────────
    // CLOCK IN & WORK SHIFT
    // ─────────────────────────────────────────────────────────────

    async clockIn(message) {
        const db = message.client.db;
        const guildId = message.guild?.id || 'global';
        const p = config.prefix || ',';

        const work = await db.getWork(guildId, message.author.id);
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - (work.last_work || 0);

        // Check Cooldown
        if (elapsed < COOLDOWN_SECONDS) {
            const nextTimestamp = (work.last_work || 0) + COOLDOWN_SECONDS;
            return message.reply({
                embeds: [build.warn(message.author, `you are currently resting. next shift ready <t:${nextTimestamp}:R>.`)]
            });
        }

        const job = CAREERS[work.career] || CAREERS.engineer;
        const level = work.level || 1;
        const rankTitle = getRankTitle(work.career, level);

        // Calculate Payout
        const base = Math.floor(Math.random() * (job.baseMax - job.baseMin + 1)) + job.baseMin;
        const levelMultiplier = LEVEL_MULTIPLIERS[level - 1] || 1.0;
        const streak = (work.work_streak || 0) + 1;
        const streakBonus = Math.min(0.40, (streak - 1) * 0.04); // +4% per streak up to 40%

        const payout = Math.floor(base * levelMultiplier * (1 + streakBonus));
        const expGained = Math.floor(Math.random() * 16) + 20; // 20 - 35 exp

        // Update DB
        const updatedWork = await db.updateWorkShift(guildId, message.author.id, payout, expGained);
        await db.addWallet(guildId, message.author.id, payout);
        const eco = await db.getEconomy(guildId, message.author.id);

        // Pick scenario
        const scenario = job.scenarios[Math.floor(Math.random() * job.scenarios.length)];
        const newLevel = updatedWork.level || level;
        const targetExp = EXP_THRESHOLDS[newLevel] || 1000;
        const authorAvatar = message.author.displayAvatarURL({ size: 256, dynamic: true });
        const bannerAtt = build.getAssetAttachment('economy.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const desc = [
            `### [work shift complete](https://discord.gg/hCQhTmPf2G)`,
            `-# ${scenario}.\n`,
            `**earned** \`+$${payout.toLocaleString()}\` · **wallet** \`$${(eco.wallet || 0).toLocaleString()}\``,
            `**career** \`${job.title}\` · **rank** \`${rankTitle}\` *(lvl ${newLevel})*`,
            `**streak** \`${streak}\` shifts · **reputation** \`${updatedWork.exp || 0} / ${targetExp} exp\` *(+${expGained} exp)*`
        ].join('\n');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`work_view_jobs_${message.author.id}`)
                .setLabel('view careers')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(config.emojis?.calendar || '<:calendar:1558818700457672778>'),
            new ButtonBuilder()
                .setCustomId(`work_view_dossier_${message.author.id}`)
                .setLabel('career stats')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(config.emojis?.idcard || '<:idcard:1558818721156567040>')
        );

        let replyMsg;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(authorAvatar));
            container.addSectionComponents(section);

            if (bannerAtt) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addActionRowComponents(row);

            replyMsg = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(authorAvatar)
                .setDescription(desc);
            if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

            replyMsg = await message.reply({
                embeds: [embed],
                components: [row],
                files
            }).catch(() => null);
        }

        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({ time: 45000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'only the command author can use these buttons.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            if (i.customId.startsWith('work_view_jobs_')) {
                collector.stop('handled');
                await i.deferUpdate().catch(() => {});
                return this.sendJobBoard(message);
            }

            if (i.customId.startsWith('work_view_dossier_')) {
                collector.stop('handled');
                await i.deferUpdate().catch(() => {});
                return this.sendCareerInfo(message);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // JOB BOARD (COMPONENTS V2)
    // ─────────────────────────────────────────────────────────────

    async sendJobBoard(message) {
        const p = config.prefix || ',';
        const distinctJobs = ['hacker', 'engineer', 'trader', 'producer', 'racer', 'mercenary', 'casino', 'surgeon', 'pilot', 'artist'];
        const bannerAtt = build.getAssetAttachment('economy.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];
        const botAvatar = message.client.user?.displayAvatarURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const lines = distinctJobs.map((id, idx) => {
            const j = CAREERS[id];
            return `\`${idx + 1}.\` **${j.title}** ─ \`$${j.baseMin} - $${j.baseMax}\`\n-# ${j.description}`;
        });

        const desc = [
            `### [available careers](https://discord.gg/hCQhTmPf2G)`,
            `-# explore open positions and their starting shift wages.\n`,
            lines.join('\n\n'),
            `\n-# use \`${p}work apply <career>\` or select below to switch careers.`
        ].join('\n');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`work_apply_select_${message.author.id}`)
            .setPlaceholder('select a career to apply...')
            .addOptions(
                distinctJobs.map(id => {
                    const j = CAREERS[id];
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(j.title)
                        .setValue(`apply_${j.id}`)
                        .setDescription(`wage: $${j.baseMin}-$${j.baseMax} • top: ${j.ranks[4]}`)
                        .setEmoji(j.emoji || config.emojis?.idcard || '<:idcard:1558818721156567040>');
                })
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        let replyMsg;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar));
            container.addSectionComponents(section);

            if (bannerAtt) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addActionRowComponents(row);

            replyMsg = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(botAvatar)
                .setDescription(desc);
            if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

            replyMsg = await message.reply({
                embeds: [embed],
                components: [row],
                files
            }).catch(() => null);
        }

        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'only the command author can choose a career.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const chosen = i.values[0].replace('apply_', '');
            collector.stop('selected');
            await i.deferUpdate().catch(() => {});
            return this.applyForJob(message, chosen);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // APPLY FOR JOB
    // ─────────────────────────────────────────────────────────────

    async applyForJob(message, careerKey) {
        const p = config.prefix || ',';
        const job = CAREERS[careerKey];

        if (!job) {
            return message.reply({
                embeds: [build.warn(message.author, `career \`${careerKey || 'none'}\` not found.\n-# run \`${p}work jobs\` to view all available careers.`)]
            });
        }

        const db = message.client.db;
        const guildId = message.guild?.id || 'global';
        const work = await db.getWork(guildId, message.author.id);

        if (work.career === job.id) {
            return message.reply({
                embeds: [build.warn(message.author, `you are already employed as a **${job.title}**.`)]
            });
        }

        await db.setWorkCareer(guildId, message.author.id, job.id);

        return message.reply({
            embeds: [build.approved(message.author, `switched career to **${job.title}** ${job.emoji || ''}.\n-# shift wage: \`$${job.baseMin.toLocaleString()} - $${job.baseMax.toLocaleString()}\` · clock in with \`${p}work\`.`)]
        });
    }

    // ─────────────────────────────────────────────────────────────
    // CAREER DOSSIER / STATS (COMPONENTS V2)
    // ─────────────────────────────────────────────────────────────

    async sendCareerInfo(message) {
        const db = message.client.db;
        const guildId = message.guild?.id || 'global';
        const work = await db.getWork(guildId, message.author.id);
        const eco = await db.getEconomy(guildId, message.author.id);
        const job = CAREERS[work.career] || CAREERS.engineer;
        const level = work.level || 1;
        const rankTitle = getRankTitle(work.career, level);
        const mult = LEVEL_MULTIPLIERS[level - 1] || 1.0;
        const targetExp = EXP_THRESHOLDS[level] || 1000;
        const expPct = Math.min(100, Math.floor(((work.exp || 0) / targetExp) * 100));
        const authorAvatar = message.author.displayAvatarURL({ size: 256, dynamic: true });
        const bannerAtt = build.getAssetAttachment('economy.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];

        const desc = [
            `### [career dossier](https://discord.gg/hCQhTmPf2G)`,
            `-# complete employment history and professional standing.\n`,
            `**career** · \`${job.title}\` · **rank** · \`${rankTitle}\` *(lvl ${level})*`,
            `**reputation** · \`${work.exp || 0} / ${targetExp} exp\` (${expPct}%)`,
            `**wage multiplier** · \`${mult.toFixed(2)}x\` · **streak** · \`${work.work_streak || 0}\` shifts`,
            `**total earned** · \`$${(work.total_earned || 0).toLocaleString()}\` · **wallet** · \`$${(eco.wallet || 0).toLocaleString()}\``
        ].join('\n');

        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(authorAvatar));
            container.addSectionComponents(section);

            if (bannerAtt) {
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(`attachment://${bannerAtt.name}`)
                    )
                );
            }

            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );

            return await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(authorAvatar)
                .setDescription(desc);
            if (bannerAtt) embed.setImage(`attachment://${bannerAtt.name}`);

            return await message.reply({
                embeds: [embed],
                files
            }).catch(() => null);
        }
    }
}

module.exports = WorkCommand;
