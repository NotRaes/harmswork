const fs = require('fs');
const path = require('path');

class DbWorker {
    static getBackupDir() {
        const dir = path.resolve(__dirname, '../data/backups');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Creates an atomic, non-blocking SQLite snapshot via VACUUM INTO.
     * Retains the most recent `maxBackups` (default 7) and prunes older ones.
     */
    static async createBackup(client, maxBackups = 7) {
        if (!client?.db?.db) return null;
        const backupDir = this.getBackupDir();
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const targetFile = path.join(backupDir, `cases-backup-${dateStr}.db`);

        try {
            const t0 = performance.now();
            await client.db.db.run('VACUUM INTO ?', [targetFile]);
            const elapsed = Math.round(performance.now() - t0);
            const sizeBytes = fs.existsSync(targetFile) ? fs.statSync(targetFile).size : 0;
            const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);

            console.log(`[db worker] automated backup created: ${path.basename(targetFile)} (${sizeMb} MB in ${elapsed}ms).`);

            // Prune older backup files exceeding maxBackups
            this.rotateBackups(maxBackups);

            return {
                path: targetFile,
                filename: path.basename(targetFile),
                sizeBytes,
                sizeMb,
                elapsed
            };
        } catch (err) {
            console.error('[db worker] backup failed:', err.message);
            return null;
        }
    }

    /**
     * Keeps the most recent `maxBackups` files, deleting older ones.
     */
    static rotateBackups(maxBackups = 7) {
        try {
            const backupDir = this.getBackupDir();
            const files = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('cases-backup-') && f.endsWith('.db'))
                .map(f => {
                    const fullPath = path.join(backupDir, f);
                    return {
                        name: f,
                        path: fullPath,
                        time: fs.statSync(fullPath).mtimeMs
                    };
                })
                .sort((a, b) => b.time - a.time); // newest first

            if (files.length > maxBackups) {
                const toDelete = files.slice(maxBackups);
                for (const file of toDelete) {
                    try {
                        fs.unlinkSync(file.path);
                        console.log(`[db worker] rotated old backup: ${file.name}`);
                    } catch (_) {}
                }
            }
        } catch (err) {
            console.error('[db worker] error rotating backups:', err.message);
        }
    }

    /**
     * Performs routine database maintenance, WAL truncation, and transient record pruning.
     */
    static async pruneData(client) {
        if (!client?.db?.db) return;
        try {
            // 1. Flush & truncate WAL file to prevent runaway growth
            await client.db.db.run('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => {});

            // 2. Query planner statistics optimization
            await client.db.db.run('PRAGMA optimize;').catch(() => {});

            // 3. Prune music history older than 30 days
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            await client.db.db.run('DELETE FROM music_history WHERE played_at < ?', [thirtyDaysAgo]).catch(() => {});
        } catch (err) {
            console.error('[db worker] maintenance error:', err.message);
        }
    }

    /**
     * Starts the automated background timer.
     * Runs maintenance & backup every 24 hours with an initial run 10s after startup.
     */
    static start(client) {
        // Run initial backup & pruning 10s after boot
        setTimeout(async () => {
            const backupDir = this.getBackupDir();
            const existing = fs.readdirSync(backupDir).filter(f => f.startsWith('cases-backup-'));
            const needInitial = existing.length === 0;

            if (needInitial) {
                console.log('[db worker] no prior backups found. running initial database backup...');
                await this.createBackup(client, 7);
            }
            await this.pruneData(client);
        }, 10_000);

        // Recurring 24-hour cycle
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        return setInterval(async () => {
            console.log('[db worker] running 24-hour scheduled database backup & maintenance cycle...');
            await this.createBackup(client, 7);
            await this.pruneData(client);
        }, TWENTY_FOUR_HOURS);
    }
}

module.exports = DbWorker;
