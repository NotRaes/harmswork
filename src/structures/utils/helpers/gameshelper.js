const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const config = require('../../../config.js');

// ─────────────────────────────────────────────────────────────
// 1. TIC-TAC-TOE ENGINE
// ─────────────────────────────────────────────────────────────

function createTttBoard() {
    return Array(9).fill(null);
}

const TTT_WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

function checkTttWinner(board) {
    for (const [a, b, c] of TTT_WINNING_COMBOS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], combo: [a, b, c] };
        }
    }
    if (board.every(cell => cell !== null)) {
        return { winner: 'tie', combo: [] };
    }
    return null;
}

function getTttAiMove(board, aiSymbol = 'O') {
    const humanSymbol = aiSymbol === 'O' ? 'X' : 'O';

    // 1. Can AI win immediately?
    for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
            board[i] = aiSymbol;
            const res = checkTttWinner(board);
            board[i] = null;
            if (res && res.winner === aiSymbol) return i;
        }
    }

    // 2. Can Human win immediately? Block!
    for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
            board[i] = humanSymbol;
            const res = checkTttWinner(board);
            board[i] = null;
            if (res && res.winner === humanSymbol) return i;
        }
    }

    // 3. Take center
    if (board[4] === null) return 4;

    // 4. Take corners
    const corners = [0, 2, 6, 8].filter(idx => board[idx] === null);
    if (corners.length > 0) {
        return corners[Math.floor(Math.random() * corners.length)];
    }

    // 5. Take remaining sides
    const sides = [1, 3, 5, 7].filter(idx => board[idx] === null);
    if (sides.length > 0) {
        return sides[Math.floor(Math.random() * sides.length)];
    }

    return board.findIndex(cell => cell === null);
}

function renderTttRows(board, isEnded = false, winningCombo = []) {
    const e = config.emojis || {};
    const rows = [];
    for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            const val = board[idx];
            const btn = new ButtonBuilder().setCustomId(`ttt_${idx}`);

            if (val === 'X') {
                if (e.harm_cross) {
                    btn.setEmoji(e.harm_cross);
                } else {
                    btn.setLabel('x');
                }
                btn.setStyle(winningCombo.includes(idx) ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(true);
            } else if (val === 'O') {
                if (e.harm_circle) {
                    btn.setEmoji(e.harm_circle);
                } else {
                    btn.setLabel('o');
                }
                btn.setStyle(winningCombo.includes(idx) ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(true);
            } else {
                btn.setLabel('—')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(isEnded);
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

// ─────────────────────────────────────────────────────────────
// 2. CONNECT FOUR ENGINE (6 rows x 7 cols)
// ─────────────────────────────────────────────────────────────

function createC4Board() {
    return Array.from({ length: 6 }, () => Array(7).fill(null));
}

function dropC4Token(board, col, symbol) {
    if (col < 0 || col > 6) return -1;
    for (let row = 5; row >= 0; row--) {
        if (board[row][col] === null) {
            board[row][col] = symbol;
            return row;
        }
    }
    return -1; // Column full
}

function checkC4Winner(board) {
    const ROWS = 6;
    const COLS = 7;

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const sym = board[r][c];
            if (sym && sym === board[r][c + 1] && sym === board[r][c + 2] && sym === board[r][c + 3]) {
                return sym;
            }
        }
    }

    // Vertical
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS; c++) {
            const sym = board[r][c];
            if (sym && sym === board[r + 1][c] && sym === board[r + 2][c] && sym === board[r + 3][c]) {
                return sym;
            }
        }
    }

    // Diagonal (down-right)
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const sym = board[r][c];
            if (sym && sym === board[r + 1][c + 1] && sym === board[r + 2][c + 2] && sym === board[r + 3][c + 3]) {
                return sym;
            }
        }
    }

    // Diagonal (down-left)
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 3; c < COLS; c++) {
            const sym = board[r][c];
            if (sym && sym === board[r + 1][c - 1] && sym === board[r + 2][c - 2] && sym === board[r + 3][c - 3]) {
                return sym;
            }
        }
    }

    // Check tie
    if (board[0].every(cell => cell !== null)) {
        return 'tie';
    }

    return null;
}

