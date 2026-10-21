const GiveawayHelper = require('../structures/utils/helpers/giveaway.js');
const VoiceMasterHelper = require('../structures/utils/helpers/voicemasterhelper.js');

class InteractionCreateEvent {
    constructor(client) {
        this.name = 'interactionCreate';
        this.once = false;
        this.client = client;
    }

    async execute(interaction) {
        if (!interaction) return;

        const customId = interaction.customId || '';

        // VoiceMaster buttons, modals, and user select menus
        if (customId.startsWith('vm_')) {
            return await VoiceMasterHelper.handleInteraction(interaction);
        }

        // Music Controller Buttons
        if (customId.startsWith('music_')) {
            if (this.client.music) {
                return await this.client.music.handleInteraction(interaction);
            }
        }

        // Button interactions
        if (interaction.isButton()) {
            // Giveaway Buttons
            if (customId.startsWith('gw_enter_') || customId.startsWith('gw_view_') || customId.startsWith('gw_ent_')) {
                return await GiveawayHelper.handleInteraction(interaction);
            }
        }
    }
}

module.exports = InteractionCreateEvent;
