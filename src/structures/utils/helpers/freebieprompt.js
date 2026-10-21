const {
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    EmbedBuilder
} = require('discord.js');
const build = require('../builder.js');
const config = require('../../../config.js');

function getGiveawaysAttachment() {
    return build.getAssetAttachment('giveaways.png');
}

function buildFreebiePrompt({ client, featureText, title = 'do you like freebies?', note = null, maxUses = 1, featureName = null }) {
    const clientId = client?.user?.id || config.clientId || '1490995846626545674';
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${config.invitePermissions || '1376435694838'}&scope=bot%20applications.commands`;
    const supportUrl = config.supportInvite || 'https://discord.gg/eqwcPU2mfS';
    const botAvatar = client?.user?.displayAvatarURL({ dynamic: true, size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const targetLabel = featureName ? ` of ${featureName}` : '';
    const defaultNote = maxUses === 1
        ? `***__note:__*** you have used your **1/1** free use${targetLabel}. join our **[discord server](${supportUrl})** to unlock unlimited uses!`
        : `***__note:__*** you have used all **${maxUses}/${maxUses}** free uses${targetLabel}. join our **[discord server](${supportUrl})** to unlock unlimited uses!`;
    const noteText = note !== null && note !== undefined ? note : defaultNote;

    const files = [];
    const container = new ContainerBuilder().setAccentColor(0x2b2d31);

    // 1. Giveaways banner
    const gwAttachment = getGiveawaysAttachment();
    if (gwAttachment) {
        files.push(gwAttachment);
        const mediaGallery = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://giveaways.png')
        );
        container.addMediaGalleryComponents(mediaGallery);
    }

    // 2. Divider
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    // 3. Content section (matches giveaways DM layout)
    const contentParts = [
        `### ${title}\n`,
        `we often host **giveaways** and drop exclusive perks on our [**discord**](${supportUrl}).`,
        featureText,
        `don't miss out on **extra goodies**!`
    ];
    if (noteText) {
        contentParts.push(`\n${noteText}`);
    }
    const content = contentParts.filter(Boolean).join('\n');

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(content)
        )
        .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(botAvatar)
        );
    container.addSectionComponents(section);

    // 4. Divider
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    // 5. Action buttons (join discord & invite harm)
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('join discord')
            .setEmoji('<:discord_logo:1529300434374758481>')
            .setURL(supportUrl),
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('invite harm')
            .setEmoji(config.emojis?.harm || '<:harmsdio:1556221836507742278>')
            .setURL(inviteUrl)
    );
    container.addActionRowComponents(row);

    // Fallback embed for environments that don't support Components V2
    const embedDesc = [
        `### ${title}\n`,
        `we often host **giveaways** and drop exclusive perks on our [**discord**](${supportUrl}).`,
        featureText,
        `don't miss out on **extra goodies**!`
    ];
    if (noteText) embedDesc.push(`\n${noteText}`);

    const embed = new EmbedBuilder()
        .setColor(config.colors?.c || 0x2b2d31)
        .setThumbnail(botAvatar)
        .setDescription(embedDesc.filter(Boolean).join('\n'));
    if (gwAttachment) embed.setImage('attachment://giveaways.png');

    return { container, files, row, embed };
}

async function sendFreebiePrompt(message, { featureText, title = 'do you like freebies?', note = null, maxUses = 1, featureName = null }) {
    const { container, files, row, embed } = buildFreebiePrompt({
        client: message.client,
        featureText,
        title,
        note,
        maxUses,
        featureName
    });

    try {
        return await message.reply({
            components: [container],
            files,
            flags: MessageFlags.IsComponentsV2
        });
    } catch {
        return await message.reply({
            embeds: [embed],
            files,
            components: [row]
        });
    }
}

module.exports = {
    buildFreebiePrompt,
    sendFreebiePrompt,
    getGiveawaysAttachment
};
