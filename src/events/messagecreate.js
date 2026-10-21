const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const build = require('../structures/utils/builder.js');

function formatDuration(ms) {
  if (!ms || isNaN(ms) || ms <= 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

class MessageCreateEvent {
  constructor(client) {
    this.name = 'messageCreate';
    this.once = false;
    this.client = client;
    this.xpCooldowns = new Map();
    this.stickyCooldowns = new Map();
  }

  async execute(message) {
    if (!message || !message.author) return;
    if (message.author.id === this.client.user?.id) return;
    if (message.author.bot) return;

    // Troll Locks Interception (uwulock, mocklock, nerdlock, clownlock - In-Memory O(1))
    const db = this.client.db;
    if (message.guild && db && message.content) {
      try {
        if (db.isUwuLocked(message.guild.id, message.author.id)) {
          const { uwuify, sendAsUser } = require('../structures/utils/helpers/modhelper.js');
          const transformed = uwuify(message.content);
          await message.delete().catch(() => {});
          await sendAsUser(message.channel, message.author, transformed, message.member);
          return;
        }

        if (db.isMockLocked(message.guild.id, message.author.id)) {
          const { mockify, sendAsUser } = require('../structures/utils/helpers/modhelper.js');
          const transformed = mockify(message.content);
          await message.delete().catch(() => {});
          await sendAsUser(message.channel, message.author, transformed, message.member);
          return;
        }

        if (db.isNerdLocked(message.guild.id, message.author.id)) {
          const { nerdify, sendAsUser } = require('../structures/utils/helpers/modhelper.js');
          const transformed = nerdify(message.content);
          await message.delete().catch(() => {});
          await sendAsUser(message.channel, message.author, transformed, message.member);
          return;
        }

        if (db.isClownLocked(message.guild.id, message.author.id)) {
          const { clownify, sendAsUser } = require('../structures/utils/helpers/modhelper.js');
          const transformed = clownify(message.content);
          await message.delete().catch(() => {});
          await sendAsUser(message.channel, message.author, transformed, message.member);
          return;
        }
      } catch (_) {}
    }

    // AFK System: check author return & mentions
    if (db && typeof db.getAfk === 'function') {
      const authorAfk = db.getAfk(message.author.id, message.guild?.id);
      const prefix = (message.guild && db.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
      const isAfkCmd = message.content?.trim().toLowerCase().startsWith(`${prefix}afk`);

      if (authorAfk && !isAfkCmd) {
        const rawTime = Number(authorAfk.timestamp);
        const afkTimestamp = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
        if (Date.now() - afkTimestamp > 3500) {
          await db.removeAfk(message.author.id, message.guild?.id);
          const elapsed = Math.max(0, Date.now() - afkTimestamp);
          const timeStr = formatDuration(elapsed);
          message.reply({
            embeds: [build.approved(message.author, `welcome back, i removed your afk. (you were away for **${timeStr}**)`)]
          }).catch(() => {});
        }
      }

      // Check if any mentioned users are AFK
      if (message.mentions?.users?.size > 0 && !message.content?.startsWith(prefix)) {
        for (const [userId, user] of message.mentions.users) {
          if (userId === message.author.id || user.bot) continue;
          const targetAfk = db.getAfk(userId, message.guild?.id);
          if (targetAfk && (!targetAfk.guildId || !message.guild || targetAfk.guildId === message.guild.id)) {
            const relTime = `<t:${Math.floor(targetAfk.timestamp / 1000)}:R>`;
            Promise.resolve(message.reply({
              embeds: [build.warn(user, `<@${userId}> is afk: **${targetAfk.reason}** — ${relTime}`)]
            })).catch(() => {});
            break;
          }
        }
      }
    }

    // Leveling: text message XP progression
    if (message.guild && db && typeof db.getLevelingSettings === 'function') {
      const prefix = (db.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
      const isCmd = message.content?.startsWith(prefix) || (this.client.user?.id && (message.content?.startsWith(`<@${this.client.user.id}>`) || message.content?.startsWith(`<@!${this.client.user.id}>`)));

      if (!isCmd) {
        const cdKey = `${message.guild.id}:${message.author.id}`;
        const lastXp = this.xpCooldowns.get(cdKey) || 0;
        const now = Date.now();

        if (now - lastXp >= 60_000) {
          this.xpCooldowns.set(cdKey, now);

          if (this.xpCooldowns.size > 2000) {
            for (const [k, v] of this.xpCooldowns) {
              if (now - v >= 120_000) this.xpCooldowns.delete(k);
            }
          }

          db.getLevelingSettings(message.guild.id).then(async (settings) => {
            if (!settings || !settings.enabled) return;
            if (settings.ignored_channels?.includes(message.channel.id)) return;
            if (settings.ignored_roles?.length && message.member?.roles?.cache?.some(r => settings.ignored_roles.includes(r.id))) return;

            const baseXp = Math.floor(Math.random() * 11) + 15;
            const multiplier = Math.max(0.1, settings.multiplier || 1.0);
            const xpToAdd = Math.round(baseXp * multiplier);

            const result = await db.addMessageXp(message.guild.id, message.author.id, xpToAdd);
            if (result?.leveledUp) {
              const LevelingWorker = require('../structures/utils/workers/levelingworker.js');
              await LevelingWorker.handleLevelUp(message.guild, message.member, result.newLevel, settings, this.client, message.channel);
            }
          }).catch(() => {});
        }
      }
    }

    // Sticky Messages Handler (debounced, skips command invocations)
    if (message.guild && db && message.channel?.send) {
      const guildPrefix = (db.getGuildPrefix) ? (db.getGuildPrefix(message.guild.id) || config.prefix || ',') : (config.prefix || ',');
      const isCmd = message.content?.startsWith(guildPrefix) || message.content?.startsWith(`<@${this.client.user?.id}>`) || message.content?.startsWith(`<@!${this.client.user?.id}>`);

      if (!isCmd) {
        const now = Date.now();
        const lastStickyTime = this.stickyCooldowns.get(message.channel.id) || 0;
        if (now - lastStickyTime > 2500) {
          db.getSticky(message.channel.id).then(async (sticky) => {
            if (!sticky) return;
            this.stickyCooldowns.set(message.channel.id, Date.now());

            if (sticky.last_message_id && sticky.last_message_id !== message.id) {
              try {
                const oldMsg = await message.channel.messages.fetch(sticky.last_message_id).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => {});
              } catch (_) {}
            }

            const pinEmoji = config.emojis?.harm_pin || '';
            const stickyEmbed = new EmbedBuilder()
              .setColor(config.colors.c || 0x0A0A0C)
              .setDescription(`${pinEmoji} **sticky message**\n\n${sticky.content}`);

            const sent = await message.channel.send({ embeds: [stickyEmbed] }).catch(() => null);
            if (sent) {
              await db.updateStickyLastMessage(message.channel.id, sent.id).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    }

    // Command handler dispatch (non-blocking for gateway loop)
    if (this.client.commandHandler && typeof this.client.commandHandler.handleMessage === 'function') {
      this.client.commandHandler.handleMessage(message).catch(err => {
        console.error('[messageCreate dispatch]', err);
      });
    }
  }
}

module.exports = MessageCreateEvent;
