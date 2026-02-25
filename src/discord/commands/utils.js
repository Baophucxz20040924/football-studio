const { EmbedBuilder } = require("discord.js");
const User = require("../../models/User");

const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 0);
const DISPLAY_TIME_ZONE = process.env.DISPLAY_TIME_ZONE || "Asia/Ho_Chi_Minh";
const DISPLAY_LOCALE = process.env.DISPLAY_LOCALE || "en-US";

function formatOdds(odds) {
  return odds.map((o) => `${o.key} x${o.multiplier}`).join(", ");
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

module.exports = {
  STARTING_BALANCE,
  formatOdds,
  formatKickoff,
  buildEmbed,
  normalizeAmount,
  formatPoints,
  getOrCreateUser
};
