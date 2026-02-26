const { EmbedBuilder } = require("discord.js");
const User = require("../../models/User");

const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 0);
const DISPLAY_TIME_ZONE = process.env.DISPLAY_TIME_ZONE || "Asia/Ho_Chi_Minh";
const DISPLAY_LOCALE = process.env.DISPLAY_LOCALE || "en-US";
const PREFERRED_EMOJI_GUILD_ID = process.env.EMOJI_GUILD_ID || process.env.GUILD_ID || "";
const GLOBAL_EMOJI_PRIME_INTERVAL_MS = 5 * 60 * 1000;
let lastGlobalEmojiPrimeAt = 0;

function formatOdds(odds) {
  return odds.map((o) => `**${o.key}** x${o.multiplier}`).join(", ");
}

function formatKickoff(date) {
  const local = new Date(date);
  try {
    return local.toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
  } catch {
    return local.toLocaleString();
  }
}

function buildEmbed({ title, description, color }) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.floor(amount);
}

function formatPoints(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return amount.toLocaleString("en-US");
}

async function getOrCreateUser(userId, userName) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = await User.create({ userId, userName: userName || "", balance: STARTING_BALANCE });
    return user;
  }

  const updates = {};
  if (userName && user.userName !== userName) {
    updates.userName = userName;
  }
  updates.lastSeen = new Date();

  if (Object.keys(updates).length > 0) {
    Object.assign(user, updates);
    await user.save();
  }
  return user;
}

async function resolvePreferredEmojiGuild(guild) {
  if (!guild?.client || !PREFERRED_EMOJI_GUILD_ID) {
    return null;
  }

  if (guild.id === PREFERRED_EMOJI_GUILD_ID) {
    return guild;
  }

  return guild.client.guilds.cache.get(PREFERRED_EMOJI_GUILD_ID)
    || guild.client.guilds.fetch(PREFERRED_EMOJI_GUILD_ID).catch(() => null);
}

async function primeEmojiCaches(guild) {
  if (!guild?.client) {
    return;
  }

  const targets = [guild];
  const preferredGuild = await resolvePreferredEmojiGuild(guild);
  if (preferredGuild && preferredGuild.id !== guild.id) {
    targets.push(preferredGuild);
  }

  const now = Date.now();
  if (now - lastGlobalEmojiPrimeAt >= GLOBAL_EMOJI_PRIME_INTERVAL_MS) {
    for (const extraGuild of guild.client.guilds.cache.values()) {
      if (!targets.some((item) => item.id === extraGuild.id)) {
        targets.push(extraGuild);
      }
    }
    lastGlobalEmojiPrimeAt = now;
  }

  for (const target of targets) {
    await target.emojis.fetch().catch(() => null);
  }
}

function getEmojiLookupCaches(guild) {
  if (!guild?.client) {
    return [];
  }

  const caches = [];
  const seenGuildIds = new Set();

  const pushGuildCache = (targetGuild) => {
    if (!targetGuild?.id || seenGuildIds.has(targetGuild.id)) {
      return;
    }

    seenGuildIds.add(targetGuild.id);
    if (targetGuild.emojis?.cache) {
      caches.push(targetGuild.emojis.cache);
    }
  };

  pushGuildCache(guild);

  if (PREFERRED_EMOJI_GUILD_ID) {
    const preferredGuild = guild.client.guilds.cache.get(PREFERRED_EMOJI_GUILD_ID);
    pushGuildCache(preferredGuild);
  }

  for (const anyGuild of guild.client.guilds.cache.values()) {
    pushGuildCache(anyGuild);
  }

  if (guild.client.emojis?.cache) {
    caches.push(guild.client.emojis.cache);
  }

  return caches;
}

function findEmojiByName(guild, name) {
  if (!name) {
    return null;
  }

  for (const cache of getEmojiLookupCaches(guild)) {
    const emoji = cache.find((item) => item.name === name);
    if (emoji) {
      return emoji;
    }
  }

  return null;
}

module.exports = {
  STARTING_BALANCE,
  formatOdds,
  formatKickoff,
  buildEmbed,
  normalizeAmount,
  formatPoints,
  getOrCreateUser,
  primeEmojiCaches,
  getEmojiLookupCaches,
  findEmojiByName
};
