const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
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
const {
    createTttBoard,
    checkTttWinner,
    renderTttRows,
    createC4Board,
    dropC4Token,
    checkC4Winner,
    renderC4Text,
    renderC4Buttons,
    RPS_MOVES,
    determineRpsWinner,
    renderRpsButtons,
    getRandomTrivia,
    renderTriviaButtons,
    generateMinesweeper,
    getRandomHangman,
    renderHangmanDisplay,
    getRandomWordle,
    evaluateWordleGuess,
    getRandomScramble
} = require('../../structures/utils/helpers/gameshelper.js');

class GamesCommand {
    constructor() {
        this.name = 'games';
        this.aliases = ['game'];
        this.description = 'interactive multiplayer duels & solo mini-games.';
        this.syntax = ',games [tictactoe|connect4|rps|trivia|minesweeper|hangman|wordle|scramble] [@user]';
        this.example = ',games\n,games tictactoe @user\n,games connect4 @user\n,games rps @user\n,games trivia\n,games minesweeper\n,games hangman\n,games wordle\n,games scramble';
        this.category = 'fun';
        this.cooldown = 2;
        this.subcommands = [
            'games tictactoe @user',
            'games connect4 @user',
            'games rps @user',
            'games trivia',
            'games minesweeper',
            'games hangman',
            'games wordle',
            'games scramble'
        ];
        this.subcommandDetails = {
            tictactoe: {
                description: 'classic 3x3 turn-based tic-tac-toe duel against a friend.',
                syntax: ',games tictactoe @user',
                example: ',games tictactoe @user'
            },
            connect4: {
                description: 'connect four discs in a row vertically, horizontally, or diagonally.',
                syntax: ',games connect4 @user',
                example: ',games connect4 @user'
            },
            rps: {
                description: 'rock paper scissors duel with secret move selection.',
                syntax: ',games rps @user',
                example: ',games rps @user'
            },
            trivia: {
                description: 'timed general knowledge trivia quiz with multiple choice.',
                syntax: ',games trivia',
                example: ',games trivia'
            },
            minesweeper: {
                description: '8x8 grid of hidden landmines covered with interactive spoiler tags.',
                syntax: ',games minesweeper',
                example: ',games minesweeper'
            },
            hangman: {
                description: 'word guessing puzzle with a 6-life letter bank.',
                syntax: ',games hangman',
                example: ',games hangman'
            },
            wordle: {
                description: 'deduce the hidden 5-letter mystery word within 6 tries.',
                syntax: ',games wordle',
                example: ',games wordle'
            },
            scramble: {
                description: 'fast-paced anagram word unscrambler with 30s timer.',
                syntax: ',games scramble',
                example: ',games scramble'
            }
        };
    }

    async resolveTargetUser(message, targetArg) {
        if (!targetArg) return null;
        const match = targetArg.match(/^<@!?(\d+)>$/);
        const id = match ? match[1] : (/^\d{17,20}$/.test(targetArg) ? targetArg : null);
        if (id) {
            try {
                return await message.client.users.fetch(id);
            } catch (_) {}
        }
        if (message.guild) {
            const query = targetArg.toLowerCase();
            const member = message.guild.members.cache.find(m =>
                m.user.username.toLowerCase() === query ||
                m.displayName.toLowerCase() === query ||
                m.user.tag.toLowerCase() === query
            );
            if (member) return member.user;
        }
        return null;
    }