function getC4AiMove(board, aiSymbol = 'Y') {
    const humanSymbol = aiSymbol === 'Y' ? 'R' : 'Y';

    // 1. Can AI win on this drop?
    for (let c = 0; c < 7; c++) {
        const cloned = board.map(row => [...row]);
        const r = dropC4Token(cloned, c, aiSymbol);
        if (r !== -1 && checkC4Winner(cloned) === aiSymbol) {
            return c;
        }
    }

    // 2. Can Human win on next drop? Block!
    for (let c = 0; c < 7; c++) {
        const cloned = board.map(row => [...row]);
        const r = dropC4Token(cloned, c, humanSymbol);
        if (r !== -1 && checkC4Winner(cloned) === humanSymbol) {
            return c;
        }
    }

    // 3. Priority center columns: 3, 2, 4, 1, 5, 0, 6
    const prefOrder = [3, 2, 4, 1, 5, 0, 6];
    for (const c of prefOrder) {
        if (board[0][c] === null) return c;
    }

    return 0;
}

function renderC4Text(board) {
    const e = config.emojis || {};
    const tokenMap = {
        null: e.harm_dots || '•',
        'R': e.harm_red || '`r`',
        'Y': e.harm_yellow || '`y`'
    };
    const lines = board.map(row => row.map(cell => tokenMap[cell] || '•').join(' '));
    lines.push('`1` `2` `3` `4` `5` `6` `7`');
    return lines.join('\n');
}

