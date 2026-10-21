/**
 * Harm — Leveling Helper
 * Math algorithms, formulas, and progress calculations.
 */

class LevelingHelper {
    /**
     * Calculates the XP needed to go from level L to level L+1.
     * Formula: 25 * L^2 + 175 * L + 300
     * Buffed curve: makes early levels earned and higher levels prestigous.
     */
    static getXpForLevel(level) {
        const l = Math.max(0, Math.floor(level || 0));
        return 25 * (l ** 2) + (175 * l) + 300;
    }

    /**
     * Calculates the cumulative total XP required from 0 to reach level L.
     */
    static getTotalXpForLevel(level) {
        const target = Math.max(0, Math.floor(level || 0));
        let total = 0;
        for (let i = 0; i < target; i++) {
            total += LevelingHelper.getXpForLevel(i);
        }
        return total;
    }

    /**
     * Given a user's total cumulative XP, returns their current level and remaining XP.
     */
    static getLevelFromTotalXp(totalXp) {
        let xp = Math.max(0, Math.floor(totalXp || 0));
        let level = 0;

        while (true) {
            const needed = LevelingHelper.getXpForLevel(level);
            if (xp >= needed) {
                xp -= needed;
                level++;
            } else {
                break;
            }
        }

        return {
            level,
            currentLevelXp: xp,
            nextLevelRequiredXp: LevelingHelper.getXpForLevel(level)
        };
    }

    /**
     * Formats detailed progress metrics for cards and text displays.
     */
    static calculateLevelProgress(totalXp) {
        const { level, currentLevelXp, nextLevelRequiredXp } = LevelingHelper.getLevelFromTotalXp(totalXp);
        const progressRatio = nextLevelRequiredXp > 0 ? Math.min(1, Math.max(0, currentLevelXp / nextLevelRequiredXp)) : 0;
        const percentage = Math.floor(progressRatio * 100);

        return {
            level,
            currentLevelXp,
            nextLevelRequiredXp,
            progressRatio,
            percentage,
            totalXp: Math.max(0, Math.floor(totalXp || 0))
        };
    }

    /**
     * Formats seconds into human-readable calm text (e.g. 2.5h, 45m, 12s).
     */
    static formatVoiceTime(seconds) {
        const s = Math.max(0, Math.floor(seconds || 0));
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = (s / 3600).toFixed(1);
        return `${h}h`;
    }
}

module.exports = LevelingHelper;
