const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');
const LevelingHelper = require('./levelinghelper.js');

// Register Harm custom typography
const fontsDir = path.resolve(__dirname, '../assets/fonts');
try {
    if (fs.existsSync(path.join(fontsDir, 'inter.ttf'))) {
        GlobalFonts.registerFromPath(path.join(fontsDir, 'inter.ttf'), 'Inter');
    }
    if (fs.existsSync(path.join(fontsDir, 'cinzel.ttf'))) {
        GlobalFonts.registerFromPath(path.join(fontsDir, 'cinzel.ttf'), 'Cinzel');
    }
    if (fs.existsSync(path.join(fontsDir, 'montserrat.ttf'))) {
        GlobalFonts.registerFromPath(path.join(fontsDir, 'montserrat.ttf'), 'Montserrat');
    }
    if (fs.existsSync(path.join(fontsDir, 'jetbrainsmono.ttf'))) {
        GlobalFonts.registerFromPath(path.join(fontsDir, 'jetbrainsmono.ttf'), 'JetBrainsMono');
    }
} catch (_) {}

// Banner path resolver
function getTrueBaseBannerPath() {
    const candidates = [
        path.resolve(__dirname, '../assets/banners/_true_base.png'),
        path.resolve(__dirname, '../../assets/banners/_true_base.png'),
        path.resolve(__dirname, '../../../assets/banners/_true_base.png')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

class LevelingCard {
    /**
     * Renders an authentic Harm dark-mode Kyoto aesthetic rank card.
     * 
     * @param {object} options
     * @param {object} options.user - Discord User object
     * @param {object} options.member - Discord GuildMember object (optional)
     * @param {number} options.level - User current level
     * @param {number} options.totalXp - User total cumulative XP
     * @param {number} options.rank - Server rank position (#1, #2...)
     * @param {number} options.messages - Total messages sent
     * @param {number} options.voiceSeconds - Total voice seconds
     * @param {string} options.status - Presence status ('online'|'idle'|'dnd'|'offline')
     */
    static async render({ user, member, level, totalXp, rank, messages = 0, voiceSeconds = 0, status = 'offline' }) {
        const width = 900;
        const height = 280;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const progress = LevelingHelper.calculateLevelProgress(totalXp);
        const currentLevel = level !== undefined && level !== null ? level : progress.level;
        const currentXp = progress.currentLevelXp;
        const neededXp = progress.nextLevelRequiredXp;
        const ratio = progress.progressRatio;
        const percent = progress.percentage;
        const voiceStr = LevelingHelper.formatVoiceTime(voiceSeconds);

        // 1. Base card container with rounded corners
        drawRoundedRect(ctx, 0, 0, width, height, 18);
        ctx.fillStyle = '#0A0A0C';
        ctx.fill();

        // Save clip to maintain rounded borders
        ctx.save();
        drawRoundedRect(ctx, 0, 0, width, height, 18);
        ctx.clip();

        // 2. Atmospheric Harm Hero Glow Background
        const bannerPath = getTrueBaseBannerPath();
        if (bannerPath) {
            try {
                const bannerImg = await loadImage(bannerPath);
                ctx.save();
                ctx.globalAlpha = 0.35;
                ctx.drawImage(bannerImg, 0, 0, width, height);
                ctx.restore();
            } catch (_) {}
        }

        // Subtle gradient vignette across base
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, 'rgba(10, 10, 12, 0.4)');
        grad.addColorStop(1, 'rgba(10, 10, 12, 0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Subtle background grid lines for tactical depth
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        for (let x = 40; x < width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // 3. User Avatar with presence badge
        const avatarX = 115;
        const avatarY = 140;
        const avatarRadius = 65;

        // Avatar outer accent ring
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#2b2d31';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw Avatar image
        const avatarUrl = user.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 256 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
        let avatarImg = null;
        try {
            avatarImg = await loadImage(avatarUrl);
        } catch (_) {}

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (avatarImg) {
            ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        } else {
            ctx.fillStyle = '#1c1d22';
            ctx.fillRect(avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        }
        ctx.restore();

        // Presence Status Dot (Bottom-Right of Avatar)
        const statusColors = {
            online: '#23a55a',
            idle: '#f0b232',
            dnd: '#f23f43',
            offline: '#80848e'
        };
        const dotColor = statusColors[status.toLowerCase()] || statusColors.offline;
        const dotX = avatarX + 44;
        const dotY = avatarY + 44;
        const dotRadius = 13;

        // Dark ring around status dot
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius + 3, 0, Math.PI * 2);
        ctx.fillStyle = '#0A0A0C';
        ctx.fill();

        // Status dot fill
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // 4. User Typography & Info (Summit Area)
        const contentX = 220;
        const displayName = (user.globalName || member?.displayName || user.username || 'user').toLowerCase();
        const username = user.username ? user.username.toLowerCase() : 'user';

        // Display Name (bold, clean)
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // Truncate display name if too long
        let printName = displayName;
        if (ctx.measureText(printName).width > 340) {
            while (ctx.measureText(printName + '...').width > 340 && printName.length > 0) {
                printName = printName.slice(0, -1);
            }
            printName += '...';
        }
        ctx.fillText(printName, contentX, 60);

        // Subtext (@username)
        ctx.font = '15px Inter, sans-serif';
        ctx.fillStyle = '#80848e';
        ctx.fillText(`@${username}`, contentX, 90);

        // 5. Summit Metrics (Rank & Level on Right)
        const rankText = `#${rank || 1}`;
        const levelNum = `${currentLevel}`;

        // "LEVEL" and value
        ctx.textAlign = 'right';
        ctx.font = 'bold 36px Cinzel, Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(levelNum, width - 40, 58);

        const levelNumWidth = ctx.measureText(levelNum).width;
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillStyle = '#a0a0ab';
        ctx.fillText('LEVEL', width - 46 - levelNumWidth, 55);

        // "RANK" and value
        const rankX = width - 70 - levelNumWidth - ctx.measureText('LEVEL').width;
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(rankText, rankX, 58);

        const rankValWidth = ctx.measureText(rankText).width;
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillStyle = '#80848e';
        ctx.fillText('RANK', rankX - rankValWidth - 8, 55);

        // 6. Progress Bar Section
        const barX = contentX;
        const barY = 145;
        const barWidth = width - contentX - 40;
        const barHeight = 16;
        const barRadius = 8;

        // Progress Text directly above the bar
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillStyle = '#80848e';
        ctx.fillText('PROGRESS', barX, barY - 14);

        ctx.textAlign = 'right';
        ctx.font = '14px JetBrainsMono, Inter, monospace';
        ctx.fillStyle = '#e0e0e6';
        ctx.fillText(`${currentXp.toLocaleString()} / ${neededXp.toLocaleString()} XP (${percent}%)`, barX + barWidth, barY - 14);

        // Progress Track Background
        drawRoundedRect(ctx, barX, barY, barWidth, barHeight, barRadius);
        ctx.fillStyle = '#18191d';
        ctx.fill();

        // Progress Fill with subtle gradient
        const fillWidth = Math.max(barRadius * 2, Math.floor(barWidth * ratio));
        drawRoundedRect(ctx, barX, barY, fillWidth, barHeight, barRadius);
        
        const fillGrad = ctx.createLinearGradient(barX, 0, barX + fillWidth, 0);
        fillGrad.addColorStop(0, '#4f545c');
        fillGrad.addColorStop(0.5, '#72767d');
        fillGrad.addColorStop(1, '#ffffff');
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // 7. Base Activity Badges
        const badgeY = 195;
        const badges = [
            `${messages.toLocaleString()} msgs`,
            `${voiceStr} voice`,
            `✦ ${totalXp.toLocaleString()} total xp`
        ];

        let curBadgeX = contentX;
        ctx.font = '13px Inter, sans-serif';
        ctx.textBaseline = 'middle';

        for (const b of badges) {
            const bWidth = ctx.measureText(b).width + 24;
            const bHeight = 32;

            // Pill background
            drawRoundedRect(ctx, curBadgeX, badgeY, bWidth, bHeight, 8);
            ctx.fillStyle = '#121316';
            ctx.fill();

            // Pill border
            ctx.strokeStyle = '#232428';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Pill text
            ctx.textAlign = 'left';
            ctx.fillStyle = '#a0a0ab';
            ctx.fillText(b, curBadgeX + 12, badgeY + (bHeight / 2));

            curBadgeX += bWidth + 12;
        }

        ctx.restore();

        // 8. Outer 4-sided outline stroke (Harm signature `#2b2d31`)
        drawRoundedRect(ctx, 0.75, 0.75, width - 1.5, height - 1.5, 18);
        ctx.strokeStyle = '#2b2d31';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        return canvas.toBuffer('image/png');
    }
}

module.exports = LevelingCard;