function renderC4Buttons(board, isEnded = false) {
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    for (let col = 0; col < 7; col++) {
        const isFull = board[0][col] !== null;
        const btn = new ButtonBuilder()
            .setCustomId(`c4_drop_${col}`)
            .setLabel(`${col + 1}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isEnded || isFull);

        if (col < 4) row1.addComponents(btn);
        else row2.addComponents(btn);
    }

    return [row1, row2];
}

// ─────────────────────────────────────────────────────────────
// 3. ROCK-PAPER-SCISSORS ENGINE
// ─────────────────────────────────────────────────────────────

const RPS_MOVES = ['rock', 'paper', 'scissors'];
const RPS_ICONS = {
    rock: config.emojis?.harm_rock || 'rock',
    paper: config.emojis?.harm_paper || 'paper',
    scissors: config.emojis?.harm_scissors || 'scissors'
};

function determineRpsWinner(m1, m2) {
    if (m1 === m2) return 0; // Tie
    if (
        (m1 === 'rock' && m2 === 'scissors') ||
        (m1 === 'paper' && m2 === 'rock') ||
        (m1 === 'scissors' && m2 === 'paper')
    ) {
        return 1; // P1 wins
    }
    return 2; // P2 wins
}

function renderRpsButtons(isEnded = false, p1Move = null) {
    const e = config.emojis || {};
    const btnRock = new ButtonBuilder()
        .setCustomId('rps_rock')
        .setLabel('rock')
        .setStyle(p1Move === 'rock' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(isEnded);
    if (e.harm_rock) btnRock.setEmoji(e.harm_rock);

    const btnPaper = new ButtonBuilder()
        .setCustomId('rps_paper')
        .setLabel('paper')
        .setStyle(p1Move === 'paper' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(isEnded);
    if (e.harm_paper) btnPaper.setEmoji(e.harm_paper);

    const btnScissors = new ButtonBuilder()
        .setCustomId('rps_scissors')
        .setLabel('scissors')
        .setStyle(p1Move === 'scissors' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(isEnded);
    if (e.harm_scissors) btnScissors.setEmoji(e.harm_scissors);

    const row = new ActionRowBuilder().addComponents(btnRock, btnPaper, btnScissors);
    return [row];
}

// ─────────────────────────────────────────────────────────────
// 4. TRIVIA ENGINE
// ─────────────────────────────────────────────────────────────

const TRIVIA_QUESTIONS = [
    {
        q: 'Which protocol operates on port 443 by default?',
        options: ['HTTPS', 'SSH', 'FTP', 'DNS'],
        answer: 0,
        category: 'technology'
    },
    {
        q: 'What is the chemical symbol for gold?',
        options: ['Au', 'Ag', 'Fe', 'Gd'],
        answer: 0,
        category: 'science'
    },
    {
        q: 'In which year did Minecraft officially release its 1.0 version?',
        options: ['2011', '2009', '2013', '2015'],
        answer: 0,
        category: 'gaming'
    },
    {
        q: 'What is the largest organ in the human body?',
        options: ['Skin', 'Liver', 'Brain', 'Lungs'],
        answer: 0,
        category: 'biology'
    },
    {
        q: 'Which celestial body has the strongest gravitational pull in our solar system?',
        options: ['The Sun', 'Jupiter', 'Saturn', 'Earth'],
        answer: 0,
        category: 'astronomy'
    },
    {
        q: 'Who created the Linux operating system kernel?',
        options: ['Linus Torvalds', 'Steve Wozniak', 'Dennis Ritchie', 'Bill Gates'],
        answer: 0,
        category: 'technology'
    },
    {
        q: 'What is the highest mountain peak above sea level in the world?',
        options: ['Mount Everest', 'K2', 'Kangchenjunga', 'Kilimanjaro'],
        answer: 0,
        category: 'geography'
    },
    {
        q: 'Which video game features the character "Geralt of Rivia"?',
        options: ['The Witcher', 'Dark Souls', 'Elden Ring', 'Skyrim'],
        answer: 0,
        category: 'gaming'
    },
    {
        q: 'What does CPU stand for in computer hardware?',
        options: ['Central Processing Unit', 'Central Power Unit', 'Core Program Utility', 'Compute Process Unit'],
        answer: 0,
        category: 'technology'
    },
    {
        q: 'Which element has the atomic number 1?',
        options: ['Hydrogen', 'Helium', 'Carbon', 'Oxygen'],
        answer: 0,
        category: 'science'
    },
    {
        q: 'In Discord API architecture, which protocol maintains the live gateway connection?',
        options: ['WebSockets', 'HTTP/2', 'WebRTC', 'gRPC'],
        answer: 0,
        category: 'technology'
    },
    {
        q: 'What is the capital city of Japan?',
        options: ['Tokyo', 'Kyoto', 'Osaka', 'Sapporo'],
        answer: 0,
        category: 'geography'
    },
    {
        q: 'Which Studio Ghibli film features the character "No-Face" (Kaonashi)?',
        options: ['Spirited Away', 'Princess Mononoke', "Howl's Moving Castle", 'My Neighbor Totoro'],
        answer: 0,
        category: 'pop culture'
    },
    {
        q: 'What is the speed of light in vacuum approximately?',
        options: ['300,000 km/s', '150,000 km/s', '1,000,000 km/s', '30,000 km/s'],
        answer: 0,
        category: 'physics'
    },
    {
        q: 'Which data structure follows the Last-In, First-Out (LIFO) principle?',
        options: ['Stack', 'Queue', 'Array', 'Linked List'],
        answer: 0,
        category: 'computer science'
    }
];

function getRandomTrivia() {
    const item = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
    const correctText = item.options[item.answer];
    const shuffled = [...item.options].sort(() => Math.random() - 0.5);
    const newAnswerIdx = shuffled.indexOf(correctText);

    return {
        question: item.q,
        options: shuffled,
        answer: newAnswerIdx,
        category: item.category
    };
}

function renderTriviaButtons(options, selectedIdx = null, correctIdx = null, isEnded = false) {
    const letters = ['A', 'B', 'C', 'D'];
    const row = new ActionRowBuilder();

    for (let i = 0; i < options.length; i++) {
        const btn = new ButtonBuilder()
            .setCustomId(`trivia_opt_${i}`)
            .setLabel(`${letters[i]}. ${options[i].slice(0, 75)}`);

        if (isEnded) {
            btn.setDisabled(true);
            if (i === correctIdx) {
                btn.setStyle(ButtonStyle.Primary);
            } else if (i === selectedIdx) {
                btn.setStyle(ButtonStyle.Danger);
            } else {
                btn.setStyle(ButtonStyle.Secondary);
            }
        } else {
            btn.setStyle(ButtonStyle.Secondary);
        }

        row.addComponents(btn);
    }

    return [row];
}

// ─────────────────────────────────────────────────────────────
// 5. MINESWEEPER ENGINE
// ─────────────────────────────────────────────────────────────

function generateMinesweeper(rows = 8, cols = 8, totalMines = 10) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
    let placedMines = 0;

    while (placedMines < totalMines) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);
        if (grid[r][c] !== 'B') {
            grid[r][c] = 'B';
            placedMines++;
        }
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 'B') continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 'B') {
                        count++;
                    }
                }
            }
            grid[r][c] = count;
        }
    }

    const e = config.emojis || {};
    const bombStr = e.harm_bomb || '[x]';
    const displayMap = {
        'B': bombStr,
        0: ' · ',
        1: ' 1 ',
        2: ' 2 ',
        3: ' 3 ',
        4: ' 4 ',
        5: ' 5 ',
        6: ' 6 ',
        7: ' 7 ',
        8: ' 8 '
    };

    return grid.map(row => row.map(cell => `||\`${displayMap[cell] || ' · '}\`||`).join(' ')).join('\n');
}

// ─────────────────────────────────────────────────────────────
// 6. HANGMAN ENGINE
// ─────────────────────────────────────────────────────────────

