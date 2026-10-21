const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');
const GIFEncoder = require('gifencoder');

// Theme Color Palettes matching Discord's exact UI
const THEMES = {
    dark: {
        bg: '#313338',
        mentionBg: '#3c3520',
        mentionBar: '#f0b232',
        nameColor: '#f2f3f5',
        textColor: '#dbdee1',
        timeColor: '#949ba4',
        badgeBg: '#2b2d31',
        badgeBorder: '#3b3e45',
        badgeText: '#b5bac1',
        reactionBg: '#2b2d31',
        reactionBorder: '#35373c',
        reactionText: '#b5bac1',
        starColor: '#b5bac1'
    },
    ash: {
        bg: '#27272a',
        mentionBg: '#353322',
        mentionBar: '#f0b232',
        nameColor: '#f2f3f5',
        textColor: '#dbdee1',
        timeColor: '#949ba4',
        badgeBg: '#1e1e21',
        badgeBorder: '#333338',
        badgeText: '#b5bac1',
        reactionBg: '#1e1e21',
        reactionBorder: '#2e2e33',
        reactionText: '#b5bac1',
        starColor: '#b5bac1'
    },
    onyx: {
        bg: '#1e1f22',
        mentionBg: '#2c2a1c',
        mentionBar: '#f0b232',
        nameColor: '#f2f3f5',
        textColor: '#dbdee1',
        timeColor: '#949ba4',
        badgeBg: '#141517',
        badgeBorder: '#2b2d31',
        badgeText: '#b5bac1',
        reactionBg: '#2b2d31',
        reactionBorder: '#35373c',
        reactionText: '#b5bac1',
        starColor: '#b5bac1'
    },
    black: {
        bg: '#000000',
        mentionBg: '#1c1b10',
        mentionBar: '#f0b232',
        nameColor: '#ffffff',
        textColor: '#dbdee1',
        timeColor: '#80848e',
        badgeBg: '#111214',
        badgeBorder: '#232428',
        badgeText: '#b5bac1',
        reactionBg: '#111214',
        reactionBorder: '#232428',
        reactionText: '#b5bac1',
        starColor: '#80848e'
    },
    light: {
        bg: '#ffffff',
        mentionBg: '#fff9ec',
        mentionBar: '#e5a100',
        nameColor: '#060607',
        textColor: '#2e3338',
        timeColor: '#5c5f66',
        badgeBg: '#e3e5e8',
        badgeBorder: '#d1d3d6',
        badgeText: '#4e5058',
        reactionBg: '#f2f3f5',
        reactionBorder: '#e3e5e8',
        reactionText: '#4e5058',
        starColor: '#5c5f66'
    }
};

const FONT_MAP = {
    'gg sans': 'gg sans',
    'tempo': 'Tempo',
    'sakura': 'Sakura',
    'jellybean': 'Jellybean',
    'modern': 'Modern',
    'medieval': 'Medieval',
    '8bit': '8Bit',
    'vampyre': 'Vampyre'
};

let fontsLoaded = false;
function loadFonts() {
    if (fontsLoaded) return;
    const fontDir = path.join(__dirname, '../assets/fonts');

    const files = {
        'gg sans': 'gg_sans.ttf',
        'Tempo': 'Tempo.ttf',
        'Sakura': 'Sakura.ttf',
        'Jellybean': 'Jellybean.ttf',
        'Modern': 'Modern.ttf',
        'Medieval': 'Medieval.ttf',
        '8Bit': '8Bit.ttf',
        'Vampyre': 'Vampyre.ttf'
    };

    for (const [name, file] of Object.entries(files)) {
        const fullPath = path.join(fontDir, file);
        if (fs.existsSync(fullPath)) {
            try {
                GlobalFonts.registerFromPath(fullPath, name);
            } catch (err) {
                console.warn(`[Font Loader] Failed to register font ${name}:`, err.message);
            }
        }
    }
    fontsLoaded = true;
}

function roundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function formatTimestamp(customTimestamp) {
    if (customTimestamp && customTimestamp.trim().length > 0) {
        return customTimestamp.trim();
    }
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `Today at ${hours}:${minutes} ${ampm}`;
}

function wrapText(ctx, text, maxWidth) {
    const lines = [];
    const rawParagraphs = text.split('\n');

    for (const paragraph of rawParagraphs) {
        if (paragraph.trim() === '') {
            lines.push('');
            continue;
        }

        const words = paragraph.split(' ');
        let currentLine = '';

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
    }

    return lines;
}

function parseReactions(reactionStr) {
    if (!reactionStr || typeof reactionStr !== 'string') return [];
    
    // Split by comma or space
    const items = reactionStr.trim().split(/[\s,]+/);
    const results = [];

    for (const item of items) {
        if (!item) continue;
        const parts = item.split(':');
        if (parts.length >= 2 && !isNaN(parseInt(parts[parts.length - 1], 10))) {
            const count = parseInt(parts.pop(), 10);
            const emoji = parts.join(':');
            results.push({ emoji: emoji || config.emojis?.harm || '', count });
        } else {
            results.push({ emoji: item, count: 1 });
        }
    }
    return results.slice(0, 6); // Max 6 reaction pills
}

