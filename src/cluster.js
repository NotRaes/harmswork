const cluster = require('cluster');
const os = require('os');
const path = require('path');
const config = require('./config.js');

const isPrimary = cluster.isPrimary !== undefined ? cluster.isPrimary : cluster.isMaster;

if (isPrimary) {
    if (cluster.setupPrimary) {
        cluster.setupPrimary({ exec: path.resolve(__dirname, 'cluster.js') });
    } else if (cluster.setupMaster) {
        cluster.setupMaster({ exec: path.resolve(__dirname, 'cluster.js') });
    }

    const totalCpus = os.cpus()?.length || 2;
    const requestedClusters = config.clusters || 1;
    const clusterCount = Math.max(1, Math.min(totalCpus, requestedClusters));

    console.log(`\n✦ ────────────────────────────────────────── ✦`);
    console.log(`   harm — hybrid clustering engine`);
    console.log(`   clusters: ${clusterCount} · cpu cores: ${totalCpus} · state: synchronized`);
    console.log(`✦ ────────────────────────────────────────── ✦\n`);

    const workers = new Map();

    for (let i = 0; i < clusterCount; i++) {
        spawnCluster(i, clusterCount);
    }

    function spawnCluster(clusterId, totalClusters) {
        const worker = cluster.fork({
            HARM_CLUSTER_ID: String(clusterId),
            HARM_TOTAL_CLUSTERS: String(totalClusters)
        });

        workers.set(worker.id, { clusterId, worker });
        console.log(`[cluster ${clusterId}] worker process spawned (pid: ${worker.process.pid}).`);

        worker.on('message', (msg) => {
            if (msg?.type === 'broadcast') {
                for (const [, entry] of workers) {
                    if (entry.worker.id !== worker.id) {
                        entry.worker.send(msg);
                    }
                }
            }
        });

        worker.on('exit', (code, signal) => {
            workers.delete(worker.id);
            if (signal === 'SIGTERM' || signal === 'SIGINT') return;

            console.warn(`[cluster ${clusterId}] worker ${worker.process.pid} terminated (${signal || code}). auto-healing in 2.5s...`);
            setTimeout(() => {
                spawnCluster(clusterId, totalClusters);
            }, 2500);
        });
    }

    const shutdown = () => {
        console.log('\n[cluster] stopping all cluster workers gracefully...');
        for (const [, entry] of workers) {
            try { entry.worker.process.kill('SIGTERM'); } catch (_) {}
        }
        setTimeout(() => process.exit(0), 1500);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

} else {
    // ──────────────────────── WORKER CLUSTER PROCESS ────────────────────────
    const { harm } = require('./structures/harm');
    const clusterId = Number(process.env.HARM_CLUSTER_ID || 0);
    const totalClusters = Number(process.env.HARM_TOTAL_CLUSTERS || 1);

    const bot = new harm(config);
    bot.clusterId = clusterId;
    bot.totalClusters = totalClusters;

    if (process.send) {
        process.on('message', (msg) => {
            if (msg?.channel && bot.client?.state) {
                bot.client.state.emit(msg.channel, msg.data);
            }
        });
    }

    bot.init().catch(err => {
        console.error(`[cluster ${clusterId} init error]:`, err);
        process.exit(1);
    });
}
