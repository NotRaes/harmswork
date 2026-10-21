const build = require('../../structures/utils/builder.js');

class SqlCommand {
    constructor() {
        this.name = 'sql';
        this.aliases = ['query', 'sqlite'];
        this.description = 'execute a direct sql query on the internal database.';
        this.syntax = ',sql <query>';
        this.example = ',sql SELECT name FROM sqlite_master WHERE type="table"';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 1;
    }

    async execute(message, args) {
        if (!args.length) {
            return message.reply({ embeds: [build.warn(message.author, 'syntax: `,sql <query>`')] });
        }

        const query = args.join(' ').trim();
        const db = message.client.db;
        if (!db || !db.db) {
            return message.reply({ embeds: [build.deny(message.author, 'database connection is not available.')] });
        }

        try {
            const raw = db.db;
            let rows;
            const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(query);

            if (isSelect) {
                if (typeof raw.all === 'function') {
                    rows = await raw.all(query);
                } else if (typeof raw.prepare === 'function') {
                    rows = raw.prepare(query).all();
                } else {
                    rows = await raw.all(query);
                }
            } else {
                if (typeof raw.run === 'function') {
                    rows = await raw.run(query);
                } else if (typeof raw.prepare === 'function') {
                    rows = raw.prepare(query).run();
                } else {
                    rows = await raw.run(query);
                }
            }

            const formatted = JSON.stringify(rows, null, 2);
            if (formatted.length > 1900) {
                return message.reply({
                    content: `\`\`\`json\n${formatted.slice(0, 1880)}...\n\`\`\`\n-# truncated result`
                });
            }

            return message.reply({
                content: `\`\`\`json\n${formatted || '[]'}\n\`\`\``
            });
        } catch (err) {
            return message.reply({ embeds: [build.deny(message.author, `sql error: ${err.message}`)] });
        }
    }
}

module.exports = SqlCommand;