const HANGMAN_WORDS = [
    { word: 'aesthetic', hint: 'visual design philosophy' },
    { word: 'phantom', hint: 'ghostly unseen presence' },
    { word: 'cyberpunk', hint: 'neon high-tech dystopian subgenre' },
    { word: 'sapphire', hint: 'deep blue precious gemstone' },
    { word: 'velvet', hint: 'rich soft luxury fabric' },
    { word: 'monochrome', hint: 'single color palette' },
    { word: 'symphony', hint: 'elaborate musical composition' },
    { word: 'eclipse', hint: 'obscuring of one celestial body by another' },
    { word: 'solitude', hint: 'state of peaceful seclusion' },
    { word: 'midnight', hint: 'the middle hour of darkness' },
    { word: 'lucid', hint: 'clear and awake consciousness' },
    { word: 'enigma', hint: 'mysterious or puzzling situation' },
    { word: 'cascade', hint: 'succession of stages falling together' },
    { word: 'horizon', hint: 'line where sky and ground meet' },
    { word: 'silhouette', hint: 'dark shape outlined against light' },
    { word: 'serenade', hint: 'music sung under open night air' },
    { word: 'infinity', hint: 'boundless and endless limit' },
    { word: 'crystallize', hint: 'form into a definite rigid structure' }
];

function getRandomHangman() {
    return HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
}

function renderHangmanDisplay(word, guessedLetters) {
    return word.split('').map(letter => {
        if (guessedLetters.has(letter.toLowerCase())) {
            return `\`${letter.toUpperCase()}\``;
        }
        return '`_`';
    }).join(' ');
}

// ─────────────────────────────────────────────────────────────
// 7. WORDLE ENGINE
// ─────────────────────────────────────────────────────────────

const WORDLE_WORDS = [
    'ghost', 'vivid', 'blade', 'cyber', 'night', 'flame', 'pulse',
    'shade', 'toxic', 'cloud', 'frost', 'solar', 'orbit', 'lunar',
    'pixel', 'glitch', 'drift', 'venom', 'prism', 'storm', 'spark',
    'echoes', 'clash', 'flare', 'gleam', 'grail', 'havoc', 'hyper',
    'karma', 'magic', 'mirage', 'mystic', 'nexus', 'noble', 'ozone',
    'rebel', 'relic', 'rider', 'rogue', 'siren', 'skull', 'smoke',
    'space', 'synth', 'umbra', 'vapor', 'viper', 'vortex', 'wraith'
].filter(w => w.length === 5);

function getRandomWordle() {
    return WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
}

function evaluateWordleGuess(secret, guess) {
    const s = secret.toLowerCase();
    const g = guess.toLowerCase();
    const e = config.emojis || {};
    const exactMatch = e.harm_tick || e.tick || '[G]';
    const closeMatch = e.harm_warn || e.warn || '[Y]';
    const noMatch = e.harm_deny || e.cancel || '[X]';

    const result = Array(5).fill(noMatch);
    const secretLetterCounts = {};

    for (let i = 0; i < 5; i++) {
        if (g[i] === s[i]) {
            result[i] = exactMatch;
        } else {
            secretLetterCounts[s[i]] = (secretLetterCounts[s[i]] || 0) + 1;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (result[i] !== exactMatch) {
            const letter = g[i];
            if (secretLetterCounts[letter] && secretLetterCounts[letter] > 0) {
                result[i] = closeMatch;
                secretLetterCounts[letter]--;
            }
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────
// 8. SCRAMBLE ENGINE
// ─────────────────────────────────────────────────────────────

const SCRAMBLE_WORDS = [
    { word: 'district', hint: 'urban zone or division' },
    { word: 'serenity', hint: 'calm and untroubled state' },
    { word: 'frequency', hint: 'rate of vibration or recurrence' },
    { word: 'terminal', hint: 'command line interface console' },
    { word: 'ambience', hint: 'atmospheric mood or character' },
    { word: 'protocol', hint: 'established set of formal rules' },
    { word: 'spectrum', hint: 'continuous range of wavelengths' },
    { word: 'velocity', hint: 'speed of something in given direction' },
    { word: 'harmony', hint: 'congruity of simultaneous notes' },
    { word: 'synthetic', hint: 'artificially assembled product' },
    { word: 'illusion', hint: 'deceptive sensory appearance' },
    { word: 'overload', hint: 'excessive strain on system capacity' }
];

function getRandomScramble() {
    const item = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
    let scrambled = item.word;
    while (scrambled === item.word) {
        scrambled = item.word.split('').sort(() => Math.random() - 0.5).join('');
    }
    return { word: item.word, hint: item.hint, scrambled };
}

module.exports = {
    createTttBoard,
    checkTttWinner,
    getTttAiMove,
    renderTttRows,
    createC4Board,
    dropC4Token,
    checkC4Winner,
    getC4AiMove,
    renderC4Text,
    renderC4Buttons,
    RPS_MOVES,
    RPS_ICONS,
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
};
