const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class CanvasWorkerPool {
    constructor() {
        this.workers = [];
        this.queue = [];
        this.pending = new Map();
        this.taskId = 1;
        this.workerPath = path.join(__dirname, 'canvasworker.js');
        this.poolSize = Math.max(2, Math.min(4, os.cpus()?.length || 2));
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        for (let i = 0; i < this.poolSize; i++) {
            this._spawnWorker(i);
        }
    }

    _spawnWorker(index) {
        try {
            const worker = new Worker(this.workerPath);
            const workerEntry = { id: index, worker, busy: false };

            worker.on('message', (msg) => {
                const { id, success, buffer, error } = msg;
                const resolver = this.pending.get(id);
                if (resolver) {
                    this.pending.delete(id);
                    if (success && buffer) {
                        resolver.resolve(Buffer.from(buffer));
                    } else {
                        resolver.reject(new Error(error || 'canvas worker failed'));
                    }
                }
                workerEntry.busy = false;
                this._processQueue();
            });

            worker.on('error', (err) => {
                console.error(`[canvas worker ${index} error]:`, err.message);
                this._respawn(workerEntry);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    this._respawn(workerEntry);
                }
            });

            this.workers[index] = workerEntry;
        } catch (err) {
            console.error(`[canvas worker pool] failed to spawn worker ${index}:`, err.message);
        }
    }

    _respawn(entry) {
        try { entry.worker.terminate(); } catch (_) {}
        const idx = entry.id;
        setTimeout(() => this._spawnWorker(idx), 500);
    }

    _processQueue() {
        if (this.queue.length === 0) return;
        const availableWorker = this.workers.find(w => w && !w.busy);
        if (!availableWorker) return;

        const nextTask = this.queue.shift();
        availableWorker.busy = true;
        availableWorker.worker.postMessage(nextTask);
    }

    async render(type, payload) {
        if (!this.initialized) {
            this.init();
        }

        // If no workers spawned (e.g. environment restrictions), fallback to in-process execution
        if (this.workers.length === 0) {
            return this._fallbackRender(type, payload);
        }

        const id = this.taskId++;
        const task = { id, type, payload };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    // On timeout, attempt inline render fallback
                    this._fallbackRender(type, payload).then(resolve).catch(reject);
                }
            }, 10000);

            this.pending.set(id, {
                resolve: (buf) => {
                    clearTimeout(timeout);
                    resolve(buf);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    // On worker error, attempt inline render fallback
                    this._fallbackRender(type, payload).then(resolve).catch(() => reject(err));
                }
            });

            this.queue.push(task);
            this._processQueue();
        });
    }

    async _fallbackRender(type, payload) {
        if (type === 'ship') {
            const { renderShipCard } = require('../helpers/ship.js');
            return renderShipCard(payload, true);
        } else if (type === 'fakemessage') {
            const { renderFakeMessage } = require('../helpers/fakemessage.js');
            return renderFakeMessage(payload, true);
        } else if (type === 'quote') {
            const { renderQuote } = require('../helpers/quote.js');
            return renderQuote(payload, true);
        }
        throw new Error(`unknown canvas task: ${type}`);
    }

    terminate() {
        for (const w of this.workers) {
            if (w && w.worker) {
                try { w.worker.terminate(); } catch (_) {}
            }
        }
        this.workers = [];
        this.initialized = false;
    }
}

const pool = new CanvasWorkerPool();

module.exports = pool;
