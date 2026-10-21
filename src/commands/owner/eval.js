const util = require('util');
const build = require('../../structures/utils/builder.js');
const config = require('../../config.js');

class EvalCommand {
    constructor() {
        this.name = 'eval';
        this.aliases = ['ev', 'evaluate'];
        this.description = 'evaluate arbitrary javascript code at runtime.';
        this.syntax = ',eval <code>';
        this.example = ',eval client.guilds.cache.size';
        this.category = 'owner';
        this.ownerOnly = true;
        this.cooldown = 1;
    }

    async execute(message, args) {
        if (!args.length) {
            return message.reply(build.warnBox('missing code', 'provide javascript code to evaluate.'));
        }

        let code = args.join(' ');
        // Strip markdown code fences if provided
        if (code.startsWith('```')) {
            code = code.replace(/^```(?:js|javascript)?\s*/i, '').replace(/\s*```$/, '');
        }

        const client = message.client;
        const db = client.db;
        const state = client.state;

        const start = process.hrtime.bigint();
        let evaled;
        let isError = false;

        try {
            evaled = eval(code);
            if (evaled instanceof Promise) {
                evaled = await evaled;
            }
        } catch (err) {
            evaled = err;
            isError = true;
        }

        const end = process.hrtime.bigint();
        const durationMs = (Number(end - start) / 1_000_000).toFixed(2);

        let output = typeof evaled === 'string' ? evaled : util.inspect(evaled, { depth: 1 });

        // Redact sensitive tokens and secrets
        const tokensToRedact = [
            client.token,
            config.token,
            config.clientSecret
        ].filter(Boolean);

        for (const tok of tokensToRedact) {
            output = output.replaceAll(tok, '[REDACTED_SECRET]');
        }

        if (output.length > 1800) {
            output = output.slice(0, 1800) + '... (truncated)';
        }

        const statusTag = isError ? 'error' : 'output';
        const formatted = `\`\`\`${isError ? 'diff' : 'js'}\n${isError ? '- ' : ''}${output}\n\`\`\`\n-# evaluated in \`${durationMs}ms\``;

        if (isError) {
            return message.reply(build.denyBox(statusTag, formatted));
        }

        return message.reply({
            embeds: [
                new (require('discord.js').EmbedBuilder)()
                    .setColor(config.colors.c || 0x0A0A0C)
                    .setDescription(
                        `### [evaluation ${statusTag}](https://discord.gg/hCQhTmPf2G)\n` +
                        formatted
                    )
            ]
        }).catch(() => {
            message.reply(formatted).catch(() => {});
        });
    }
}

module.exports = EvalCommand;
