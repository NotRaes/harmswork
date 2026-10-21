const { ChannelType, PermissionFlagsBits } = require('discord.js');
const VoiceMasterHelper = require('../structures/utils/helpers/voicemasterhelper.js');

class VoiceStateUpdateEvent {
    constructor(client) {
        this.name = 'voiceStateUpdate';
        this.once = false;
        this.client = client;
    }

    async execute(oldState, newState) {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        if (this.client.music) {
            this.client.music.handleVoiceStateUpdate(oldState, newState);
        }

        const db = this.client.db;
        if (!db) return;

        // Check if voicemaster addon is enabled for this server
        if (typeof db.isAddonEnabled === 'function') {
            const isVMEnabled = db.isAddonEnabled(guild.id, 'voicemaster');
            if (!isVMEnabled) return;
        }

        // 0. Protect counter channel from being joined
        if (newState.channelId && newState.channelId !== oldState.channelId) {
            const setup = await db.getVoiceMasterSetup(guild.id);
            if (setup && setup.counter_channel_id && newState.channelId === setup.counter_channel_id) {
                if (newState.member && !newState.member.user.bot) {
                    await newState.disconnect('active vcs counter channel is unjoinable').catch(() => {});
                    return;
                }
            }
        }

        // 1. User Joined a Channel (Check if J2C)
        if (newState.channelId && newState.channelId !== oldState.channelId) {
            const setup = await db.getVoiceMasterSetup(guild.id);
            if (setup && setup.vc_id === newState.channelId && newState.member) {
                const member = newState.member;

                // Naming template: user custom default name > guild script > default '{user}'s channel'
                let customName = await db.getVCDefaultName(guild.id, member.id);
                let template = customName || setup.script || "{user}'s channel";
                const cleanUser = member.displayName || member.user.username;
                const channelName = template
                    .replace(/\{user\}/gi, cleanUser)
                    .replace(/\{username\}/gi, member.user.username)
                    .slice(0, 100);

                const userLimit = await db.getVCDefaultLimit(guild.id, member.id);
                const channelLimit = (userLimit !== null && userLimit !== undefined && userLimit >= 0) ? userLimit : 0;
                const categoryId = setup.category_id;

                try {
                    const tempVC = await guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildVoice,
                        parent: categoryId || undefined,
                        userLimit: channelLimit,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.Connect,
                                    PermissionFlagsBits.Speak
                                ]
                            },
                            {
                                id: member.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.Connect,
                                    PermissionFlagsBits.Speak,
                                    PermissionFlagsBits.ManageChannels,
                                    PermissionFlagsBits.MoveMembers
                                ]
                            }
                        ]
                    });

                    // Move member into their fresh temporary channel
                    await member.voice.setChannel(tempVC).catch(() => {});

                    // Register temporary channel in database
                    await db.addActiveVC(tempVC.id, member.id, guild.id);

                    // Update live counter channel
                    await VoiceMasterHelper.updateCounter(guild, db);
                } catch (err) {
                    console.error('[VoiceMaster j2c error]:', err.message);
                }
            }
        }

        // 2. User Left a Channel (Cleanup if empty)
        if (oldState.channelId && oldState.channelId !== newState.channelId) {
            const activeVC = await db.getActiveVC(oldState.channelId);
            if (activeVC) {
                let oldChannel = oldState.channel || guild.channels.cache.get(oldState.channelId);
                if (!oldChannel) {
                    oldChannel = await guild.channels.fetch(oldState.channelId).catch(() => null);
                }

                // Check whether any other users are still connected via raw gateway voice states
                let hasOtherUsers = false;
                if (guild.voiceStates?.cache) {
                    if (typeof guild.voiceStates.cache.some === 'function') {
                        hasOtherUsers = guild.voiceStates.cache.some(
                            vs => vs.channelId === oldState.channelId && vs.id !== oldState.id
                        );
                    } else {
                        for (const vs of guild.voiceStates.cache.values()) {
                            if (vs.channelId === oldState.channelId && vs.id !== oldState.id) {
                                hasOtherUsers = true;
                                break;
                            }
                        }
                    }
                }
                const hasMembers = hasOtherUsers || (oldChannel?.members?.size || 0) > 0;

                if (!oldChannel || !hasMembers) {
                    // Grace period: do not delete channels created in the last 15 seconds
                    if (oldChannel && oldChannel.createdTimestamp && (Date.now() - oldChannel.createdTimestamp < 15_000)) {
                        return;
                    }

                    await db.removeActiveVC(oldState.channelId);
                    if (oldChannel) {
                        await oldChannel.delete('VoiceMaster channel empty').catch(() => {});
                    }
                    // Update live counter channel
                    await VoiceMasterHelper.updateCounter(guild, db);
                }
            }
        }
    }
}

module.exports = VoiceStateUpdateEvent;