    async execute(message, args) {
        const p = config.prefix || ',';
        const sub = (args[0] || '').toLowerCase();
        const targetArg = args[1] || null;

        // ──────────────────────── 1. MULTIPLAYER GAMES (NO AI - REQUIRES REAL OPPONENT) ────────────────────────
        if (sub === 'tictactoe' || sub === 'ttt') {
            const opponent = await this.resolveTargetUser(message, targetArg);
            if (!opponent || opponent.id === message.author.id || opponent.bot) {
                return message.reply({
                    embeds: [build.warn(message.author, `syntax: \`${p}games tictactoe @user\`\n-# you must challenge another server member.`)]
                });
            }
            return this.handleChallenge(message, 'tic-tac-toe', opponent, (msg, opp, editTgt) => this.startTicTacToe(msg, opp, editTgt));
        }

        if (sub === 'connect4' || sub === 'c4') {
            const opponent = await this.resolveTargetUser(message, targetArg);
            if (!opponent || opponent.id === message.author.id || opponent.bot) {
                return message.reply({
                    embeds: [build.warn(message.author, `syntax: \`${p}games connect4 @user\`\n-# you must challenge another server member.`)]
                });
            }
            return this.handleChallenge(message, 'connect four', opponent, (msg, opp, editTgt) => this.startConnectFour(msg, opp, editTgt));
        }

        if (sub === 'rps' || sub === 'rockpaperscissors') {
            const opponent = await this.resolveTargetUser(message, targetArg);
            if (!opponent || opponent.id === message.author.id || opponent.bot) {
                return message.reply({
                    embeds: [build.warn(message.author, `syntax: \`${p}games rps @user\`\n-# you must challenge another server member.`)]
                });
            }
            return this.handleChallenge(message, 'rock paper scissors', opponent, (msg, opp, editTgt) => this.startRps(msg, opp, editTgt));
        }

        // ──────────────────────── 2. SOLO GAMES ────────────────────────
        if (sub === 'trivia') {
            return this.startTrivia(message);
        }

        if (sub === 'minesweeper') {
            return this.startMinesweeper(message);
        }

        if (sub === 'hangman') {
            return this.startHangman(message);
        }

        if (sub === 'wordle') {
            return this.startWordle(message);
        }

        if (sub === 'scramble') {
            return this.startScramble(message);
        }

        // ──────────────────────── 3. UNKNOWN SUBCOMMAND GUARD ────────────────────────
        if (sub) {
            const valid = ['tictactoe', 'connect4', 'rps', 'trivia', 'minesweeper', 'hangman', 'wordle', 'scramble'];
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
                    embeds: [build.say(message.author, `did you mean \`${p}games ${best}\`?`)]
                });
            }

            return message.reply({
                embeds: [build.warn(message.author, `unknown game \`${sub}\`.\n-# available: \`tictactoe\`, \`connect4\`, \`rps\`, \`trivia\`, \`minesweeper\`, \`hangman\`, \`wordle\`, \`scramble\`\n-# type \`${p}games\` to view the games hub.`)]
            });
        }

        // ──────────────────────── 4. FLAGSHIP GAMES HUB (DEFAULT) ────────────────────────
        return this.sendGamesHub(message);
    }

    // ─────────────────────────────────────────────────────────────
    // CHALLENGE CONSENT SYSTEM
    // ─────────────────────────────────────────────────────────────

    async handleChallenge(message, gameName, opponent, startFn) {
        const p1 = message.author;
        const e = config.emojis || {};

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`challenge_accept_${message.id}`)
                .setLabel('accept')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(e.approve || '<:harm_tick:1558811267014066366>'),
            new ButtonBuilder()
                .setCustomId(`challenge_decline_${message.id}`)
                .setLabel('decline')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(e.deny || '<:harm_deny:1558811268608167939>')
        );

        const initialPayload = {
            embeds: [
                build.say(
                    opponent,
                    `<@${opponent.id}>**:** <@${p1.id}> has challenged you to a game of **${gameName}**!\n` +
                    `click **accept** to start playing or **decline** to cancel.`
                )
            ],
            components: [row]
        };

        const challengeMsg = await message.reply(initialPayload).catch(() => null);
        if (!challengeMsg) return;

        const collector = challengeMsg.createMessageComponentCollector({
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.user.id === p1.id) {
                return i.reply({
                    embeds: [build.warn(i.user, 'you cannot accept your own challenge.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.user.id !== opponent.id) {
                return i.reply({
                    embeds: [build.warn(i.user, `this challenge was sent to <@${opponent.id}>.`)],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            if (i.customId === `challenge_accept_${message.id}`) {
                collector.stop('accepted');
                await i.deferUpdate().catch(() => {});
                return startFn(message, opponent, challengeMsg);
            }

            if (i.customId === `challenge_decline_${message.id}`) {
                collector.stop('declined');
                return await i.update({
                    embeds: [build.warn(opponent, `<@${opponent.id}> declined the challenge from <@${p1.id}>.`)],
                    components: []
                }).catch(() => {});
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'accepted' || reason === 'declined') return;
            await challengeMsg.edit({
                embeds: [build.warn(opponent, `<@${opponent.id}> did not respond to the challenge in time.`)],
                components: []
            }).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // FLAGSHIP GAMES HUB
    // ─────────────────────────────────────────────────────────────

    async sendGamesHub(message) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const botAvatar = message.client.user?.displayAvatarURL({ size: 256, dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const bannerAtt = build.getAssetAttachment('fun.png') || build.getAssetAttachment('banner.png');
        const files = bannerAtt ? [bannerAtt] : [];
        const p = config.prefix || ',';

        const hubDescription = [
            `### [harm games](${supportUrl})`,
            `-# interactive multiplayer duels & solo challenges.\n`,
            `**available games** \`8\` · **multiplayer** \`3\` · **solo** \`5\` · **status** \`active\`\n`,
            `-# **multiplayer duels**:`,
            `-# \`${p}games tictactoe @user\` — classic 3x3 turn-based grid duel`,
            `-# \`${p}games connect4 @user\` — connect 4 discs vertically or diagonally`,
            `-# \`${p}games rps @user\` — rock paper scissors with secret moves\n`,
            `-# **solo challenges**:`,
            `-# \`${p}games trivia\` — timed multiple-choice trivia challenge`,
            `-# \`${p}games minesweeper\` — 8x8 minefield puzzle with hidden tiles`,
            `-# \`${p}games hangman\` — word guess puzzle with 6-life letter bank`,
            `-# \`${p}games wordle\` — 6 attempts to deduce mystery 5-letter word`,
            `-# \`${p}games scramble\` — fast-paced anagram unscrambler`
        ].join('\n');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`games_hub_select_${message.id}`)
            .setPlaceholder('select a solo game to play instantly...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('trivia challenge')
                    .setValue('solo_trivia')
                    .setDescription('timed general knowledge multiple choice')
                    .setEmoji(e.harm_trivia || '<:harm_trivia:1561738448728227872>'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('minesweeper')
                    .setValue('solo_minesweeper')
                    .setDescription('8x8 grid with 10 hidden landmines')
                    .setEmoji(e.harm_bomb || '<:harm_bomb:1561738453505417256>'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('hangman')
                    .setValue('solo_hangman')
                    .setDescription('guess word letter by letter within 6 lives')
                    .setEmoji(e.harm_scissors || '<:harm_scissors:1561738444206645431>'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('wordle')
                    .setValue('solo_wordle')
                    .setDescription('deduce the 5-letter word in 6 guesses')
                    .setEmoji(e.renamevc || '<:renamevc:1558818794728591512>'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('anagram scramble')
                    .setValue('solo_scramble')
                    .setDescription('unscramble the anagram within 30 seconds')
                    .setEmoji(e.harm_chat || '<:harm_chat:1561780895038439606>')
            );

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        let replyMsg;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(hubDescription))
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
            container.addActionRowComponents(selectRow);

            replyMsg = await message.reply({
                components: [container],
                files,
                flags: MessageFlags.IsComponentsV2
            });
        } catch (_) {
            const fallbackEmbed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(botAvatar)
                .setDescription(hubDescription);
            if (bannerAtt) fallbackEmbed.setImage(`attachment://${bannerAtt.name}`);

            replyMsg = await message.reply({
                embeds: [fallbackEmbed],
                components: [selectRow],
                files
            }).catch(() => null);
        }

        if (!replyMsg) return;

        const collector = replyMsg.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({
                    embeds: [build.deny(i.user, 'only the command author can select a game.')],
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            const chosen = i.values[0];
            collector.stop('selected');
            await i.deferUpdate().catch(() => {});

            if (chosen === 'solo_trivia') return this.startTrivia(message, replyMsg);
            if (chosen === 'solo_minesweeper') return this.startMinesweeper(message, replyMsg);
            if (chosen === 'solo_hangman') return this.startHangman(message, replyMsg);
            if (chosen === 'solo_wordle') return this.startWordle(message, replyMsg);
            if (chosen === 'solo_scramble') return this.startScramble(message, replyMsg);
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'selected' || reason === 'deleted') return;
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    StringSelectMenuBuilder.from(selectMenu).setDisabled(true)
                );
                await replyMsg.edit({ components: [disabledRow] }).catch(() => {});
            } catch (_) {}
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 1. TIC-TAC-TOE (MULTIPLAYER ONLY)
    // ─────────────────────────────────────────────────────────────

    async startTicTacToe(message, opponent, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const p1 = message.author;
        const p2 = opponent;
        const e = config.emojis || {};

        let board = createTttBoard();
        let turn = 'X'; // X starts (p1)

        const buildPayload = (statusText = null, isEnded = false, winningCombo = []) => {
            const currentTurnId = turn === 'X' ? p1.id : p2.id;
            const currentSymbol = turn === 'X' ? (e.harm_cross || '`X`') : (e.harm_circle || '`O`');

            const desc = [
                `### [tic-tac-toe](${supportUrl})`,
                `-# **player 1:** <@${p1.id}> (${e.harm_cross || '`X`'}) · **player 2:** <@${p2.id}> (${e.harm_circle || '`O`'})\n`,
                statusText || `-# **current turn:** <@${currentTurnId}> (${currentSymbol})`
            ].join('\n');

            const rows = renderTttRows(board, isEnded, winningCombo);

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
                if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
                container.addSectionComponents(section);

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                for (const r of rows) container.addActionRowComponents(r);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                    .setDescription(desc);
                return { embeds: [embed], components: rows };
            }
        };

        const initialPayload = buildPayload();
        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...initialPayload, files: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!gameMsg) return;

        const collector = gameMsg.createMessageComponentCollector({
            time: 90000
        });

        collector.on('collect', async i => {
            const expectedUserId = turn === 'X' ? p1.id : p2.id;

            if (i.user.id !== expectedUserId) {
                if (i.user.id === p1.id || i.user.id === p2.id) {
                    return i.reply({ content: "it's not your turn.", flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                return i.reply({ content: 'you are not part of this duel.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const cellIdx = parseInt(i.customId.replace('ttt_', ''), 10);
            if (board[cellIdx] !== null) {
                return i.reply({ content: 'that square is already taken.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            board[cellIdx] = turn;
            let result = checkTttWinner(board);

            if (result) {
                collector.stop(result.winner);
                let finalStatus;
                if (result.winner === 'tie') {
                    finalStatus = `-# **game over:** it's a draw.`;
                } else {
                    const winnerId = result.winner === 'X' ? p1.id : p2.id;
                    finalStatus = `-# **game over:** <@${winnerId}> won the duel!`;
                }
                return i.update(buildPayload(finalStatus, true, result.combo || [])).catch(() => {});
            }

            turn = turn === 'X' ? 'O' : 'X';
            await i.update(buildPayload()).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (['X', 'O', 'tie'].includes(reason)) return;
            const timeoutStatus = `-# **duel timed out:** expired after 90 seconds of inactivity.`;
            await gameMsg.edit(buildPayload(timeoutStatus, true)).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. CONNECT FOUR (MULTIPLAYER ONLY)
    // ─────────────────────────────────────────────────────────────

    async startConnectFour(message, opponent, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const p1 = message.author;
        const p2 = opponent;
        const e = config.emojis || {};

        let board = createC4Board();
        let turn = 'R'; // R starts (p1)

        const buildPayload = (statusText = null, isEnded = false) => {
            const currentTurnId = turn === 'R' ? p1.id : p2.id;
            const currentSymbol = turn === 'R' ? (e.harm_red || '`[R]`') : (e.harm_yellow || '`[Y]`');

            const desc = [
                `### [connect four](${supportUrl})`,
                `-# **player 1:** <@${p1.id}> (${e.harm_red || '`[R]`'}) · **player 2:** <@${p2.id}> (${e.harm_yellow || '`[Y]`'})\n`,
                renderC4Text(board) + '\n',
                statusText || `-# **current turn:** <@${currentTurnId}> (${currentSymbol})`
            ].join('\n');

            const rows = renderC4Buttons(board, isEnded);

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
                if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
                container.addSectionComponents(section);

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                for (const r of rows) container.addActionRowComponents(r);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                    .setDescription(desc);
                return { embeds: [embed], components: rows };
            }
        };

        const initialPayload = buildPayload();
        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...initialPayload, files: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!gameMsg) return;

        const collector = gameMsg.createMessageComponentCollector({
            time: 90000
        });

        collector.on('collect', async i => {
            const expectedUserId = turn === 'R' ? p1.id : p2.id;

            if (i.user.id !== expectedUserId) {
                if (i.user.id === p1.id || i.user.id === p2.id) {
                    return i.reply({ content: "it's not your turn.", flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                return i.reply({ content: 'you are not part of this duel.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const col = parseInt(i.customId.replace('c4_drop_', ''), 10);
            const dropRow = dropC4Token(board, col, turn);

            if (dropRow === -1) {
                return i.reply({ content: 'that column is full.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            let winner = checkC4Winner(board);
            if (winner) {
                collector.stop(winner);
                let finalStatus;
                if (winner === 'tie') {
                    finalStatus = `-# **game over:** grid filled, it's a draw.`;
                } else {
                    const winnerId = winner === 'R' ? p1.id : p2.id;
                    finalStatus = `-# **game over:** <@${winnerId}> connected four!`;
                }
                return i.update(buildPayload(finalStatus, true)).catch(() => {});
            }

            turn = turn === 'R' ? 'Y' : 'R';
            await i.update(buildPayload()).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (['R', 'Y', 'tie'].includes(reason)) return;
            const timeoutStatus = `-# **duel timed out:** expired after 90 seconds of inactivity.`;
            await gameMsg.edit(buildPayload(timeoutStatus, true)).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ROCK-PAPER-SCISSORS (MULTIPLAYER ONLY)
    // ─────────────────────────────────────────────────────────────

    async startRps(message, opponent, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const p1 = message.author;
        const p2 = opponent;

        let p1Choice = null;
        let p2Choice = null;

        const buildPayload = (statusText = null, isEnded = false) => {
            const p1Status = p1Choice ? '`locked in`' : '`choosing...`';
            const p2Status = p2Choice ? '`locked in`' : '`choosing...`';

            const desc = [
                `### [rock paper scissors](${supportUrl})`,
                `-# **player 1:** <@${p1.id}> ─ ${p1Status}`,
                `-# **player 2:** <@${p2.id}> ─ ${p2Status}\n`,
                statusText || `-# click a button below to secretly lock in your move.`
            ].join('\n');

            const rows = renderRpsButtons(isEnded);

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
                if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
                container.addSectionComponents(section);

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                for (const r of rows) container.addActionRowComponents(r);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                    .setDescription(desc);
                return { embeds: [embed], components: rows };
            }
        };

        const initialPayload = buildPayload();
        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...initialPayload, files: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!gameMsg) return;

        const collector = gameMsg.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== p1.id && i.user.id !== p2.id) {
                return i.reply({ content: 'you are not part of this duel.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const chosen = i.customId.replace('rps_', '');
            if (!RPS_MOVES.includes(chosen)) return;

            if (i.user.id === p1.id) {
                if (p1Choice) {
                    return i.reply({ content: 'you have already locked in your move.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                p1Choice = chosen;
            } else if (i.user.id === p2.id) {
                if (p2Choice) {
                    return i.reply({ content: 'you have already locked in your move.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
                p2Choice = chosen;
            }

            await i.reply({ content: `you locked in **${chosen}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});

            if (p1Choice && p2Choice) {
                collector.stop('resolved');
                const outcome = determineRpsWinner(p1Choice, p2Choice);

                let outcomeText;
                if (outcome === 0) {
                    outcomeText = `-# **result:** it's a tie! both players picked \`${p1Choice}\`.`;
                } else if (outcome === 1) {
                    outcomeText = `-# **result:** <@${p1.id}> (\`${p1Choice}\`) beats <@${p2.id}> (\`${p2Choice}\`)!`;
                } else {
                    outcomeText = `-# **result:** <@${p2.id}> (\`${p2Choice}\`) beats <@${p1.id}> (\`${p1Choice}\`)!`;
                }

                return gameMsg.edit(buildPayload(outcomeText, true)).catch(() => {});
            }

            await gameMsg.edit(buildPayload()).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'resolved') return;
            const timeoutStatus = `-# **duel timed out:** one or both players did not select in time.`;
            await gameMsg.edit(buildPayload(timeoutStatus, true)).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. TRIVIA (SOLO)
    // ─────────────────────────────────────────────────────────────

    async startTrivia(message, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const trivia = getRandomTrivia();
        const p1 = message.author;

        const buildPayload = (statusText = null, selectedIdx = null, isEnded = false) => {
            const desc = [
                `### [trivia challenge](${supportUrl})`,
                `-# **category:** \`${trivia.category}\` · **player:** <@${p1.id}>\n`,
                `**${trivia.q}**\n`,
                statusText || `-# you have **20 seconds** to select the correct answer below.`
            ].join('\n');

            const rows = renderTriviaButtons(trivia.options, selectedIdx, trivia.answer, isEnded);

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
                if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
                container.addSectionComponents(section);

                container.addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                );
                for (const r of rows) container.addActionRowComponents(r);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                    .setDescription(desc);
                return { embeds: [embed], components: rows };
            }
        };

        const initialPayload = buildPayload();
        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...initialPayload, files: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!gameMsg) return;

        const collector = gameMsg.createMessageComponentCollector({
            time: 20000
        });

        collector.on('collect', async i => {
            if (i.user.id !== p1.id) {
                return i.reply({ content: 'only the challenger can answer this trivia question.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const chosenIdx = parseInt(i.customId.replace('trivia_opt_', ''), 10);
            collector.stop('answered');

            const isCorrect = chosenIdx === trivia.answer;
            const statusText = isCorrect
                ? `-# **correct!** you selected **${trivia.options[chosenIdx]}**.`
                : `-# **incorrect.** the correct answer was **${trivia.options[trivia.answer]}**.`;

            return i.update(buildPayload(statusText, chosenIdx, true)).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'answered') return;
            const timeoutStatus = `-# **timed out:** time expired! the correct answer was **${trivia.options[trivia.answer]}**.`;
            await gameMsg.edit(buildPayload(timeoutStatus, null, true)).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. MINESWEEPER (SOLO)
    // ─────────────────────────────────────────────────────────────

    async startMinesweeper(message, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const gridText = generateMinesweeper(8, 8, 10);
        const p1 = message.author;

        const desc = [
            `### [minesweeper](${supportUrl})`,
            `-# **grid size:** \`8x8\` · **mines:** \`10\` · **player:** <@${p1.id}>\n`,
            gridText,
            `\n-# click any spoiler tile above to reveal it. avoid the hidden landmines!`
        ].join('\n');

        let payload;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(desc)
            );
            const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
            if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
            container.addSectionComponents(section);

            payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                .setDescription(desc);
            payload = { embeds: [embed] };
        }

        if (editTarget) {
            return editTarget.edit({ ...payload, files: [], components: payload.components || [] }).catch(() => null);
        }
        return message.reply(payload).catch(() => null);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. HANGMAN (SOLO)
    // ─────────────────────────────────────────────────────────────

    async startHangman(message, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const item = getRandomHangman();
        const word = item.word.toLowerCase();
        const p1 = message.author;

        const guessed = new Set();
        let lives = 6;

        const buildPayload = (statusText = null, isEnded = false) => {
            const displayWord = renderHangmanDisplay(word, guessed);
            const heartIcon = e.harm_heart || '✦ ';
            const livesIcons = heartIcon.repeat(lives).trim();
            const guessedList = guessed.size > 0 ? Array.from(guessed).map(l => `\`${l.toUpperCase()}\``).join(' ') : '`none`';

            const desc = [
                `### [hangman](${supportUrl})`,
                `-# **lives:** ${livesIcons} (\`${lives}/6\`) · **player:** <@${p1.id}>`,
                `-# **hint:** *${item.hint}*\n`,
                `${displayWord}\n`,
                `-# **guessed letters:** ${guessedList}`,
                statusText || `-# type a letter in chat to guess (you have 60 seconds).`
            ].join('\n');

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
                if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
                container.addSectionComponents(section);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                    .setDescription(desc);
                return { embeds: [embed] };
            }
        };

        const initialPayload = buildPayload();
        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...initialPayload, files: [], components: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!gameMsg) return;

        const filter = m => m.author.id === p1.id && /^[a-zA-Z]$/.test(m.content.trim());
        const collector = message.channel.createMessageCollector({
            filter,
            time: 60000
        });

        collector.on('collect', async m => {
            const letter = m.content.trim().toLowerCase();
            try { await m.delete().catch(() => {}); } catch (_) {}

            if (guessed.has(letter)) return;
            guessed.add(letter);

            if (!word.includes(letter)) {
                lives--;
            }

            // Check win
            const won = word.split('').every(ch => guessed.has(ch));
            if (won) {
                collector.stop('won');
                const winStatus = `-# **you won!** the word was \`${word.toUpperCase()}\`.`;
                return gameMsg.edit(buildPayload(winStatus, true)).catch(() => {});
            }

            // Check loss
            if (lives <= 0) {
                collector.stop('lost');
                const loseStatus = `-# **game over!** out of lives. the word was \`${word.toUpperCase()}\`.`;
                return gameMsg.edit(buildPayload(loseStatus, true)).catch(() => {});
            }

            collector.resetTimer();
            await gameMsg.edit(buildPayload()).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'won' || reason === 'lost') return;
            const timeoutStatus = `-# **timed out:** inactive for 60s. the word was \`${word.toUpperCase()}\`.`;
            await gameMsg.edit(buildPayload(timeoutStatus, true)).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 7. WORDLE (SOLO)
    // ─────────────────────────────────────────────────────────────

    async startWordle(message, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const secret = getRandomWordle();
        const p1 = message.author;

        const guesses = [];
        const maxGuesses = 6;

        const buildPayload = (statusText = null, isEnded = false) => {
            const rowsDisplay = [];
            for (let i = 0; i < maxGuesses; i++) {
                if (i < guesses.length) {
                    const g = guesses[i];
                    const feedback = evaluateWordleGuess(secret, g);
                    const letterBoxes = g.split('').map(l => `\`${l.toUpperCase()}\``).join(' ');
                    rowsDisplay.push(`${feedback.join(' ')}  ${letterBoxes}`);
                } else {
                    const noMatch = e.harm_deny || e.cancel || '·';
                    rowsDisplay.push(`${noMatch} ${noMatch} ${noMatch} ${noMatch} ${noMatch}  \`_\` \`_\` \`_\` \`_\` \`_\``);
                }
            }

            const desc = [
                `### [wordle](${supportUrl})`,
                `-# **player:** <@${p1.id}> · **attempts:** \`${guesses.length}/${maxGuesses}\`\n`,
                rowsDisplay.join('\n') + '\n',
                statusText || `-# type a **5-letter word** in chat to submit your guess (60s timer).`
            ].join('\n');

            try {
                const container = new ContainerBuilder();
                container.setAccentColor(config.colors.c || 0x0A0A0C);

                const section = new SectionBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(desc)
                );
                const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
                if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
                container.addSectionComponents(section);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            } catch (_) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                    .setDescription(desc);
                return { embeds: [embed] };
            }
        };

        const initialPayload = buildPayload();
        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...initialPayload, files: [], components: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(initialPayload).catch(() => null);
        }

        if (!gameMsg) return;

        const filter = m => m.author.id === p1.id && /^[a-zA-Z]{5}$/.test(m.content.trim());
        const collector = message.channel.createMessageCollector({
            filter,
            time: 60000
        });

        collector.on('collect', async m => {
            const guess = m.content.trim().toLowerCase();
            try { await m.delete().catch(() => {}); } catch (_) {}

            guesses.push(guess);

            if (guess === secret) {
                collector.stop('won');
                const winStatus = `-# **genius!** you solved the wordle in \`${guesses.length}/${maxGuesses}\` tries.`;
                return gameMsg.edit(buildPayload(winStatus, true)).catch(() => {});
            }

            if (guesses.length >= maxGuesses) {
                collector.stop('lost');
                const loseStatus = `-# **game over!** out of tries. the secret word was \`${secret.toUpperCase()}\`.`;
                return gameMsg.edit(buildPayload(loseStatus, true)).catch(() => {});
            }

            collector.resetTimer();
            await gameMsg.edit(buildPayload()).catch(() => {});
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'won' || reason === 'lost') return;
            const timeoutStatus = `-# **timed out:** the secret word was \`${secret.toUpperCase()}\`.`;
            await gameMsg.edit(buildPayload(timeoutStatus, true)).catch(() => {});
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 8. SCRAMBLE (SOLO)
    // ─────────────────────────────────────────────────────────────

    async startScramble(message, editTarget = null) {
        const supportUrl = config.supportInvite || 'https://discord.gg/hCQhTmPf2G';
        const item = getRandomScramble();
        const p1 = message.author;

        const desc = [
            `### [anagram scramble](${supportUrl})`,
            `-# **player:** <@${p1.id}> · **time limit:** \`30 seconds\``,
            `-# **hint:** *${item.hint}*\n`,
            `**scrambled word:** \`${item.scrambled.toUpperCase()}\`\n`,
            `-# type the unscrambled word in chat to claim victory!`
        ].join('\n');

        let payload;
        try {
            const container = new ContainerBuilder();
            container.setAccentColor(config.colors.c || 0x0A0A0C);

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(desc)
            );
            const p1Avatar = p1.displayAvatarURL({ size: 256, dynamic: true });
            if (p1Avatar) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(p1Avatar));
            container.addSectionComponents(section);

            payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
        } catch (_) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.c || 0x0A0A0C)
                .setThumbnail(p1.displayAvatarURL({ size: 256, dynamic: true }))
                .setDescription(desc);
            payload = { embeds: [embed] };
        }

        let gameMsg;
        if (editTarget) {
            await editTarget.edit({ ...payload, files: [], components: [] }).catch(() => null);
            gameMsg = editTarget;
        } else {
            gameMsg = await message.reply(payload).catch(() => null);
        }

        if (!gameMsg) return;

        const filter = m => m.author.id === p1.id && m.content.trim().toLowerCase() === item.word.toLowerCase();
        const collector = message.channel.createMessageCollector({
            filter,
            time: 30000,
            max: 1
        });

        collector.on('collect', async m => {
            try { await m.delete().catch(() => {}); } catch (_) {}
            const winText = [
                `### [anagram scramble](${supportUrl})`,
                `-# **player:** <@${p1.id}>\n`,
                `- **correct!** you successfully unscrambled \`${item.word.toUpperCase()}\`!`
            ].join('\n');

            try {
                const c = new ContainerBuilder();
                c.setAccentColor(config.colors.c || 0x0A0A0C);
                c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(winText)));
                await gameMsg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (_) {
                await gameMsg.edit({ embeds: [new EmbedBuilder().setColor(config.colors.c || 0x0A0A0C).setDescription(winText)] }).catch(() => {});
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size > 0) return;
            const timeoutText = [
                `### [anagram scramble](${supportUrl})`,
                `-# **player:** <@${p1.id}>\n`,
                `- **time expired!** the word was \`${item.word.toUpperCase()}\`.`
            ].join('\n');

            try {
                const c = new ContainerBuilder();
                c.setAccentColor(config.colors.c || 0x0A0A0C);
                c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(timeoutText)));
                await gameMsg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (_) {
                await gameMsg.edit({ embeds: [new EmbedBuilder().setColor(config.colors.c || 0x0A0A0C).setDescription(timeoutText)] }).catch(() => {});
            }
        });
    }
}

module.exports = GamesCommand;
