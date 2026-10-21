const { executeQuoteCommand } = require('../../structures/utils/helpers/quotecommandhelper.js');

class QuoteCommand {
    constructor(bot) {
        this.bot = bot;
        this.name = 'quote';
        this.aliases = ['q'];
        this.description = 'render an aesthetic dark monochrome quote card from a user or replied message.';
        this.syntax = ',quote [@user] [text] or reply with ,quote';
        this.example = ',quote @user hello world\n,quote hio';
        this.category = 'utility';
        this.cooldown = 3;
    }

    async execute(message, args) {
        await executeQuoteCommand(message, args);
    }
}

module.exports = QuoteCommand;