async function renderFakeMessage(options = {}) {
    loadFonts();

    const text = options.text || '...';
    const rawUser = options.user || {};
    const themeKey = (options.theme || 'dark').toLowerCase();
    const theme = THEMES[themeKey] || THEMES.dark;
    
    const fontKey = (options.display_font || 'gg sans').toLowerCase();
    const displayNameFont = FONT_MAP[fontKey] || 'gg sans';

    const useUsername = Boolean(options.use_username);
    const hideClanTags = Boolean(options.hide_clantags);
    const mentionHighlight = Boolean(options.mention_highlight);
    const toGif = Boolean(options.togif);

    // User details
    const displayName = (useUsername ? (rawUser.username || 'User') : (rawUser.displayName || rawUser.globalName || rawUser.username || 'User'));
    const roleColor = rawUser.roleColor || null;
    const clanTag = !hideClanTags && rawUser.clanTag ? String(rawUser.clanTag) : null;
    const timestamp = formatTimestamp(options.timestamp);

    // Canvas dimensions
    const width = 680;
    const avatarSize = 46;
    const avatarX = 20;
    const avatarY = 18;

    const contentX = 78;
    const contentMaxWidth = width - contentX - 25;

    // Measure Text
    const dummyCanvas = createCanvas(width, 200);
    const dummyCtx = dummyCanvas.getContext('2d');
    dummyCtx.font = '15px "gg sans", "Segoe UI", Arial, sans-serif';
    const lines = wrapText(dummyCtx, text, contentMaxWidth);

    const lineHeight = 22;
    const textBlockHeight = Math.max(lines.length * lineHeight, 22);

    // Calculate height
    let totalHeight = 18 + 22 + textBlockHeight + 16; // top pad + header + text + bottom pad

    // Attachment
    let loadedAttachment = null;
    let attachmentWidth = 0;
    let attachmentHeight = 0;
    if (options.image) {
        try {
            loadedAttachment = await loadImage(options.image);
            const maxAttachW = 420;
            const maxAttachH = 260;
            const ratio = Math.min(maxAttachW / loadedAttachment.width, maxAttachH / loadedAttachment.height, 1);
            attachmentWidth = Math.round(loadedAttachment.width * ratio);
            attachmentHeight = Math.round(loadedAttachment.height * ratio);
            totalHeight += attachmentHeight + 12;
        } catch (e) {
            console.warn('[FakeMessage] Could not load attachment:', e.message);
        }
    }

    // Reactions
    const reactions = parseReactions(options.reactions);
    let reactionsHeight = 0;
    if (reactions.length > 0) {
        reactionsHeight = 36;
        totalHeight += reactionsHeight;
    }

    // Min height 86px for avatar balance
    totalHeight = Math.max(totalHeight, 86);

    // Load Avatar
    let avatarImg = null;
    if (rawUser.avatarURL) {
        try {
            avatarImg = await loadImage(rawUser.avatarURL);
        } catch (e) {
            console.warn('[FakeMessage] Could not load avatar image:', e.message);
        }
    }

    // Function to draw one static frame
    function drawFrame(ctx) {
        // 1. Background
        ctx.fillStyle = mentionHighlight ? theme.mentionBg : theme.bg;
        roundRect(ctx, 0, 0, width, totalHeight, 8);
        ctx.fill();

        // 2. Mention bar on left edge
        if (mentionHighlight) {
            ctx.fillStyle = theme.mentionBar;
            roundRect(ctx, 0, 0, 3, totalHeight, 2);
            ctx.fill();
        }

        // 3. Avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (avatarImg) {
            ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        } else {
            // Fallback Discord avatar
            ctx.fillStyle = '#5865F2';
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px "gg sans", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayName.charAt(0).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2);
        }
        ctx.restore();

        // 4. Header (Display Name, Clan Tag / Badge, Timestamp)
        ctx.textBaseline = 'alphabetic';
        let currentHeaderX = contentX;
        const headerY = avatarY + 16;

        // Display Name
        ctx.font = `bold 16px "${displayNameFont}", "gg sans", sans-serif`;
        ctx.fillStyle = roleColor || theme.nameColor;
        ctx.fillText(displayName, currentHeaderX, headerY);
        const nameWidth = ctx.measureText(displayName).width;
        currentHeaderX += nameWidth + 8;

        // Clan Tag / Badge
        if (clanTag) {
            const badgeText = clanTag;
            ctx.font = 'bold 11px "gg sans", sans-serif';
            const badgeTextWidth = ctx.measureText(badgeText).width;
            const badgeW = badgeTextWidth + 10;
            const badgeH = 16;
            const badgeY = headerY - 12;

            ctx.fillStyle = theme.badgeBg;
            roundRect(ctx, currentHeaderX, badgeY, badgeW, badgeH, 4);
            ctx.fill();

            ctx.strokeStyle = theme.badgeBorder;
            ctx.lineWidth = 1;
            roundRect(ctx, currentHeaderX, badgeY, badgeW, badgeH, 4);
            ctx.stroke();

            ctx.fillStyle = theme.badgeText;
            ctx.fillText(badgeText, currentHeaderX + 5, headerY);
            currentHeaderX += badgeW + 8;
        }

        // Timestamp
        ctx.font = '12px "gg sans", Arial, sans-serif';
        ctx.fillStyle = theme.timeColor;
        ctx.fillText(timestamp, currentHeaderX, headerY);

        // 5. Message Content Lines
        ctx.font = '15px "gg sans", Arial, sans-serif';
        ctx.fillStyle = theme.textColor;
        let lineY = headerY + 22;

        for (const line of lines) {
            if (line.trim() !== '') {
                // Support mention styling in text (e.g. @someone)
                const tokens = line.split(/(@\S+)/g);
                let currentLineX = contentX;

                for (const token of tokens) {
                    if (token.startsWith('@')) {
                        ctx.font = '500 15px "gg sans", Arial, sans-serif';
                        const tokenWidth = ctx.measureText(token).width;

                        // Mention pill background
                        ctx.fillStyle = 'rgba(88, 101, 242, 0.2)';
                        roundRect(ctx, currentLineX - 2, lineY - 14, tokenWidth + 4, 18, 3);
                        ctx.fill();

                        // Mention text
                        ctx.fillStyle = '#c9cdfb';
                        ctx.fillText(token, currentLineX, lineY);
                        ctx.fillStyle = theme.textColor;
                        currentLineX += tokenWidth;
                    } else {
                        ctx.font = '15px "gg sans", Arial, sans-serif';
                        ctx.fillText(token, currentLineX, lineY);
                        currentLineX += ctx.measureText(token).width;
                    }
                }
            }
            lineY += lineHeight;
        }

        // 6. Attachment Image (if any)
        let attachBottomY = lineY - lineHeight + 8;
        if (loadedAttachment) {
            ctx.save();
            roundRect(ctx, contentX, attachBottomY, attachmentWidth, attachmentHeight, 8);
            ctx.clip();
            ctx.drawImage(loadedAttachment, contentX, attachBottomY, attachmentWidth, attachmentHeight);
            ctx.restore();
            attachBottomY += attachmentHeight + 10;
        }

        // 7. Reactions
        if (reactions.length > 0) {
            let rx = contentX;
            const ry = (loadedAttachment ? attachBottomY : lineY - 4);
            const rHeight = 26;

            for (const react of reactions) {
                ctx.font = '13px "gg sans", "Segoe UI Emoji", Arial, sans-serif';
                const countText = String(react.count);
                const emojiText = react.emoji;
                const pillWidth = 28 + ctx.measureText(countText).width + 12;

                // Pill background
                ctx.fillStyle = theme.reactionBg;
                roundRect(ctx, rx, ry, pillWidth, rHeight, 8);
                ctx.fill();

                // Pill border
                ctx.strokeStyle = theme.reactionBorder;
                ctx.lineWidth = 1;
                roundRect(ctx, rx, ry, pillWidth, rHeight, 8);
                ctx.stroke();

                // Emoji
                ctx.font = '15px "Segoe UI Emoji", "Apple Color Emoji", Arial';
                ctx.fillText(emojiText, rx + 6, ry + 18);

                // Count
                ctx.font = 'bold 12px "gg sans", Arial, sans-serif';
                ctx.fillStyle = theme.reactionText;
                ctx.fillText(countText, rx + 24, ry + 18);

                rx += pillWidth + 6;
            }
        }
    }

    // If toGif requested
    if (toGif) {
        const encoder = new GIFEncoder(width, totalHeight);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(100);
        encoder.setQuality(10);

        const canvas = createCanvas(width, totalHeight);
        const ctx = canvas.getContext('2d');

        // Render 8 frames with subtle pulse
        for (let frame = 0; frame < 8; frame++) {
            ctx.clearRect(0, 0, width, totalHeight);
            drawFrame(ctx);
            encoder.addFrame(ctx);
        }

        encoder.finish();
        return {
            buffer: encoder.out.getData(),
            filename: 'fake_message.gif',
            isGif: true
        };
    }

    // Static PNG
    const canvas = createCanvas(width, totalHeight);
    const ctx = canvas.getContext('2d');
    drawFrame(ctx);

    return {
        buffer: canvas.toBuffer('image/png'),
        filename: 'fake_message.png',
        isGif: false
    };
}

module.exports = {
    renderFakeMessage,
    THEMES,
    FONT_MAP
};
