const config = require('../../../config.js');

class ReminderWorker {
    static start(client) {
        const interval = setInterval(async () => {
            if (!client.isReady() || !client.db) return;

            try {
                const due = await client.db.getDueReminders();
                if (!due || due.length === 0) return;

                const bell = config.emojis?.harm_bell || '<:harm_bell:1559895594175172608>';

                for (const rem of due) {
                    await client.db.deleteReminderById(rem.id);

                    const notice = `${bell} <@${rem.user_id}>**:** you asked to be reminded: **${rem.reason}**\n-# reminder set <t:${Math.floor(rem.created_at / 1000)}:R>`;

                    let delivered = false;
                    if (rem.channel_id) {
                        try {
                            const channel = client.channels.cache.get(rem.channel_id) || await client.channels.fetch(rem.channel_id).catch(() => null);
                            if (channel && channel.isTextBased()) {
                                await channel.send({ content: notice }).catch(() => {});
                                delivered = true;
                            }
                        } catch (_) {}
                    }

                    if (!delivered) {
                        try {
                            const user = client.users.cache.get(rem.user_id) || await client.users.fetch(rem.user_id).catch(() => null);
                            if (user) {
                                await user.send({ content: notice }).catch(() => {});
                            }
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        }, 5000);

        return interval;
    }
}

module.exports = ReminderWorker;
