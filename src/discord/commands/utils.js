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

function splitEmbedDescriptions(sections, maxLength = 3900) {
  const normalized = Array.isArray(sections)
    ? sections
      .map((section) => (typeof section === "string" ? section.trim() : ""))
      .filter(Boolean)
    : [];

  if (normalized.length === 0) {
    return [];
  }

  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const section of normalized) {
    const next = current ? `${current}\n\n${section}` : section;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    pushCurrent();

    if (section.length <= maxLength) {
      current = section;
      continue;
    }

    // Guard against a single oversized section to avoid Discord validation errors.
    chunks.push(`${section.slice(0, Math.max(0, maxLength - 1))}…`);
  }

  pushCurrent();
  return chunks;
}

function buildPagedEmbeds({ title, sections, color, emptyDescription }) {
  const descriptions = splitEmbedDescriptions(sections);
  if (descriptions.length === 0) {
    return [buildEmbed({ title, description: emptyDescription || "No data.", color })];
  }

  const MAX_EMBEDS = 10;
  let pages = descriptions.slice(0, MAX_EMBEDS);
  const omittedPages = Math.max(0, descriptions.length - pages.length);
  if (omittedPages > 0) {
    const lastIndex = pages.length - 1;
    const note = `\n\n_...${omittedPages} page(s) omitted due to Discord embed limit._`;
    const available = Math.max(0, 3900 - note.length);
    pages[lastIndex] = `${pages[lastIndex].slice(0, available)}${note}`;
  }

  const total = pages.length;
  return pages.map((description, index) => {
    const pageTitle = total > 1 ? `${title} (${index + 1}/${total})` : title;
    return buildEmbed({ title: pageTitle, description, color });
  });
}


// Hỗ trợ nhập 1k, 1m, 1k2, 1.2k, 20k, 300k, 1m2, 2.5m, v.v.
function parseAmount(input) {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return null;
  const str = input.trim().toLowerCase();
  if (!str) return null;
  // 1k2, 1.2k, 20k, 300k, 1m, 2.5m, 1m2, v.v.
  const match = str.match(/^([\d,.]+)([km]?)(\d*)$/);
  if (!match) return null;
  let [ , num, unit, tail ] = match;
  num = num.replace(/,/g, "");
  let amount = parseFloat(num);
  if (isNaN(amount)) return null;
  if (unit === "k") {
    if (tail) {
      // 1k2 = 1200
      amount = amount * 1000 + parseInt(tail.padEnd(3, '0').slice(0,3));
    } else {
      amount *= 1000;
    }
  } else if (unit === "m") {
    if (tail) {
      // 1m2 = 1,200,000
      amount = amount * 1000000 + parseInt(tail.padEnd(6, '0').slice(0,6));
    } else {
      amount *= 1000000;
    }
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.floor(amount);
}

function normalizeAmount(value) {
  // Giữ lại cho tương thích cũ, nhưng ưu tiên parseAmount
  return parseAmount(value);
}

function formatPoints(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  buildPagedEmbeds,
  normalizeAmount,
  formatPoints,
  getOrCreateUser,
  primeEmojiCaches,
  getEmojiLookupCaches,
  findEmojiByName
};
