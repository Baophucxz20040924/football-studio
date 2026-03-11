const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ChannelType,
  PermissionsBitField
} = require("discord.js");
require("dotenv").config();

const Match = require("./models/Match");
const Bet = require("./models/Bet");
const User = require("./models/User");
const AviatorBet = require("./models/AviatorBet");
const AviatorRound = require("./models/AviatorRound");
const ChatMessage = require("./models/ChatMessage");
const { verifyAviatorToken } = require("./aviator/token");
const { handleInteraction, getCommandData } = require("./discord/commands");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/football_bot";
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 0);
const MATCH_AUTO_LOCK_INTERVAL_MS = Number(process.env.MATCH_AUTO_LOCK_INTERVAL_MS || 30_000);
const KICKOFF_UTC_OFFSET_MINUTES = Number(process.env.KICKOFF_UTC_OFFSET_MINUTES || 420);
const ESPN_EPL_AUTO_SYNC_ENABLED = process.env.ESPN_EPL_AUTO_SYNC_ENABLED !== "false";
const ESPN_EPL_AUTO_CLOSE_ENABLED = process.env.ESPN_EPL_AUTO_CLOSE_ENABLED !== "false";
const ESPN_EPL_CREATE_SYNC_INTERVAL_MS = Number(process.env.ESPN_EPL_CREATE_SYNC_INTERVAL_MS || 30 * 60_000);
const ESPN_EPL_LIVE_SYNC_INTERVAL_MS = Number(process.env.ESPN_EPL_LIVE_SYNC_INTERVAL_MS || 2 * 60_000);
const ESPN_EPL_PREMATCH_SYNC_CHECK_INTERVAL_MS = Number(process.env.ESPN_EPL_PREMATCH_SYNC_CHECK_INTERVAL_MS || 10 * 60_000);
const ESPN_EPL_PREMATCH_SYNC_FAR_INTERVAL_MS = Number(process.env.ESPN_EPL_PREMATCH_SYNC_FAR_INTERVAL_MS || 2 * 60 * 60_000);
const ESPN_EPL_PREMATCH_SYNC_NEAR_INTERVAL_MS = Number(process.env.ESPN_EPL_PREMATCH_SYNC_NEAR_INTERVAL_MS || 60 * 60_000);
const ESPN_EPL_PREMATCH_NEAR_WINDOW_MS = Number(process.env.ESPN_EPL_PREMATCH_NEAR_WINDOW_MS || 2 * 60 * 60_000);
const ESPN_EPL_SYNC_DAYS_AHEAD = Number(process.env.ESPN_EPL_SYNC_DAYS_AHEAD || 7);
const ESPN_EPL_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard";
const ESPN_LALIGA_AUTO_SYNC_ENABLED = process.env.ESPN_LALIGA_AUTO_SYNC_ENABLED !== "false";
const ESPN_LALIGA_AUTO_CLOSE_ENABLED = process.env.ESPN_LALIGA_AUTO_CLOSE_ENABLED !== "false";
const ESPN_LALIGA_CREATE_SYNC_INTERVAL_MS = Number(process.env.ESPN_LALIGA_CREATE_SYNC_INTERVAL_MS || 30 * 60_000);
const ESPN_LALIGA_LIVE_SYNC_INTERVAL_MS = Number(process.env.ESPN_LALIGA_LIVE_SYNC_INTERVAL_MS || 2 * 60_000);
const ESPN_LALIGA_PREMATCH_SYNC_CHECK_INTERVAL_MS = Number(process.env.ESPN_LALIGA_PREMATCH_SYNC_CHECK_INTERVAL_MS || 10 * 60_000);
const ESPN_LALIGA_PREMATCH_SYNC_FAR_INTERVAL_MS = Number(process.env.ESPN_LALIGA_PREMATCH_SYNC_FAR_INTERVAL_MS || 2 * 60 * 60_000);
const ESPN_LALIGA_PREMATCH_SYNC_NEAR_INTERVAL_MS = Number(process.env.ESPN_LALIGA_PREMATCH_SYNC_NEAR_INTERVAL_MS || 60 * 60_000);
const ESPN_LALIGA_PREMATCH_NEAR_WINDOW_MS = Number(process.env.ESPN_LALIGA_PREMATCH_NEAR_WINDOW_MS || 2 * 60 * 60_000);
const ESPN_LALIGA_SYNC_DAYS_AHEAD = Number(process.env.ESPN_LALIGA_SYNC_DAYS_AHEAD || 7);
const ESPN_LALIGA_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard";
const ESPN_AFC_AUTO_SYNC_ENABLED = process.env.ESPN_AFC_AUTO_SYNC_ENABLED !== "false";
const ESPN_AFC_AUTO_CLOSE_ENABLED = process.env.ESPN_AFC_AUTO_CLOSE_ENABLED !== "false";
const ESPN_AFC_CREATE_SYNC_INTERVAL_MS = Number(process.env.ESPN_AFC_CREATE_SYNC_INTERVAL_MS || 30 * 60_000);
const ESPN_AFC_LIVE_SYNC_INTERVAL_MS = Number(process.env.ESPN_AFC_LIVE_SYNC_INTERVAL_MS || 2 * 60_000);
const ESPN_AFC_PREMATCH_SYNC_CHECK_INTERVAL_MS = Number(process.env.ESPN_AFC_PREMATCH_SYNC_CHECK_INTERVAL_MS || 10 * 60_000);
const ESPN_AFC_PREMATCH_SYNC_FAR_INTERVAL_MS = Number(process.env.ESPN_AFC_PREMATCH_SYNC_FAR_INTERVAL_MS || 2 * 60 * 60_000);
const ESPN_AFC_PREMATCH_SYNC_NEAR_INTERVAL_MS = Number(process.env.ESPN_AFC_PREMATCH_SYNC_NEAR_INTERVAL_MS || 60 * 60_000);
const ESPN_AFC_PREMATCH_NEAR_WINDOW_MS = Number(process.env.ESPN_AFC_PREMATCH_NEAR_WINDOW_MS || 2 * 60 * 60_000);
const ESPN_AFC_SYNC_DAYS_AHEAD = Number(process.env.ESPN_AFC_SYNC_DAYS_AHEAD || 7);
const ESPN_AFC_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard";
const ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED = process.env.ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED !== "false";
const ESPN_AFC_ASIAN_CUP_AUTO_CLOSE_ENABLED = process.env.ESPN_AFC_ASIAN_CUP_AUTO_CLOSE_ENABLED !== "false";
const ESPN_AFC_ASIAN_CUP_CREATE_SYNC_INTERVAL_MS = Number(process.env.ESPN_AFC_ASIAN_CUP_CREATE_SYNC_INTERVAL_MS || 30 * 60_000);
const ESPN_AFC_ASIAN_CUP_LIVE_SYNC_INTERVAL_MS = Number(process.env.ESPN_AFC_ASIAN_CUP_LIVE_SYNC_INTERVAL_MS || 2 * 60_000);
const ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_CHECK_INTERVAL_MS = Number(process.env.ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_CHECK_INTERVAL_MS || 10 * 60_000);
const ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_FAR_INTERVAL_MS = Number(process.env.ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_FAR_INTERVAL_MS || 2 * 60 * 60_000);
const ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_NEAR_INTERVAL_MS = Number(process.env.ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_NEAR_INTERVAL_MS || 60 * 60_000);
const ESPN_AFC_ASIAN_CUP_PREMATCH_NEAR_WINDOW_MS = Number(process.env.ESPN_AFC_ASIAN_CUP_PREMATCH_NEAR_WINDOW_MS || 2 * 60 * 60_000);
const ESPN_AFC_ASIAN_CUP_SYNC_DAYS_AHEAD = Number(process.env.ESPN_AFC_ASIAN_CUP_SYNC_DAYS_AHEAD || 7);
const ESPN_AFC_ASIAN_CUP_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/afc.asian.cup/scoreboard";
const ESPN_KSA1_AUTO_SYNC_ENABLED = process.env.ESPN_KSA1_AUTO_SYNC_ENABLED !== "false";
const ESPN_KSA1_AUTO_CLOSE_ENABLED = process.env.ESPN_KSA1_AUTO_CLOSE_ENABLED !== "false";
const ESPN_KSA1_CREATE_SYNC_INTERVAL_MS = Number(process.env.ESPN_KSA1_CREATE_SYNC_INTERVAL_MS || 30 * 60_000);
const ESPN_KSA1_LIVE_SYNC_INTERVAL_MS = Number(process.env.ESPN_KSA1_LIVE_SYNC_INTERVAL_MS || 2 * 60_000);
const ESPN_KSA1_PREMATCH_SYNC_CHECK_INTERVAL_MS = Number(process.env.ESPN_KSA1_PREMATCH_SYNC_CHECK_INTERVAL_MS || 10 * 60_000);
const ESPN_KSA1_PREMATCH_SYNC_FAR_INTERVAL_MS = Number(process.env.ESPN_KSA1_PREMATCH_SYNC_FAR_INTERVAL_MS || 2 * 60 * 60_000);
const ESPN_KSA1_PREMATCH_SYNC_NEAR_INTERVAL_MS = Number(process.env.ESPN_KSA1_PREMATCH_SYNC_NEAR_INTERVAL_MS || 60 * 60_000);
const ESPN_KSA1_PREMATCH_NEAR_WINDOW_MS = Number(process.env.ESPN_KSA1_PREMATCH_NEAR_WINDOW_MS || 2 * 60 * 60_000);
const ESPN_KSA1_SYNC_DAYS_AHEAD = Number(process.env.ESPN_KSA1_SYNC_DAYS_AHEAD || 7);
const ESPN_KSA1_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/ksa.1/scoreboard";
const ESPN_NBA_AUTO_SYNC_ENABLED = process.env.ESPN_NBA_AUTO_SYNC_ENABLED !== "false";
const ESPN_NBA_AUTO_CLOSE_ENABLED = process.env.ESPN_NBA_AUTO_CLOSE_ENABLED !== "false";
const ESPN_NBA_CREATE_SYNC_INTERVAL_MS = Number(process.env.ESPN_NBA_CREATE_SYNC_INTERVAL_MS || 30 * 60_000);
const ESPN_NBA_LIVE_SYNC_INTERVAL_MS = Number(process.env.ESPN_NBA_LIVE_SYNC_INTERVAL_MS || 2 * 60_000);
const ESPN_NBA_PREMATCH_SYNC_CHECK_INTERVAL_MS = Number(process.env.ESPN_NBA_PREMATCH_SYNC_CHECK_INTERVAL_MS || 10 * 60_000);
const ESPN_NBA_PREMATCH_SYNC_FAR_INTERVAL_MS = Number(process.env.ESPN_NBA_PREMATCH_SYNC_FAR_INTERVAL_MS || 2 * 60 * 60_000);
const ESPN_NBA_PREMATCH_SYNC_NEAR_INTERVAL_MS = Number(process.env.ESPN_NBA_PREMATCH_SYNC_NEAR_INTERVAL_MS || 60 * 60_000);
const ESPN_NBA_PREMATCH_NEAR_WINDOW_MS = Number(process.env.ESPN_NBA_PREMATCH_NEAR_WINDOW_MS || 2 * 60 * 60_000);
const ESPN_NBA_SYNC_DAYS_AHEAD = Number(process.env.ESPN_NBA_SYNC_DAYS_AHEAD || 7);
const ESPN_NBA_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const MATCH_HISTORY_RETENTION_DAYS = Number(process.env.MATCH_HISTORY_RETENTION_DAYS || 45);
const BET_HISTORY_RETENTION_DAYS = Number(process.env.BET_HISTORY_RETENTION_DAYS || 90);
const DATA_CLEANUP_INTERVAL_MS = Number(process.env.DATA_CLEANUP_INTERVAL_MS || 12 * 60 * 60_000);
const AVIATOR_TICK_MS = 100;
const AVIATOR_K = 0.12;
const AVIATOR_HOUSE_EDGE = Number(process.env.AVIATOR_HOUSE_EDGE || 0.01);
const TIENLEN_DIST_DIR = path.join(__dirname, "tienlen", "server", "client", "dist");
const CHAT_PUBLIC_DIR = path.join(__dirname, "chat", "public");

const aviatorState = {
  status: "WAITING",
  countdown: 0,
  multiplier: 1,
  crashPoint: 1,
  startTime: 0,
  intervalId: null,
  tickInProgress: false,
  resolving: false
};

const aviatorClients = new Map();
const aviatorOpenBets = new Map();
let aviatorRoundBets = [];
let matchAutoLockIntervalId = null;
let eplCreateSyncIntervalId = null;
let eplPrematchSyncIntervalId = null;
let eplLiveSyncIntervalId = null;
let eplCreateSyncInProgress = false;
let eplPrematchSyncInProgress = false;
let eplLiveSyncInProgress = false;
let laligaCreateSyncIntervalId = null;
let laligaPrematchSyncIntervalId = null;
let laligaLiveSyncIntervalId = null;
let laligaCreateSyncInProgress = false;
let laligaPrematchSyncInProgress = false;
let laligaLiveSyncInProgress = false;
let afcCreateSyncIntervalId = null;
let afcPrematchSyncIntervalId = null;
let afcLiveSyncIntervalId = null;
let afcCreateSyncInProgress = false;
let afcPrematchSyncInProgress = false;
let afcLiveSyncInProgress = false;
let afcAsianCupCreateSyncIntervalId = null;
let afcAsianCupPrematchSyncIntervalId = null;
let afcAsianCupLiveSyncIntervalId = null;
let afcAsianCupCreateSyncInProgress = false;
let afcAsianCupPrematchSyncInProgress = false;
let afcAsianCupLiveSyncInProgress = false;
let ksa1CreateSyncIntervalId = null;
let ksa1PrematchSyncIntervalId = null;
let ksa1LiveSyncIntervalId = null;
let ksa1CreateSyncInProgress = false;
let ksa1PrematchSyncInProgress = false;
let ksa1LiveSyncInProgress = false;
let nbaCreateSyncIntervalId = null;
let nbaPrematchSyncIntervalId = null;
let nbaLiveSyncIntervalId = null;
let nbaCreateSyncInProgress = false;
let nbaPrematchSyncInProgress = false;
let nbaLiveSyncInProgress = false;
let manualSyncInProgress = false;
let dataCleanupIntervalId = null;

function parseKickoffInput(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const localLike = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed);

  if (localLike && !hasTimezone) {
    const [, year, month, day, hour, minute, second = "0"] = localLike;
    const utcMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) - (KICKOFF_UTC_OFFSET_MINUTES * 60 * 1000);
    return new Date(utcMs);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function lockMatchesAtKickoff() {
  const now = new Date();
  const lockResult = await Match.updateMany(
    {
      status: "open",
      betLocked: { $ne: true },
      kickoff: { $lte: now }
    },
    {
      $set: {
        betLocked: true
      }
    }
  );

  const liveResult = await Match.updateMany(
    {
      status: "open",
      isLive: { $ne: true },
      kickoff: { $lte: now }
    },
    {
      $set: {
        isLive: true
      }
    }
  );

  if (lockResult.modifiedCount > 0) {
    console.log(`Auto-locked betting for ${lockResult.modifiedCount} match(es) at kickoff.`);
  }

  if (liveResult.modifiedCount > 0) {
    console.log(`Auto-set live for ${liveResult.modifiedCount} match(es) at kickoff.`);
  }
}

function startMatchAutoLockScheduler() {
  if (matchAutoLockIntervalId) {
    clearInterval(matchAutoLockIntervalId);
  }

  matchAutoLockIntervalId = setInterval(() => {
    void lockMatchesAtKickoff().catch((err) => {
      console.error("Failed to auto-lock matches at kickoff:", err);
    });
  }, MATCH_AUTO_LOCK_INTERVAL_MS);
}

function toEspnDateToken(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getEplDateRangeToken(daysAhead) {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(0, daysAhead));
  return `${toEspnDateToken(start)}-${toEspnDateToken(end)}`;
}

function getEplDateRangeTokenWithOffsets(startOffsetDays, endOffsetDays) {
  const start = new Date();
  const end = new Date();
  start.setUTCDate(start.getUTCDate() + startOffsetDays);
  end.setUTCDate(end.getUTCDate() + endOffsetDays);
  return `${toEspnDateToken(start)}-${toEspnDateToken(end)}`;
}

function getNbaDateRangeToken(daysAhead) {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(0, daysAhead));
  return `${toEspnDateToken(start)}-${toEspnDateToken(end)}`;
}

function getNbaDateRangeTokenWithOffsets(startOffsetDays, endOffsetDays) {
  const start = new Date();
  const end = new Date();
  start.setUTCDate(start.getUTCDate() + startOffsetDays);
  end.setUTCDate(end.getUTCDate() + endOffsetDays);
  return `${toEspnDateToken(start)}-${toEspnDateToken(end)}`;
}

async function fetchScoreboardEvents(url, dates) {
  const response = await fetch(`${url}?dates=${dates}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN scoreboard failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.events) ? payload.events : [];
}

function getCompetitionFromEvent(event) {
  if (!Array.isArray(event?.competitions) || !event.competitions.length) {
    return null;
  }

  return event.competitions[0];
}

function getCompetitor(competition, side) {
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  if (!competitors.length) {
    return null;
  }

  if (side === "home") {
    return competitors.find((item) => item?.homeAway === "home") || competitors[0] || null;
  }

  return competitors.find((item) => item?.homeAway === "away") || competitors[1] || competitors[0] || null;
}

function parseCompetitorScore(competitor) {
  const raw = competitor?.score;
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function parseAmericanOddsToMultiplier(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim().toUpperCase();
  if (!raw) {
    return null;
  }

  if (raw === "EVEN" || raw === "EV") {
    return 2;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  const decimal = parsed > 0
    ? 1 + parsed / 100
    : 1 + 100 / Math.abs(parsed);

  if (!Number.isFinite(decimal) || decimal <= 1) {
    return null;
  }

  return Math.round(decimal * 100) / 100;
}

function parseTotalLineValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value).trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/^([ou])\s*/i, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function formatTotalLineForKey(line) {
  if (!Number.isFinite(line)) {
    return "";
  }

  if (Number.isInteger(line)) {
    return String(line);
  }

  return String(Math.round(line * 100) / 100);
}

function parseSpreadLineValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value).trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw === "pk" || raw === "pick" || raw === "pickem" || raw === "pick'em") {
    return 0;
  }

  const normalized = raw.replace(/[^0-9+\-.]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSpreadLineForKey(line) {
  if (!Number.isFinite(line)) {
    return "";
  }

  if (Number.isInteger(line)) {
    return String(line);
  }

  return String(Math.round(line * 100) / 100);
}

function parseSpreadLineFromPickKey(key) {
  const match = String(key || "").trim().match(/^hcp_(home|away)\(([-+]?\d+(?:\.\d+)?)\)$/i);
  if (!match) {
    return null;
  }

  const side = match[1].toLowerCase();
  const line = Number(match[2]);
  if (!Number.isFinite(line)) {
    return null;
  }

  return { side, line };
}

function parseTotalLineFromPickKey(key) {
  const match = String(key || "").trim().match(/^(?:big|small)\(([-+]?\d+(?:\.\d+)?)\)$/i);
  if (!match) {
    return null;
  }

  const line = Number(match[1]);
  return Number.isFinite(line) ? line : null;
}

function selectBalancedTotalOdds(odds) {
  if (!odds || typeof odds !== "object") {
    return null;
  }

  const candidates = [];

  const topLevelLine = parseTotalLineValue(odds.overUnder);
  const topLevelOver = parseAmericanOddsToMultiplier(odds.overOdds);
  const topLevelUnder = parseAmericanOddsToMultiplier(odds.underOdds);
  if (Number.isFinite(topLevelLine) && Number.isFinite(topLevelOver) && Number.isFinite(topLevelUnder)) {
    candidates.push({ line: topLevelLine, overMultiplier: topLevelOver, underMultiplier: topLevelUnder });
  }

  const totalMarkets = [];
  if (odds.total && typeof odds.total === "object") {
    totalMarkets.push(odds.total);
  }

  if (Array.isArray(odds.totals)) {
    for (const item of odds.totals) {
      if (item && typeof item === "object") {
        totalMarkets.push(item);
      }
    }
  }

  for (const market of totalMarkets) {
    const overNode = market?.over || {};
    const underNode = market?.under || {};

    const line = parseTotalLineValue(
      overNode?.close?.line
      ?? overNode?.open?.line
      ?? underNode?.close?.line
      ?? underNode?.open?.line
      ?? market?.line
      ?? market?.value
    );

    const overMultiplier = parseAmericanOddsToMultiplier(overNode?.close?.odds ?? overNode?.open?.odds ?? overNode?.odds);
    const underMultiplier = parseAmericanOddsToMultiplier(underNode?.close?.odds ?? underNode?.open?.odds ?? underNode?.odds);

    if (Number.isFinite(line) && Number.isFinite(overMultiplier) && Number.isFinite(underMultiplier)) {
      candidates.push({ line, overMultiplier, underMultiplier });
    }
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => {
    const gapA = Math.abs((1 / a.overMultiplier) - (1 / a.underMultiplier));
    const gapB = Math.abs((1 / b.overMultiplier) - (1 / b.underMultiplier));
    if (gapA !== gapB) {
      return gapA - gapB;
    }

    const lineDistanceA = Math.abs(a.line - 2.5);
    const lineDistanceB = Math.abs(b.line - 2.5);
    return lineDistanceA - lineDistanceB;
  });

  return candidates[0];
}

function extractEplOdds(competition) {
  const odds = Array.isArray(competition?.odds) ? competition.odds[0] : null;
  const moneyline = odds?.moneyline || {};

  const homeAmerican = moneyline?.home?.close?.odds ?? moneyline?.home?.open?.odds;
  const awayAmerican = moneyline?.away?.close?.odds ?? moneyline?.away?.open?.odds;
  const drawAmerican = moneyline?.draw?.close?.odds
    ?? moneyline?.draw?.open?.odds
    ?? odds?.drawOdds?.moneyLine;

  const mapped = [
    { key: "home", multiplier: parseAmericanOddsToMultiplier(homeAmerican) },
    { key: "draw", multiplier: parseAmericanOddsToMultiplier(drawAmerican) },
    { key: "away", multiplier: parseAmericanOddsToMultiplier(awayAmerican) }
  ].filter((item) => Number.isFinite(item.multiplier));

  const totalMarket = selectBalancedTotalOdds(odds);
  if (totalMarket) {
    const line = formatTotalLineForKey(totalMarket.line);
    if (line) {
      mapped.push({ key: `big(${line})`, multiplier: totalMarket.overMultiplier });
      mapped.push({ key: `small(${line})`, multiplier: totalMarket.underMultiplier });
    }
  }

  const pointSpread = odds?.pointSpread || {};
  const spreadHomeNode = pointSpread?.home || {};
  const spreadAwayNode = pointSpread?.away || {};

  const homeSpreadLine = parseSpreadLineValue(
    spreadHomeNode?.close?.line
    ?? spreadHomeNode?.open?.line
    ?? spreadHomeNode?.line
  );
  const awaySpreadLine = parseSpreadLineValue(
    spreadAwayNode?.close?.line
    ?? spreadAwayNode?.open?.line
    ?? spreadAwayNode?.line
  );

  const homeSpreadMultiplier = parseAmericanOddsToMultiplier(
    spreadHomeNode?.close?.odds
    ?? spreadHomeNode?.open?.odds
    ?? spreadHomeNode?.odds
  );
  const awaySpreadMultiplier = parseAmericanOddsToMultiplier(
    spreadAwayNode?.close?.odds
    ?? spreadAwayNode?.open?.odds
    ?? spreadAwayNode?.odds
  );

  const homeSpreadKeyLine = formatSpreadLineForKey(homeSpreadLine);
  if (homeSpreadKeyLine && Number.isFinite(homeSpreadMultiplier)) {
    mapped.push({ key: `hcp_home(${homeSpreadKeyLine})`, multiplier: homeSpreadMultiplier });
  }

  const awaySpreadKeyLine = formatSpreadLineForKey(awaySpreadLine);
  if (awaySpreadKeyLine && Number.isFinite(awaySpreadMultiplier)) {
    mapped.push({ key: `hcp_away(${awaySpreadKeyLine})`, multiplier: awaySpreadMultiplier });
  }

  const dedupedByKey = new Map();
  for (const item of mapped) {
    dedupedByKey.set(item.key, item);
  }

  return Array.from(dedupedByKey.values());
}

function extractNbaOdds(competition) {
  const odds = Array.isArray(competition?.odds) ? competition.odds[0] : null;
  const moneyline = odds?.moneyline || {};

  const homeAmerican = moneyline?.home?.close?.odds ?? moneyline?.home?.open?.odds;
  const awayAmerican = moneyline?.away?.close?.odds ?? moneyline?.away?.open?.odds;

  const mapped = [
    { key: "home", multiplier: parseAmericanOddsToMultiplier(homeAmerican) },
    { key: "away", multiplier: parseAmericanOddsToMultiplier(awayAmerican) }
  ].filter((item) => Number.isFinite(item.multiplier));

  const totalMarket = selectBalancedTotalOdds(odds);
  if (totalMarket) {
    const line = formatTotalLineForKey(totalMarket.line);
    if (line) {
      mapped.push({ key: `big(${line})`, multiplier: totalMarket.overMultiplier });
      mapped.push({ key: `small(${line})`, multiplier: totalMarket.underMultiplier });
    }
  }

  const dedupedByKey = new Map();
  for (const item of mapped) {
    dedupedByKey.set(item.key, item);
  }

  return Array.from(dedupedByKey.values());
}

function buildMatchFromEspnEvent(event, { sport, league, oddsExtractor, eventIdPrefix = "" }) {
  const competition = getCompetitionFromEvent(event);
  if (!competition) {
    return null;
  }

  const state = competition?.status?.type?.state || event?.status?.type?.state;

  const home = getCompetitor(competition, "home");
  const away = getCompetitor(competition, "away");
  const homeTeam = home?.team?.displayName || home?.team?.name || "";
  const awayTeam = away?.team?.displayName || away?.team?.name || "";

  if (!homeTeam || !awayTeam) {
    return null;
  }

  const kickoff = new Date(competition?.date || event?.date || "");
  if (Number.isNaN(kickoff.getTime())) {
    return null;
  }

  const scoreHome = parseCompetitorScore(home);
  const scoreAway = parseCompetitorScore(away);
  const hasLiveScore = Number.isFinite(scoreHome)
    && Number.isFinite(scoreAway)
    && (state === "in" || state === "post");

  const rawEventId = String(event?.id || competition?.id || "").trim();
  if (!rawEventId) {
    return null;
  }

  return {
    espnEventId: eventIdPrefix ? `${eventIdPrefix}:${rawEventId}` : rawEventId,
    sport,
    league,
    state: String(state || "").toLowerCase(),
    homeTeam,
    awayTeam,
    stadium: competition?.venue?.fullName || competition?.venue?.displayName || event?.venue?.displayName || "",
    kickoff,
    odds: typeof oddsExtractor === "function" ? oddsExtractor(competition) : [],
    scoreHome,
    scoreAway,
    hasLiveScore
  };
}

async function fetchEplScoreboardEvents(dates) {
  return fetchScoreboardEvents(ESPN_EPL_SCOREBOARD_URL, dates);
}

function buildEplMatchFromEspnEvent(event) {
  return buildMatchFromEspnEvent(event, {
    sport: "football",
    league: "epl",
    oddsExtractor: extractEplOdds
  });
}

async function fetchLaLigaScoreboardEvents(dates) {
  return fetchScoreboardEvents(ESPN_LALIGA_SCOREBOARD_URL, dates);
}

function buildLaLigaMatchFromEspnEvent(event) {
  return buildMatchFromEspnEvent(event, {
    sport: "football",
    league: "laliga",
    oddsExtractor: extractEplOdds,
    eventIdPrefix: "laliga"
  });
}

async function fetchAfcScoreboardEvents(dates) {
  return fetchScoreboardEvents(ESPN_AFC_SCOREBOARD_URL, dates);
}

function buildAfcMatchFromEspnEvent(event) {
  return buildMatchFromEspnEvent(event, {
    sport: "football",
    league: "uefa",
    oddsExtractor: extractEplOdds,
    eventIdPrefix: "uefa"
  });
}

async function fetchAfcAsianCupScoreboardEvents(dates) {
  return fetchScoreboardEvents(ESPN_AFC_ASIAN_CUP_SCOREBOARD_URL, dates);
}

function buildAfcAsianCupMatchFromEspnEvent(event) {
  return buildMatchFromEspnEvent(event, {
    sport: "football",
    league: "afc_asian_cup",
    oddsExtractor: extractEplOdds,
    eventIdPrefix: "afc_asian_cup"
  });
}

async function fetchKsa1ScoreboardEvents(dates) {
  return fetchScoreboardEvents(ESPN_KSA1_SCOREBOARD_URL, dates);
}

function buildKsa1MatchFromEspnEvent(event) {
  return buildMatchFromEspnEvent(event, {
    sport: "football",
    league: "ksa1",
    oddsExtractor: extractEplOdds,
    eventIdPrefix: "ksa1"
  });
}

async function fetchNbaScoreboardEvents(dates) {
  return fetchScoreboardEvents(ESPN_NBA_SCOREBOARD_URL, dates);
}

function buildNbaMatchFromEspnEvent(event) {
  return buildMatchFromEspnEvent(event, {
    sport: "basketball",
    league: "nba",
    oddsExtractor: extractNbaOdds,
    eventIdPrefix: "nba"
  });
}

function deriveWinnerKeysByScore(scoreHome, scoreAway, odds = []) {
  if (!Number.isFinite(scoreHome) || !Number.isFinite(scoreAway)) {
    return [];
  }

  const winnerKeys = [];
  const totalPoints = scoreHome + scoreAway;
  const oddsList = Array.isArray(odds) ? odds : [];
  const hasDrawOdd = oddsList.some((odd) => odd?.key === "draw");

  if (scoreHome > scoreAway) {
    winnerKeys.push("home");
  } else if (scoreHome < scoreAway) {
    winnerKeys.push("away");
  } else if (hasDrawOdd) {
    winnerKeys.push("draw");
  }

  const totalLines = new Set();
  for (const odd of oddsList) {
    const line = parseTotalLineFromPickKey(odd?.key);
    if (Number.isFinite(line)) {
      totalLines.add(line);
    }
  }

  for (const line of totalLines) {
    const normalized = formatTotalLineForKey(line);
    if (!normalized) {
      continue;
    }

    if (totalPoints > line) {
      winnerKeys.push(`big(${normalized})`);
    } else {
      winnerKeys.push(`small(${normalized})`);
    }
  }

  const spreadMarkets = new Map();
  for (const odd of oddsList) {
    const parsed = parseSpreadLineFromPickKey(odd?.key);
    if (!parsed) {
      continue;
    }

    const homeEquivalent = parsed.side === "home" ? parsed.line : -parsed.line;
    const normalizedHomeLine = formatSpreadLineForKey(homeEquivalent);
    if (!normalizedHomeLine) {
      continue;
    }

    const current = spreadMarkets.get(normalizedHomeLine) || {};
    if (parsed.side === "home") {
      current.homeKey = odd.key;
    } else {
      current.awayKey = odd.key;
    }
    spreadMarkets.set(normalizedHomeLine, current);
  }

  for (const [homeLineText, market] of spreadMarkets) {
    if (!market.homeKey || !market.awayKey) {
      continue;
    }

    const homeLine = Number(homeLineText);
    if (!Number.isFinite(homeLine)) {
      continue;
    }

    const adjustedHome = scoreHome + homeLine;
    if (adjustedHome > scoreAway) {
      winnerKeys.push(market.homeKey);
    } else if (adjustedHome < scoreAway) {
      winnerKeys.push(market.awayKey);
    }
  }

  return winnerKeys;
}

async function closeMatchAndSettleBets(match, { winnerKeys, scoreHome, scoreAway }) {
  const uniqueWinners = Array.from(new Set((winnerKeys || []).filter(Boolean)));
  if (!uniqueWinners.length) {
    throw new Error("winnerKeys is required");
  }

  match.status = "closed";
  match.isLive = false;
  match.betLocked = true;
  match.winnerKey = uniqueWinners[0] || "";
  match.winnerKeys = uniqueWinners;
  match.scoreHome = Number.isFinite(scoreHome) ? scoreHome : match.scoreHome;
  match.scoreAway = Number.isFinite(scoreAway) ? scoreAway : match.scoreAway;
  await match.save();

  const bets = await Bet.find({ matchId: match._id, status: "open" });
  for (const bet of bets) {
    const user = await User.findOne({ userId: bet.userId });
    if (!user) {
      continue;
    }

    if (uniqueWinners.includes(bet.pickKey)) {
      const payout = Math.round(bet.amount * bet.multiplier);
      user.balance += payout;
      bet.status = "won";
      bet.payout = payout;
    } else {
      bet.status = "lost";
      bet.payout = 0;
    }

    await user.save();
    await bet.save();
  }
}

async function syncEplCreateMatches() {
  if (!ESPN_EPL_AUTO_SYNC_ENABLED) {
    return;
  }

  if (eplCreateSyncInProgress) {
    return;
  }

  eplCreateSyncInProgress = true;

  try {
    const dates = getEplDateRangeToken(ESPN_EPL_SYNC_DAYS_AHEAD);
    const events = await fetchEplScoreboardEvents(dates);
    let created = 0;
    let updated = 0;

    for (const event of events) {
      const incoming = buildEplMatchFromEspnEvent(event);
      if (!incoming?.espnEventId) {
        continue;
      }

      const existing = await Match.findOne({ espnEventId: incoming.espnEventId, sport: "football", league: "epl" });
      if (!existing) {
        const matchCode = await generateMatchCode();
        await Match.create({
          espnEventId: incoming.espnEventId,
          sport: "football",
          league: "epl",
          matchCode,
          homeTeam: incoming.homeTeam,
          awayTeam: incoming.awayTeam,
          stadium: incoming.stadium,
          kickoff: incoming.kickoff,
          scoreHome: incoming.hasLiveScore ? incoming.scoreHome : 0,
          scoreAway: incoming.hasLiveScore ? incoming.scoreAway : 0,
          odds: incoming.odds,
          status: "open"
        });
        created += 1;
        continue;
      }

      if (existing.status !== "open") {
        continue;
      }

      let changed = false;

      if (existing.homeTeam !== incoming.homeTeam) {
        existing.homeTeam = incoming.homeTeam;
        changed = true;
      }

      if (existing.awayTeam !== incoming.awayTeam) {
        existing.awayTeam = incoming.awayTeam;
        changed = true;
      }

      const incomingStadium = incoming.stadium || "";
      if ((existing.stadium || "") !== incomingStadium) {
        existing.stadium = incomingStadium;
        changed = true;
      }

      if (new Date(existing.kickoff).getTime() !== incoming.kickoff.getTime()) {
        existing.kickoff = incoming.kickoff;
        changed = true;
      }

      if (changed) {
        await existing.save();
        updated += 1;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`EPL create sync complete: created ${created} match(es), updated ${updated} match(es).`);
    }
  } finally {
    eplCreateSyncInProgress = false;
  }
}

async function syncEplPrematchOdds({ forcePrematch = false } = {}) {
  if (!ESPN_EPL_AUTO_SYNC_ENABLED) {
    return;
  }

  if (eplPrematchSyncInProgress) {
    return;
  }

  eplPrematchSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "epl",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $gt: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeToken(ESPN_EPL_SYNC_DAYS_AHEAD);
    const events = await fetchEplScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildEplMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let checked = 0;
    let oddsUpdated = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming || incoming.odds.length === 0) {
        continue;
      }

      const kickoffTime = new Date(match.kickoff).getTime();
      if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
        continue;
      }

      const timeToKickoffMs = kickoffTime - Date.now();
      const requiredIntervalMs = timeToKickoffMs <= ESPN_EPL_PREMATCH_NEAR_WINDOW_MS
        ? ESPN_EPL_PREMATCH_SYNC_NEAR_INTERVAL_MS
        : ESPN_EPL_PREMATCH_SYNC_FAR_INTERVAL_MS;

      const lastSyncedAt = match.prematchOddsSyncedAt ? new Date(match.prematchOddsSyncedAt) : null;
      const lastSyncedMs = lastSyncedAt && Number.isFinite(lastSyncedAt.getTime())
        ? lastSyncedAt.getTime()
        : null;

      if (!forcePrematch && lastSyncedMs && (Date.now() - lastSyncedMs) < requiredIntervalMs) {
        continue;
      }

      checked += 1;
      const beforeOdds = JSON.stringify(match.odds || []);
      const nextOdds = JSON.stringify(incoming.odds);

      match.odds = incoming.odds;
      match.prematchOddsSyncedAt = now;

      if (beforeOdds !== nextOdds) {
        oddsUpdated += 1;
      }

      await match.save();
    }

    if (checked > 0 || oddsUpdated > 0) {
      console.log(`EPL prematch odds sync: checked ${checked}, updated ${oddsUpdated}.`);
    }
  } finally {
    eplPrematchSyncInProgress = false;
  }
}

async function syncEplLiveOddsAndScores() {
  if (!ESPN_EPL_AUTO_SYNC_ENABLED) {
    return;
  }

  if (eplLiveSyncInProgress) {
    return;
  }

  eplLiveSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "epl",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $lte: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeTokenWithOffsets(-1, 1);
    const events = await fetchEplScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildEplMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let updated = 0;
    let scoresUpdated = 0;
    let autoClosed = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming) {
        continue;
      }

      let changed = false;

      match.homeTeam = incoming.homeTeam;
      match.awayTeam = incoming.awayTeam;
      match.stadium = incoming.stadium || match.stadium;
      match.kickoff = incoming.kickoff;

      if (incoming.hasLiveScore) {
        const scoreChanged = match.scoreHome !== incoming.scoreHome || match.scoreAway !== incoming.scoreAway;
        match.scoreHome = incoming.scoreHome;
        match.scoreAway = incoming.scoreAway;
        if (scoreChanged) {
          scoresUpdated += 1;
        }
        changed = true;
      }

      const isPostState = incoming.state === "post";
      if (ESPN_EPL_AUTO_CLOSE_ENABLED && isPostState) {
        const winnerKeys = deriveWinnerKeysByScore(incoming.scoreHome, incoming.scoreAway, match.odds);
        if (winnerKeys.length > 0) {
          await closeMatchAndSettleBets(match, {
            winnerKeys,
            scoreHome: incoming.scoreHome,
            scoreAway: incoming.scoreAway
          });
          autoClosed += 1;
          continue;
        }
      }

      if (changed) {
        await match.save();
        updated += 1;
      }
    }

    if (updated > 0 || scoresUpdated > 0 || autoClosed > 0) {
      console.log(
        `EPL live sync complete: updated ${updated}, scores updated ${scoresUpdated}, auto closed ${autoClosed}.`
      );
    }
  } finally {
    eplLiveSyncInProgress = false;
  }
}

function startEplCreateSyncScheduler() {
  if (eplCreateSyncIntervalId) {
    clearInterval(eplCreateSyncIntervalId);
  }

  if (!ESPN_EPL_AUTO_SYNC_ENABLED) {
    console.log("EPL auto-sync is disabled (ESPN_EPL_AUTO_SYNC_ENABLED=false).");
    return;
  }

  eplCreateSyncIntervalId = setInterval(() => {
    void syncEplCreateMatches().catch((error) => {
      console.error("Failed to create EPL matches from ESPN:", error);
    });
  }, ESPN_EPL_CREATE_SYNC_INTERVAL_MS);
}

function startEplLiveSyncScheduler() {
  if (eplLiveSyncIntervalId) {
    clearInterval(eplLiveSyncIntervalId);
  }

  if (!ESPN_EPL_AUTO_SYNC_ENABLED) {
    console.log("EPL auto-sync is disabled (ESPN_EPL_AUTO_SYNC_ENABLED=false).");
    return;
  }

  eplLiveSyncIntervalId = setInterval(() => {
    void syncEplLiveOddsAndScores().catch((error) => {
      console.error("Failed to sync EPL live odds/score from ESPN:", error);
    });
  }, ESPN_EPL_LIVE_SYNC_INTERVAL_MS);
}

function startEplPrematchSyncScheduler() {
  if (eplPrematchSyncIntervalId) {
    clearInterval(eplPrematchSyncIntervalId);
  }

  if (!ESPN_EPL_AUTO_SYNC_ENABLED) {
    console.log("EPL auto-sync is disabled (ESPN_EPL_AUTO_SYNC_ENABLED=false).");
    return;
  }

  eplPrematchSyncIntervalId = setInterval(() => {
    void syncEplPrematchOdds().catch((error) => {
      console.error("Failed to sync EPL prematch odds from ESPN:", error);
    });
  }, ESPN_EPL_PREMATCH_SYNC_CHECK_INTERVAL_MS);
}

async function syncLaLigaCreateMatches() {
  if (!ESPN_LALIGA_AUTO_SYNC_ENABLED) {
    return;
  }

  if (laligaCreateSyncInProgress) {
    return;
  }

  laligaCreateSyncInProgress = true;

  try {
    const dates = getEplDateRangeToken(ESPN_LALIGA_SYNC_DAYS_AHEAD);
    const events = await fetchLaLigaScoreboardEvents(dates);
    let created = 0;
    let updated = 0;

    for (const event of events) {
      const incoming = buildLaLigaMatchFromEspnEvent(event);
      if (!incoming?.espnEventId) {
        continue;
      }

      const existing = await Match.findOne({ espnEventId: incoming.espnEventId, sport: "football", league: "laliga" });
      if (!existing) {
        const matchCode = await generateMatchCode();
        await Match.create({
          espnEventId: incoming.espnEventId,
          sport: "football",
          league: "laliga",
          matchCode,
          homeTeam: incoming.homeTeam,
          awayTeam: incoming.awayTeam,
          stadium: incoming.stadium,
          kickoff: incoming.kickoff,
          scoreHome: incoming.hasLiveScore ? incoming.scoreHome : 0,
          scoreAway: incoming.hasLiveScore ? incoming.scoreAway : 0,
          odds: incoming.odds,
          status: "open"
        });
        created += 1;
        continue;
      }

      if (existing.status !== "open") {
        continue;
      }

      let changed = false;

      if (existing.homeTeam !== incoming.homeTeam) {
        existing.homeTeam = incoming.homeTeam;
        changed = true;
      }

      if (existing.awayTeam !== incoming.awayTeam) {
        existing.awayTeam = incoming.awayTeam;
        changed = true;
      }

      const incomingStadium = incoming.stadium || "";
      if ((existing.stadium || "") !== incomingStadium) {
        existing.stadium = incomingStadium;
        changed = true;
      }

      if (new Date(existing.kickoff).getTime() !== incoming.kickoff.getTime()) {
        existing.kickoff = incoming.kickoff;
        changed = true;
      }

      if (changed) {
        await existing.save();
        updated += 1;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`LaLiga create sync complete: created ${created} match(es), updated ${updated} match(es).`);
    }
  } finally {
    laligaCreateSyncInProgress = false;
  }
}

async function syncLaLigaPrematchOdds({ forcePrematch = false } = {}) {
  if (!ESPN_LALIGA_AUTO_SYNC_ENABLED) {
    return;
  }

  if (laligaPrematchSyncInProgress) {
    return;
  }

  laligaPrematchSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "laliga",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $gt: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeToken(ESPN_LALIGA_SYNC_DAYS_AHEAD);
    const events = await fetchLaLigaScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildLaLigaMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let checked = 0;
    let oddsUpdated = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming || incoming.odds.length === 0) {
        continue;
      }

      const kickoffTime = new Date(match.kickoff).getTime();
      if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
        continue;
      }

      const timeToKickoffMs = kickoffTime - Date.now();
      const requiredIntervalMs = timeToKickoffMs <= ESPN_LALIGA_PREMATCH_NEAR_WINDOW_MS
        ? ESPN_LALIGA_PREMATCH_SYNC_NEAR_INTERVAL_MS
        : ESPN_LALIGA_PREMATCH_SYNC_FAR_INTERVAL_MS;

      const lastSyncedAt = match.prematchOddsSyncedAt ? new Date(match.prematchOddsSyncedAt) : null;
      const lastSyncedMs = lastSyncedAt && Number.isFinite(lastSyncedAt.getTime())
        ? lastSyncedAt.getTime()
        : null;

      if (!forcePrematch && lastSyncedMs && (Date.now() - lastSyncedMs) < requiredIntervalMs) {
        continue;
      }

      checked += 1;
      const beforeOdds = JSON.stringify(match.odds || []);
      const nextOdds = JSON.stringify(incoming.odds);

      match.odds = incoming.odds;
      match.prematchOddsSyncedAt = now;

      if (beforeOdds !== nextOdds) {
        oddsUpdated += 1;
      }

      await match.save();
    }

    if (checked > 0 || oddsUpdated > 0) {
      console.log(`LaLiga prematch odds sync: checked ${checked}, updated ${oddsUpdated}.`);
    }
  } finally {
    laligaPrematchSyncInProgress = false;
  }
}

async function syncLaLigaLiveOddsAndScores() {
  if (!ESPN_LALIGA_AUTO_SYNC_ENABLED) {
    return;
  }

  if (laligaLiveSyncInProgress) {
    return;
  }

  laligaLiveSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "laliga",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $lte: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeTokenWithOffsets(-1, 1);
    const events = await fetchLaLigaScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildLaLigaMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let updated = 0;
    let scoresUpdated = 0;
    let autoClosed = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming) {
        continue;
      }

      let changed = false;

      match.homeTeam = incoming.homeTeam;
      match.awayTeam = incoming.awayTeam;
      match.stadium = incoming.stadium || match.stadium;
      match.kickoff = incoming.kickoff;

      if (incoming.hasLiveScore) {
        const scoreChanged = match.scoreHome !== incoming.scoreHome || match.scoreAway !== incoming.scoreAway;
        match.scoreHome = incoming.scoreHome;
        match.scoreAway = incoming.scoreAway;
        if (scoreChanged) {
          scoresUpdated += 1;
        }
        changed = true;
      }

      const isPostState = incoming.state === "post";
      if (ESPN_LALIGA_AUTO_CLOSE_ENABLED && isPostState) {
        const winnerKeys = deriveWinnerKeysByScore(incoming.scoreHome, incoming.scoreAway, match.odds);
        if (winnerKeys.length > 0) {
          await closeMatchAndSettleBets(match, {
            winnerKeys,
            scoreHome: incoming.scoreHome,
            scoreAway: incoming.scoreAway
          });
          autoClosed += 1;
          continue;
        }
      }

      if (changed) {
        await match.save();
        updated += 1;
      }
    }

    if (updated > 0 || scoresUpdated > 0 || autoClosed > 0) {
      console.log(
        `LaLiga live sync complete: updated ${updated}, scores updated ${scoresUpdated}, auto closed ${autoClosed}.`
      );
    }
  } finally {
    laligaLiveSyncInProgress = false;
  }
}

function startLaLigaCreateSyncScheduler() {
  if (laligaCreateSyncIntervalId) {
    clearInterval(laligaCreateSyncIntervalId);
  }

  if (!ESPN_LALIGA_AUTO_SYNC_ENABLED) {
    console.log("LaLiga auto-sync is disabled (ESPN_LALIGA_AUTO_SYNC_ENABLED=false).");
    return;
  }

  laligaCreateSyncIntervalId = setInterval(() => {
    void syncLaLigaCreateMatches().catch((error) => {
      console.error("Failed to create LaLiga matches from ESPN:", error);
    });
  }, ESPN_LALIGA_CREATE_SYNC_INTERVAL_MS);
}

function startLaLigaLiveSyncScheduler() {
  if (laligaLiveSyncIntervalId) {
    clearInterval(laligaLiveSyncIntervalId);
  }

  if (!ESPN_LALIGA_AUTO_SYNC_ENABLED) {
    console.log("LaLiga auto-sync is disabled (ESPN_LALIGA_AUTO_SYNC_ENABLED=false).");
    return;
  }

  laligaLiveSyncIntervalId = setInterval(() => {
    void syncLaLigaLiveOddsAndScores().catch((error) => {
      console.error("Failed to sync LaLiga live odds/score from ESPN:", error);
    });
  }, ESPN_LALIGA_LIVE_SYNC_INTERVAL_MS);
}

function startLaLigaPrematchSyncScheduler() {
  if (laligaPrematchSyncIntervalId) {
    clearInterval(laligaPrematchSyncIntervalId);
  }

  if (!ESPN_LALIGA_AUTO_SYNC_ENABLED) {
    console.log("LaLiga auto-sync is disabled (ESPN_LALIGA_AUTO_SYNC_ENABLED=false).");
    return;
  }

  laligaPrematchSyncIntervalId = setInterval(() => {
    void syncLaLigaPrematchOdds().catch((error) => {
      console.error("Failed to sync LaLiga prematch odds from ESPN:", error);
    });
  }, ESPN_LALIGA_PREMATCH_SYNC_CHECK_INTERVAL_MS);
}

async function syncAfcCreateMatches() {
  if (!ESPN_AFC_AUTO_SYNC_ENABLED) {
    return;
  }

  if (afcCreateSyncInProgress) {
    return;
  }

  afcCreateSyncInProgress = true;

  try {
    const dates = getEplDateRangeToken(ESPN_AFC_SYNC_DAYS_AHEAD);
    const events = await fetchAfcScoreboardEvents(dates);
    let created = 0;
    let updated = 0;

    for (const event of events) {
      const incoming = buildAfcMatchFromEspnEvent(event);
      if (!incoming?.espnEventId) {
        continue;
      }

      const existing = await Match.findOne({ espnEventId: incoming.espnEventId, sport: "football", league: "uefa" });
      if (!existing) {
        const matchCode = await generateMatchCode();
        await Match.create({
          espnEventId: incoming.espnEventId,
          sport: "football",
          league: "uefa",
          matchCode,
          homeTeam: incoming.homeTeam,
          awayTeam: incoming.awayTeam,
          stadium: incoming.stadium,
          kickoff: incoming.kickoff,
          scoreHome: incoming.hasLiveScore ? incoming.scoreHome : 0,
          scoreAway: incoming.hasLiveScore ? incoming.scoreAway : 0,
          odds: incoming.odds,
          status: "open"
        });
        created += 1;
        continue;
      }

      if (existing.status !== "open") {
        continue;
      }

      let changed = false;

      if (existing.homeTeam !== incoming.homeTeam) {
        existing.homeTeam = incoming.homeTeam;
        changed = true;
      }

      if (existing.awayTeam !== incoming.awayTeam) {
        existing.awayTeam = incoming.awayTeam;
        changed = true;
      }

      const incomingStadium = incoming.stadium || "";
      if ((existing.stadium || "") !== incomingStadium) {
        existing.stadium = incomingStadium;
        changed = true;
      }

      if (new Date(existing.kickoff).getTime() !== incoming.kickoff.getTime()) {
        existing.kickoff = incoming.kickoff;
        changed = true;
      }

      if (changed) {
        await existing.save();
        updated += 1;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`UEFA Champions create sync complete: created ${created} match(es), updated ${updated} match(es).`);
    }
  } finally {
    afcCreateSyncInProgress = false;
  }
}

async function syncAfcPrematchOdds({ forcePrematch = false } = {}) {
  if (!ESPN_AFC_AUTO_SYNC_ENABLED) {
    return;
  }

  if (afcPrematchSyncInProgress) {
    return;
  }

  afcPrematchSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "uefa",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $gt: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeToken(ESPN_AFC_SYNC_DAYS_AHEAD);
    const events = await fetchAfcScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildAfcMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let checked = 0;
    let oddsUpdated = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming || incoming.odds.length === 0) {
        continue;
      }

      const kickoffTime = new Date(match.kickoff).getTime();
      if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
        continue;
      }

      const timeToKickoffMs = kickoffTime - Date.now();
      const requiredIntervalMs = timeToKickoffMs <= ESPN_AFC_PREMATCH_NEAR_WINDOW_MS
        ? ESPN_AFC_PREMATCH_SYNC_NEAR_INTERVAL_MS
        : ESPN_AFC_PREMATCH_SYNC_FAR_INTERVAL_MS;

      const lastSyncedAt = match.prematchOddsSyncedAt ? new Date(match.prematchOddsSyncedAt) : null;
      const lastSyncedMs = lastSyncedAt && Number.isFinite(lastSyncedAt.getTime())
        ? lastSyncedAt.getTime()
        : null;

      if (!forcePrematch && lastSyncedMs && (Date.now() - lastSyncedMs) < requiredIntervalMs) {
        continue;
      }

      checked += 1;
      const beforeOdds = JSON.stringify(match.odds || []);
      const nextOdds = JSON.stringify(incoming.odds);

      match.odds = incoming.odds;
      match.prematchOddsSyncedAt = now;

      if (beforeOdds !== nextOdds) {
        oddsUpdated += 1;
      }

      await match.save();
    }

    if (checked > 0 || oddsUpdated > 0) {
      console.log(`UEFA Champions prematch odds sync: checked ${checked}, updated ${oddsUpdated}.`);
    }
  } finally {
    afcPrematchSyncInProgress = false;
  }
}

async function syncAfcLiveOddsAndScores() {
  if (!ESPN_AFC_AUTO_SYNC_ENABLED) {
    return;
  }

  if (afcLiveSyncInProgress) {
    return;
  }

  afcLiveSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "uefa",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $lte: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeTokenWithOffsets(-1, 1);
    const events = await fetchAfcScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildAfcMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let updated = 0;
    let scoresUpdated = 0;
    let autoClosed = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming) {
        continue;
      }

      let changed = false;

      match.homeTeam = incoming.homeTeam;
      match.awayTeam = incoming.awayTeam;
      match.stadium = incoming.stadium || match.stadium;
      match.kickoff = incoming.kickoff;

      if (incoming.hasLiveScore) {
        const scoreChanged = match.scoreHome !== incoming.scoreHome || match.scoreAway !== incoming.scoreAway;
        match.scoreHome = incoming.scoreHome;
        match.scoreAway = incoming.scoreAway;
        if (scoreChanged) {
          scoresUpdated += 1;
        }
        changed = true;
      }

      const isPostState = incoming.state === "post";
      if (ESPN_AFC_AUTO_CLOSE_ENABLED && isPostState) {
        const winnerKeys = deriveWinnerKeysByScore(incoming.scoreHome, incoming.scoreAway, match.odds);
        if (winnerKeys.length > 0) {
          await closeMatchAndSettleBets(match, {
            winnerKeys,
            scoreHome: incoming.scoreHome,
            scoreAway: incoming.scoreAway
          });
          autoClosed += 1;
          continue;
        }
      }

      if (changed) {
        await match.save();
        updated += 1;
      }
    }

    if (updated > 0 || scoresUpdated > 0 || autoClosed > 0) {
      console.log(
        `UEFA Champions live sync complete: updated ${updated}, scores updated ${scoresUpdated}, auto closed ${autoClosed}.`
      );
    }
  } finally {
    afcLiveSyncInProgress = false;
  }
}

function startAfcCreateSyncScheduler() {
  if (afcCreateSyncIntervalId) {
    clearInterval(afcCreateSyncIntervalId);
  }

  if (!ESPN_AFC_AUTO_SYNC_ENABLED) {
    console.log("UEFA Champions auto-sync is disabled (ESPN_AFC_AUTO_SYNC_ENABLED=false).");
    return;
  }

  afcCreateSyncIntervalId = setInterval(() => {
    void syncAfcCreateMatches().catch((error) => {
      console.error("Failed to create UEFA Champions matches from ESPN:", error);
    });
  }, ESPN_AFC_CREATE_SYNC_INTERVAL_MS);
}

function startAfcLiveSyncScheduler() {
  if (afcLiveSyncIntervalId) {
    clearInterval(afcLiveSyncIntervalId);
  }

  if (!ESPN_AFC_AUTO_SYNC_ENABLED) {
    console.log("UEFA Champions auto-sync is disabled (ESPN_AFC_AUTO_SYNC_ENABLED=false).");
    return;
  }

  afcLiveSyncIntervalId = setInterval(() => {
    void syncAfcLiveOddsAndScores().catch((error) => {
      console.error("Failed to sync UEFA Champions live odds/score from ESPN:", error);
    });
  }, ESPN_AFC_LIVE_SYNC_INTERVAL_MS);
}

function startAfcPrematchSyncScheduler() {
  if (afcPrematchSyncIntervalId) {
    clearInterval(afcPrematchSyncIntervalId);
  }

  if (!ESPN_AFC_AUTO_SYNC_ENABLED) {
    console.log("UEFA Champions auto-sync is disabled (ESPN_AFC_AUTO_SYNC_ENABLED=false).");
    return;
  }

  afcPrematchSyncIntervalId = setInterval(() => {
    void syncAfcPrematchOdds().catch((error) => {
      console.error("Failed to sync UEFA Champions prematch odds from ESPN:", error);
    });
  }, ESPN_AFC_PREMATCH_SYNC_CHECK_INTERVAL_MS);
}

async function syncAfcAsianCupCreateMatches() {
  if (!ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED) {
    return;
  }

  if (afcAsianCupCreateSyncInProgress) {
    return;
  }

  afcAsianCupCreateSyncInProgress = true;

  try {
    const dates = getEplDateRangeToken(ESPN_AFC_ASIAN_CUP_SYNC_DAYS_AHEAD);
    const events = await fetchAfcAsianCupScoreboardEvents(dates);
    let created = 0;
    let updated = 0;

    for (const event of events) {
      const incoming = buildAfcAsianCupMatchFromEspnEvent(event);
      if (!incoming?.espnEventId) {
        continue;
      }

      const existing = await Match.findOne({ espnEventId: incoming.espnEventId, sport: "football", league: "afc_asian_cup" });
      if (!existing) {
        const matchCode = await generateMatchCode();
        await Match.create({
          espnEventId: incoming.espnEventId,
          sport: "football",
          league: "afc_asian_cup",
          matchCode,
          homeTeam: incoming.homeTeam,
          awayTeam: incoming.awayTeam,
          stadium: incoming.stadium,
          kickoff: incoming.kickoff,
          scoreHome: incoming.hasLiveScore ? incoming.scoreHome : 0,
          scoreAway: incoming.hasLiveScore ? incoming.scoreAway : 0,
          odds: incoming.odds,
          status: "open"
        });
        created += 1;
        continue;
      }

      if (existing.status !== "open") {
        continue;
      }

      let changed = false;

      if (existing.homeTeam !== incoming.homeTeam) {
        existing.homeTeam = incoming.homeTeam;
        changed = true;
      }

      if (existing.awayTeam !== incoming.awayTeam) {
        existing.awayTeam = incoming.awayTeam;
        changed = true;
      }

      const incomingStadium = incoming.stadium || "";
      if ((existing.stadium || "") !== incomingStadium) {
        existing.stadium = incomingStadium;
        changed = true;
      }

      if (new Date(existing.kickoff).getTime() !== incoming.kickoff.getTime()) {
        existing.kickoff = incoming.kickoff;
        changed = true;
      }

      if (changed) {
        await existing.save();
        updated += 1;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`AFC Asian Cup create sync complete: created ${created} match(es), updated ${updated} match(es).`);
    }
  } finally {
    afcAsianCupCreateSyncInProgress = false;
  }
}

async function syncAfcAsianCupPrematchOdds({ forcePrematch = false } = {}) {
  if (!ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED) {
    return;
  }

  if (afcAsianCupPrematchSyncInProgress) {
    return;
  }

  afcAsianCupPrematchSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "afc_asian_cup",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $gt: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeToken(ESPN_AFC_ASIAN_CUP_SYNC_DAYS_AHEAD);
    const events = await fetchAfcAsianCupScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildAfcAsianCupMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let checked = 0;
    let oddsUpdated = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming || incoming.odds.length === 0) {
        continue;
      }

      const kickoffTime = new Date(match.kickoff).getTime();
      if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
        continue;
      }

      const timeToKickoffMs = kickoffTime - Date.now();
      const requiredIntervalMs = timeToKickoffMs <= ESPN_AFC_ASIAN_CUP_PREMATCH_NEAR_WINDOW_MS
        ? ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_NEAR_INTERVAL_MS
        : ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_FAR_INTERVAL_MS;

      const lastSyncedAt = match.prematchOddsSyncedAt ? new Date(match.prematchOddsSyncedAt) : null;
      const lastSyncedMs = lastSyncedAt && Number.isFinite(lastSyncedAt.getTime())
        ? lastSyncedAt.getTime()
        : null;

      if (!forcePrematch && lastSyncedMs && (Date.now() - lastSyncedMs) < requiredIntervalMs) {
        continue;
      }

      checked += 1;
      const beforeOdds = JSON.stringify(match.odds || []);
      const nextOdds = JSON.stringify(incoming.odds);

      match.odds = incoming.odds;
      match.prematchOddsSyncedAt = now;

      if (beforeOdds !== nextOdds) {
        oddsUpdated += 1;
      }

      await match.save();
    }

    if (checked > 0 || oddsUpdated > 0) {
      console.log(`AFC Asian Cup prematch odds sync: checked ${checked}, updated ${oddsUpdated}.`);
    }
  } finally {
    afcAsianCupPrematchSyncInProgress = false;
  }
}

async function syncAfcAsianCupLiveOddsAndScores() {
  if (!ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED) {
    return;
  }

  if (afcAsianCupLiveSyncInProgress) {
    return;
  }

  afcAsianCupLiveSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "afc_asian_cup",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $lte: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeTokenWithOffsets(-1, 1);
    const events = await fetchAfcAsianCupScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildAfcAsianCupMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let updated = 0;
    let scoresUpdated = 0;
    let autoClosed = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming) {
        continue;
      }

      let changed = false;

      match.homeTeam = incoming.homeTeam;
      match.awayTeam = incoming.awayTeam;
      match.stadium = incoming.stadium || match.stadium;
      match.kickoff = incoming.kickoff;

      if (incoming.hasLiveScore) {
        const scoreChanged = match.scoreHome !== incoming.scoreHome || match.scoreAway !== incoming.scoreAway;
        match.scoreHome = incoming.scoreHome;
        match.scoreAway = incoming.scoreAway;
        if (scoreChanged) {
          scoresUpdated += 1;
        }
        changed = true;
      }

      const isPostState = incoming.state === "post";
      if (ESPN_AFC_ASIAN_CUP_AUTO_CLOSE_ENABLED && isPostState) {
        const winnerKeys = deriveWinnerKeysByScore(incoming.scoreHome, incoming.scoreAway, match.odds);
        if (winnerKeys.length > 0) {
          await closeMatchAndSettleBets(match, {
            winnerKeys,
            scoreHome: incoming.scoreHome,
            scoreAway: incoming.scoreAway
          });
          autoClosed += 1;
          continue;
        }
      }

      if (changed) {
        await match.save();
        updated += 1;
      }
    }

    if (updated > 0 || scoresUpdated > 0 || autoClosed > 0) {
      console.log(
        `AFC Asian Cup live sync complete: updated ${updated}, scores updated ${scoresUpdated}, auto closed ${autoClosed}.`
      );
    }
  } finally {
    afcAsianCupLiveSyncInProgress = false;
  }
}

function startAfcAsianCupCreateSyncScheduler() {
  if (afcAsianCupCreateSyncIntervalId) {
    clearInterval(afcAsianCupCreateSyncIntervalId);
  }

  if (!ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED) {
    console.log("AFC Asian Cup auto-sync is disabled (ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED=false).");
    return;
  }

  afcAsianCupCreateSyncIntervalId = setInterval(() => {
    void syncAfcAsianCupCreateMatches().catch((error) => {
      console.error("Failed to create AFC Asian Cup matches from ESPN:", error);
    });
  }, ESPN_AFC_ASIAN_CUP_CREATE_SYNC_INTERVAL_MS);
}

function startAfcAsianCupLiveSyncScheduler() {
  if (afcAsianCupLiveSyncIntervalId) {
    clearInterval(afcAsianCupLiveSyncIntervalId);
  }

  if (!ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED) {
    console.log("AFC Asian Cup auto-sync is disabled (ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED=false).");
    return;
  }

  afcAsianCupLiveSyncIntervalId = setInterval(() => {
    void syncAfcAsianCupLiveOddsAndScores().catch((error) => {
      console.error("Failed to sync AFC Asian Cup live odds/score from ESPN:", error);
    });
  }, ESPN_AFC_ASIAN_CUP_LIVE_SYNC_INTERVAL_MS);
}

function startAfcAsianCupPrematchSyncScheduler() {
  if (afcAsianCupPrematchSyncIntervalId) {
    clearInterval(afcAsianCupPrematchSyncIntervalId);
  }

  if (!ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED) {
    console.log("AFC Asian Cup auto-sync is disabled (ESPN_AFC_ASIAN_CUP_AUTO_SYNC_ENABLED=false).");
    return;
  }

  afcAsianCupPrematchSyncIntervalId = setInterval(() => {
    void syncAfcAsianCupPrematchOdds().catch((error) => {
      console.error("Failed to sync AFC Asian Cup prematch odds from ESPN:", error);
    });
  }, ESPN_AFC_ASIAN_CUP_PREMATCH_SYNC_CHECK_INTERVAL_MS);
}

async function syncKsa1CreateMatches() {
  if (!ESPN_KSA1_AUTO_SYNC_ENABLED) {
    return;
  }

  if (ksa1CreateSyncInProgress) {
    return;
  }

  ksa1CreateSyncInProgress = true;

  try {
    const dates = getEplDateRangeToken(ESPN_KSA1_SYNC_DAYS_AHEAD);
    const events = await fetchKsa1ScoreboardEvents(dates);
    let created = 0;
    let updated = 0;

    for (const event of events) {
      const incoming = buildKsa1MatchFromEspnEvent(event);
      if (!incoming?.espnEventId) {
        continue;
      }

      const existing = await Match.findOne({ espnEventId: incoming.espnEventId, sport: "football", league: "ksa1" });
      if (!existing) {
        const matchCode = await generateMatchCode();
        await Match.create({
          espnEventId: incoming.espnEventId,
          sport: "football",
          league: "ksa1",
          matchCode,
          homeTeam: incoming.homeTeam,
          awayTeam: incoming.awayTeam,
          stadium: incoming.stadium,
          kickoff: incoming.kickoff,
          scoreHome: incoming.hasLiveScore ? incoming.scoreHome : 0,
          scoreAway: incoming.hasLiveScore ? incoming.scoreAway : 0,
          odds: incoming.odds,
          status: "open"
        });
        created += 1;
        continue;
      }

      if (existing.status !== "open") {
        continue;
      }

      let changed = false;

      if (existing.homeTeam !== incoming.homeTeam) {
        existing.homeTeam = incoming.homeTeam;
        changed = true;
      }

      if (existing.awayTeam !== incoming.awayTeam) {
        existing.awayTeam = incoming.awayTeam;
        changed = true;
      }

      const incomingStadium = incoming.stadium || "";
      if ((existing.stadium || "") !== incomingStadium) {
        existing.stadium = incomingStadium;
        changed = true;
      }

      if (new Date(existing.kickoff).getTime() !== incoming.kickoff.getTime()) {
        existing.kickoff = incoming.kickoff;
        changed = true;
      }

      if (changed) {
        await existing.save();
        updated += 1;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`KSA create sync complete: created ${created} match(es), updated ${updated} match(es).`);
    }
  } finally {
    ksa1CreateSyncInProgress = false;
  }
}

async function syncKsa1PrematchOdds({ forcePrematch = false } = {}) {
  if (!ESPN_KSA1_AUTO_SYNC_ENABLED) {
    return;
  }

  if (ksa1PrematchSyncInProgress) {
    return;
  }

  ksa1PrematchSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "ksa1",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $gt: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeToken(ESPN_KSA1_SYNC_DAYS_AHEAD);
    const events = await fetchKsa1ScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildKsa1MatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let checked = 0;
    let oddsUpdated = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming || incoming.odds.length === 0) {
        continue;
      }

      const kickoffTime = new Date(match.kickoff).getTime();
      if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
        continue;
      }

      const timeToKickoffMs = kickoffTime - Date.now();
      const requiredIntervalMs = timeToKickoffMs <= ESPN_KSA1_PREMATCH_NEAR_WINDOW_MS
        ? ESPN_KSA1_PREMATCH_SYNC_NEAR_INTERVAL_MS
        : ESPN_KSA1_PREMATCH_SYNC_FAR_INTERVAL_MS;

      const lastSyncedAt = match.prematchOddsSyncedAt ? new Date(match.prematchOddsSyncedAt) : null;
      const lastSyncedMs = lastSyncedAt && Number.isFinite(lastSyncedAt.getTime())
        ? lastSyncedAt.getTime()
        : null;

      if (!forcePrematch && lastSyncedMs && (Date.now() - lastSyncedMs) < requiredIntervalMs) {
        continue;
      }

      checked += 1;
      const beforeOdds = JSON.stringify(match.odds || []);
      const nextOdds = JSON.stringify(incoming.odds);

      match.odds = incoming.odds;
      match.prematchOddsSyncedAt = now;

      if (beforeOdds !== nextOdds) {
        oddsUpdated += 1;
      }

      await match.save();
    }

    if (checked > 0 || oddsUpdated > 0) {
      console.log(`KSA prematch odds sync: checked ${checked}, updated ${oddsUpdated}.`);
    }
  } finally {
    ksa1PrematchSyncInProgress = false;
  }
}

async function syncKsa1LiveOddsAndScores() {
  if (!ESPN_KSA1_AUTO_SYNC_ENABLED) {
    return;
  }

  if (ksa1LiveSyncInProgress) {
    return;
  }

  ksa1LiveSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "football",
      league: "ksa1",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $lte: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getEplDateRangeTokenWithOffsets(-1, 1);
    const events = await fetchKsa1ScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildKsa1MatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let updated = 0;
    let scoresUpdated = 0;
    let autoClosed = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming) {
        continue;
      }

      let changed = false;

      match.homeTeam = incoming.homeTeam;
      match.awayTeam = incoming.awayTeam;
      match.stadium = incoming.stadium || match.stadium;
      match.kickoff = incoming.kickoff;

      if (incoming.hasLiveScore) {
        const scoreChanged = match.scoreHome !== incoming.scoreHome || match.scoreAway !== incoming.scoreAway;
        match.scoreHome = incoming.scoreHome;
        match.scoreAway = incoming.scoreAway;
        if (scoreChanged) {
          scoresUpdated += 1;
        }
        changed = true;
      }

      const isPostState = incoming.state === "post";
      if (ESPN_KSA1_AUTO_CLOSE_ENABLED && isPostState) {
        const winnerKeys = deriveWinnerKeysByScore(incoming.scoreHome, incoming.scoreAway, match.odds);
        if (winnerKeys.length > 0) {
          await closeMatchAndSettleBets(match, {
            winnerKeys,
            scoreHome: incoming.scoreHome,
            scoreAway: incoming.scoreAway
          });
          autoClosed += 1;
          continue;
        }
      }

      if (changed) {
        await match.save();
        updated += 1;
      }
    }

    if (updated > 0 || scoresUpdated > 0 || autoClosed > 0) {
      console.log(
        `KSA live sync complete: updated ${updated}, scores updated ${scoresUpdated}, auto closed ${autoClosed}.`
      );
    }
  } finally {
    ksa1LiveSyncInProgress = false;
  }
}

function startKsa1CreateSyncScheduler() {
  if (ksa1CreateSyncIntervalId) {
    clearInterval(ksa1CreateSyncIntervalId);
  }

  if (!ESPN_KSA1_AUTO_SYNC_ENABLED) {
    console.log("KSA auto-sync is disabled (ESPN_KSA1_AUTO_SYNC_ENABLED=false).");
    return;
  }

  ksa1CreateSyncIntervalId = setInterval(() => {
    void syncKsa1CreateMatches().catch((error) => {
      console.error("Failed to create KSA matches from ESPN:", error);
    });
  }, ESPN_KSA1_CREATE_SYNC_INTERVAL_MS);
}

function startKsa1LiveSyncScheduler() {
  if (ksa1LiveSyncIntervalId) {
    clearInterval(ksa1LiveSyncIntervalId);
  }

  if (!ESPN_KSA1_AUTO_SYNC_ENABLED) {
    console.log("KSA auto-sync is disabled (ESPN_KSA1_AUTO_SYNC_ENABLED=false).");
    return;
  }

  ksa1LiveSyncIntervalId = setInterval(() => {
    void syncKsa1LiveOddsAndScores().catch((error) => {
      console.error("Failed to sync KSA live odds/score from ESPN:", error);
    });
  }, ESPN_KSA1_LIVE_SYNC_INTERVAL_MS);
}

function startKsa1PrematchSyncScheduler() {
  if (ksa1PrematchSyncIntervalId) {
    clearInterval(ksa1PrematchSyncIntervalId);
  }

  if (!ESPN_KSA1_AUTO_SYNC_ENABLED) {
    console.log("KSA auto-sync is disabled (ESPN_KSA1_AUTO_SYNC_ENABLED=false).");
    return;
  }

  ksa1PrematchSyncIntervalId = setInterval(() => {
    void syncKsa1PrematchOdds().catch((error) => {
      console.error("Failed to sync KSA prematch odds from ESPN:", error);
    });
  }, ESPN_KSA1_PREMATCH_SYNC_CHECK_INTERVAL_MS);
}

async function syncNbaCreateMatches() {
  if (!ESPN_NBA_AUTO_SYNC_ENABLED) {
    return;
  }

  if (nbaCreateSyncInProgress) {
    return;
  }

  nbaCreateSyncInProgress = true;

  try {
    const dates = getNbaDateRangeToken(ESPN_NBA_SYNC_DAYS_AHEAD);
    const events = await fetchNbaScoreboardEvents(dates);
    let created = 0;
    let updated = 0;

    for (const event of events) {
      const incoming = buildNbaMatchFromEspnEvent(event);
      if (!incoming?.espnEventId) {
        continue;
      }

      const existing = await Match.findOne({ espnEventId: incoming.espnEventId, sport: "basketball", league: "nba" });
      if (!existing) {
        const matchCode = await generateMatchCode();
        await Match.create({
          espnEventId: incoming.espnEventId,
          sport: "basketball",
          league: "nba",
          matchCode,
          homeTeam: incoming.homeTeam,
          awayTeam: incoming.awayTeam,
          stadium: incoming.stadium,
          kickoff: incoming.kickoff,
          scoreHome: incoming.hasLiveScore ? incoming.scoreHome : 0,
          scoreAway: incoming.hasLiveScore ? incoming.scoreAway : 0,
          odds: incoming.odds,
          status: "open"
        });
        created += 1;
        continue;
      }

      if (existing.status !== "open") {
        continue;
      }

      let changed = false;

      if (existing.homeTeam !== incoming.homeTeam) {
        existing.homeTeam = incoming.homeTeam;
        changed = true;
      }

      if (existing.awayTeam !== incoming.awayTeam) {
        existing.awayTeam = incoming.awayTeam;
        changed = true;
      }

      const incomingStadium = incoming.stadium || "";
      if ((existing.stadium || "") !== incomingStadium) {
        existing.stadium = incomingStadium;
        changed = true;
      }

      if (new Date(existing.kickoff).getTime() !== incoming.kickoff.getTime()) {
        existing.kickoff = incoming.kickoff;
        changed = true;
      }

      if (changed) {
        await existing.save();
        updated += 1;
      }
    }

    if (created > 0 || updated > 0) {
      console.log(`NBA create sync complete: created ${created} match(es), updated ${updated} match(es).`);
    }
  } finally {
    nbaCreateSyncInProgress = false;
  }
}

async function syncNbaPrematchOdds({ forcePrematch = false } = {}) {
  if (!ESPN_NBA_AUTO_SYNC_ENABLED) {
    return;
  }

  if (nbaPrematchSyncInProgress) {
    return;
  }

  nbaPrematchSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "basketball",
      league: "nba",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $gt: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getNbaDateRangeToken(ESPN_NBA_SYNC_DAYS_AHEAD);
    const events = await fetchNbaScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildNbaMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let checked = 0;
    let oddsUpdated = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming || incoming.odds.length === 0) {
        continue;
      }

      const kickoffTime = new Date(match.kickoff).getTime();
      if (!Number.isFinite(kickoffTime) || kickoffTime <= Date.now()) {
        continue;
      }

      const timeToKickoffMs = kickoffTime - Date.now();
      const requiredIntervalMs = timeToKickoffMs <= ESPN_NBA_PREMATCH_NEAR_WINDOW_MS
        ? ESPN_NBA_PREMATCH_SYNC_NEAR_INTERVAL_MS
        : ESPN_NBA_PREMATCH_SYNC_FAR_INTERVAL_MS;

      const lastSyncedAt = match.prematchOddsSyncedAt ? new Date(match.prematchOddsSyncedAt) : null;
      const lastSyncedMs = lastSyncedAt && Number.isFinite(lastSyncedAt.getTime())
        ? lastSyncedAt.getTime()
        : null;

      if (!forcePrematch && lastSyncedMs && (Date.now() - lastSyncedMs) < requiredIntervalMs) {
        continue;
      }

      checked += 1;
      const beforeOdds = JSON.stringify(match.odds || []);
      const nextOdds = JSON.stringify(incoming.odds);

      match.odds = incoming.odds;
      match.prematchOddsSyncedAt = now;

      if (beforeOdds !== nextOdds) {
        oddsUpdated += 1;
      }

      await match.save();
    }

    if (checked > 0 || oddsUpdated > 0) {
      console.log(`NBA prematch odds sync: checked ${checked}, updated ${oddsUpdated}.`);
    }
  } finally {
    nbaPrematchSyncInProgress = false;
  }
}

async function syncNbaLiveOddsAndScores() {
  if (!ESPN_NBA_AUTO_SYNC_ENABLED) {
    return;
  }

  if (nbaLiveSyncInProgress) {
    return;
  }

  nbaLiveSyncInProgress = true;

  try {
    const now = new Date();
    const candidates = await Match.find({
      sport: "basketball",
      league: "nba",
      status: "open",
      espnEventId: { $exists: true, $ne: "" },
      kickoff: { $lte: now }
    });

    if (candidates.length === 0) {
      return;
    }

    const dates = getNbaDateRangeTokenWithOffsets(-1, 1);
    const events = await fetchNbaScoreboardEvents(dates);
    const incomingByEventId = new Map();

    for (const event of events) {
      const incoming = buildNbaMatchFromEspnEvent(event);
      if (incoming?.espnEventId) {
        incomingByEventId.set(incoming.espnEventId, incoming);
      }
    }

    let updated = 0;
    let scoresUpdated = 0;
    let autoClosed = 0;

    for (const match of candidates) {
      const incoming = incomingByEventId.get(match.espnEventId);
      if (!incoming) {
        continue;
      }

      let changed = false;

      match.homeTeam = incoming.homeTeam;
      match.awayTeam = incoming.awayTeam;
      match.stadium = incoming.stadium || match.stadium;
      match.kickoff = incoming.kickoff;

      if (incoming.hasLiveScore) {
        const scoreChanged = match.scoreHome !== incoming.scoreHome || match.scoreAway !== incoming.scoreAway;
        match.scoreHome = incoming.scoreHome;
        match.scoreAway = incoming.scoreAway;
        if (scoreChanged) {
          scoresUpdated += 1;
        }
        changed = true;
      }

      const isPostState = incoming.state === "post";
      if (ESPN_NBA_AUTO_CLOSE_ENABLED && isPostState) {
        const winnerKeys = deriveWinnerKeysByScore(incoming.scoreHome, incoming.scoreAway, match.odds);
        if (winnerKeys.length > 0) {
          await closeMatchAndSettleBets(match, {
            winnerKeys,
            scoreHome: incoming.scoreHome,
            scoreAway: incoming.scoreAway
          });
          autoClosed += 1;
          continue;
        }
      }

      if (changed) {
        await match.save();
        updated += 1;
      }
    }

    if (updated > 0 || scoresUpdated > 0 || autoClosed > 0) {
      console.log(
        `NBA live sync complete: updated ${updated}, scores updated ${scoresUpdated}, auto closed ${autoClosed}.`
      );
    }
  } finally {
    nbaLiveSyncInProgress = false;
  }
}

function startNbaCreateSyncScheduler() {
  if (nbaCreateSyncIntervalId) {
    clearInterval(nbaCreateSyncIntervalId);
  }

  if (!ESPN_NBA_AUTO_SYNC_ENABLED) {
    console.log("NBA auto-sync is disabled (ESPN_NBA_AUTO_SYNC_ENABLED=false).");
    return;
  }

  nbaCreateSyncIntervalId = setInterval(() => {
    void syncNbaCreateMatches().catch((error) => {
      console.error("Failed to create NBA matches from ESPN:", error);
    });
  }, ESPN_NBA_CREATE_SYNC_INTERVAL_MS);
}

function startNbaLiveSyncScheduler() {
  if (nbaLiveSyncIntervalId) {
    clearInterval(nbaLiveSyncIntervalId);
  }

  if (!ESPN_NBA_AUTO_SYNC_ENABLED) {
    console.log("NBA auto-sync is disabled (ESPN_NBA_AUTO_SYNC_ENABLED=false).");
    return;
  }

  nbaLiveSyncIntervalId = setInterval(() => {
    void syncNbaLiveOddsAndScores().catch((error) => {
      console.error("Failed to sync NBA live odds/score from ESPN:", error);
    });
  }, ESPN_NBA_LIVE_SYNC_INTERVAL_MS);
}

function startNbaPrematchSyncScheduler() {
  if (nbaPrematchSyncIntervalId) {
    clearInterval(nbaPrematchSyncIntervalId);
  }

  if (!ESPN_NBA_AUTO_SYNC_ENABLED) {
    console.log("NBA auto-sync is disabled (ESPN_NBA_AUTO_SYNC_ENABLED=false).");
    return;
  }

  nbaPrematchSyncIntervalId = setInterval(() => {
    void syncNbaPrematchOdds().catch((error) => {
      console.error("Failed to sync NBA prematch odds from ESPN:", error);
    });
  }, ESPN_NBA_PREMATCH_SYNC_CHECK_INTERVAL_MS);
}

async function generateMatchCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = 100 + Math.floor(Math.random() * 900);
    const exists = await Match.exists({ matchCode: code });
    if (!exists) {
      return code;
    }
  }
  throw new Error("Failed to generate match code");
}

async function pruneOldMatches() {
  const matches = await Match.find({}).sort({ createdAt: -1 }).select("_id");
  if (matches.length <= 8) {
    return;
  }

  const staleIds = matches.slice(8).map((m) => m._id);
  await Match.deleteMany({ _id: { $in: staleIds } });
}

async function backfillMatchSports() {
  await Match.updateMany(
    {
      $or: [
        { sport: { $exists: false } },
        { sport: null },
        { sport: "" }
      ]
    },
    {
      $set: {
        sport: "football"
      }
    }
  );

  await Match.updateMany(
    {
      sport: "football",
      $or: [
        { league: { $exists: false } },
        { league: null },
        { league: "" }
      ]
    },
    {
      $set: {
        league: "epl"
      }
    }
  );

  await Match.updateMany(
    {
      sport: "basketball",
      $or: [
        { league: { $exists: false } },
        { league: null },
        { league: "" }
      ]
    },
    {
      $set: {
        league: "nba"
      }
    }
  );
}

async function cleanupOldBettingData() {
  const now = Date.now();
  const matchCutoff = new Date(now - Math.max(1, MATCH_HISTORY_RETENTION_DAYS) * 24 * 60 * 60_000);
  const betCutoff = new Date(now - Math.max(1, BET_HISTORY_RETENTION_DAYS) * 24 * 60 * 60_000);

  const staleMatches = await Match.find({
    status: "closed",
    kickoff: { $lt: matchCutoff }
  }).select("_id");

  if (staleMatches.length > 0) {
    const staleMatchIds = staleMatches.map((item) => item._id);
    await Bet.deleteMany({ matchId: { $in: staleMatchIds } });
    await Match.deleteMany({ _id: { $in: staleMatchIds } });
  }

  await Bet.deleteMany({
    status: { $in: ["won", "lost"] },
    createdAt: { $lt: betCutoff }
  });
}

function startDataCleanupScheduler() {
  if (dataCleanupIntervalId) {
    clearInterval(dataCleanupIntervalId);
  }

  dataCleanupIntervalId = setInterval(() => {
    void cleanupOldBettingData().catch((error) => {
      console.error("Failed to cleanup old betting data:", error);
    });
  }, DATA_CLEANUP_INTERVAL_MS);
}

async function runManualSyncNow({ forcePrematch = false } = {}) {
  if (manualSyncInProgress) {
    return { skipped: true, reason: "manual-sync-in-progress" };
  }

  manualSyncInProgress = true;

  try {
    await syncEplCreateMatches();
    await syncEplPrematchOdds({ forcePrematch });
    await syncEplLiveOddsAndScores();

    await syncLaLigaCreateMatches();
    await syncLaLigaPrematchOdds({ forcePrematch });
    await syncLaLigaLiveOddsAndScores();

    await syncAfcCreateMatches();
    await syncAfcPrematchOdds({ forcePrematch });
    await syncAfcLiveOddsAndScores();

    await syncAfcAsianCupCreateMatches();
    await syncAfcAsianCupPrematchOdds({ forcePrematch });
    await syncAfcAsianCupLiveOddsAndScores();

    await syncKsa1CreateMatches();
    await syncKsa1PrematchOdds({ forcePrematch });
    await syncKsa1LiveOddsAndScores();

    await syncNbaCreateMatches();
    await syncNbaPrematchOdds({ forcePrematch });
    await syncNbaLiveOddsAndScores();

    await lockMatchesAtKickoff();
    return { skipped: false };
  } finally {
    manualSyncInProgress = false;
  }
}

async function pruneChatMessages() {
  const total = await ChatMessage.countDocuments({});
  if (total <= 300) {
    return;
  }

  const stale = await ChatMessage.find({})
    .sort({ createdAt: 1 })
    .limit(total - 300)
    .select("_id");

  if (stale.length) {
    await ChatMessage.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "";
}

function canSendToGuildTextChannel(channel, actor) {
  if (!channel || channel.type !== ChannelType.GuildText || !actor) {
    return false;
  }

  const perms = channel.permissionsFor(actor);
  if (!perms) {
    return false;
  }

  return perms.has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages
  ]);
}

async function resolveGuildBroadcastChannel(guild) {
  if (!guild) {
    return null;
  }

  const actor = guild.members?.me || client.user?.id;
  if (canSendToGuildTextChannel(guild.systemChannel, actor)) {
    return guild.systemChannel;
  }

  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (canSendToGuildTextChannel(channel, actor)) {
      return channel;
    }
  }

  return null;
}

app.use(express.json());
app.use("/admin", express.static(path.join(__dirname, "admin", "public")));
app.use("/aviator/assets", express.static(path.join(__dirname, "aviator", "public")));
app.use("/tienlen/assets", express.static(path.join(TIENLEN_DIST_DIR, "assets")));
app.use("/assets", express.static(path.join(TIENLEN_DIST_DIR, "assets")));
app.use("/chat/assets", express.static(CHAT_PUBLIC_DIR));

app.get("/aviator", (req, res) => {
  res.sendFile(path.join(__dirname, "aviator", "public", "aviator.html"));
});

app.get("/tienlen", (req, res) => {
  return res.sendFile(path.join(TIENLEN_DIST_DIR, "index.html"), (error) => {
    if (error) {
      res
        .status(500)
        .send("Tien Len frontend is missing. Run: npm run build --prefix src/tienlen/server/client");
    }
  });
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(CHAT_PUBLIC_DIR, "chat.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/admin/sync-now", async (req, res) => {
  const requestIp = String(req.ip || "");
  const isLocal = requestIp === "::1" || requestIp === "::ffff:127.0.0.1" || requestIp === "127.0.0.1";
  if (!isLocal) {
    return res.status(403).json({ error: "forbidden" });
  }

  const startedAt = new Date();
  const forcePrematch = req.body?.forcePrematch !== false;

  try {
    const syncState = await runManualSyncNow({ forcePrematch });

    return res.json({
      ok: true,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      forcePrematch,
      ...syncState
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      forcePrematch,
      error: String(error?.message || error)
    });
  }
});

app.get("/api/chat/messages", async (req, res) => {
  const messages = await ChatMessage.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  messages.reverse();
  res.json(messages.map((item) => ({
    id: String(item._id),
    name: item.name,
    text: item.text,
    createdAt: item.createdAt
  })));
});

app.post("/api/chat/messages", async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

  if (!name || !text) {
    return res.status(400).json({ error: "name and text are required" });
  }

  if (name.length > 50 || text.length > 500) {
    return res.status(400).json({ error: "name or text is too long" });
  }

  const message = await ChatMessage.create({
    name,
    text,
    ip: getClientIp(req)
  });

  await pruneChatMessages();

  res.status(201).json({
    id: String(message._id),
    name: message.name,
    text: message.text,
    createdAt: message.createdAt
  });
});

function getTokenFromRequest(req) {
  return req.query.token || (req.body && req.body.token) || req.headers["x-aviator-token"];
}

async function getAviatorUser(req, res) {
  const token = getTokenFromRequest(req);
  const payload = verifyAviatorToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  let user = await User.findOne({ userId: payload.userId });
  if (!user) {
    user = await User.create({
      userId: payload.userId,
      userName: "",
      balance: STARTING_BALANCE
    });
  }

  user.lastSeen = new Date();
  await user.save();
  return user;
}

async function pruneAviatorHistory() {
  const total = await AviatorBet.countDocuments({ status: { $ne: "open" } });
  if (total <= 20) {
    return;
  }

  const stale = await AviatorBet.find({ status: { $ne: "open" } })
    .sort({ createdAt: 1 })
    .limit(total - 20)
    .select("_id");

  if (stale.length) {
    await AviatorBet.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
  }
}

async function pruneAviatorRounds() {
  const total = await AviatorRound.countDocuments({});
  if (total <= 20) {
    return;
  }

  const stale = await AviatorRound.find({})
    .sort({ createdAt: 1 })
    .limit(total - 20)
    .select("_id");

  if (stale.length) {
    await AviatorRound.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
  }
}

function sendAviatorEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastAviator(payload) {
  for (const clients of aviatorClients.values()) {
    for (const res of clients) {
      sendAviatorEvent(res, payload);
    }
  }
}

function sendToAviatorUser(userId, payload) {
  const clients = aviatorClients.get(userId);
  if (!clients) {
    return;
  }
  for (const res of clients) {
    sendAviatorEvent(res, payload);
  }
}

function getAviatorSnapshot() {
  return {
    status: aviatorState.status,
    countdown: aviatorState.countdown,
    multiplier: aviatorState.multiplier,
    crashPoint: aviatorState.status === "CRASHED" ? aviatorState.crashPoint : null
  };
}

function generateAviatorCrashPoint() {
  const r = Math.min(Math.random(), 0.999999999999);
  const crash = Math.max(1, Math.floor((100 * (1 - AVIATOR_HOUSE_EDGE)) / (1 - r)) / 100);
  return crash;
}

function updateRoundBet(betId, updates) {
  const target = aviatorRoundBets.find((item) => item.betId === betId);
  if (!target) {
    return;
  }
  Object.assign(target, updates);
  broadcastAviator({
    type: "roundBets",
    bets: aviatorRoundBets.map((item) => ({
      userId: item.userId,
      userName: item.userName,
      amount: item.amount,
      status: item.status,
      cashoutAt: item.cashoutAt,
      winAmount: item.winAmount
    }))
  });
}

async function resolveAviatorWin(betId, multiplier) {
  const bet = await AviatorBet.findById(betId);
  if (!bet || bet.status !== "open") {
    return;
  }

  const user = await User.findOne({ userId: bet.userId });
  if (!user) {
    return;
  }

  bet.status = "won";
  bet.cashoutAt = multiplier;
  bet.winAmount = Math.max(0, bet.amount * multiplier);
  bet.crashPoint = aviatorState.crashPoint;
  await bet.save();
  await pruneAviatorHistory();

  user.balance += bet.winAmount;
  user.lastSeen = new Date();
  await user.save();

  aviatorOpenBets.delete(betId);
  updateRoundBet(String(bet._id), {
    status: "won",
    cashoutAt: bet.cashoutAt,
    winAmount: bet.winAmount
  });
  sendToAviatorUser(bet.userId, {
    type: "bet",
    betId: String(bet._id),
    slot: bet.slot,
    status: "won",
    cashoutAt: bet.cashoutAt,
    winAmount: bet.winAmount,
    balance: user.balance
  });
}

async function resolveAviatorLose(betId) {
  const bet = await AviatorBet.findById(betId);
  if (!bet || bet.status !== "open") {
    return;
  }

  bet.status = "lost";
  bet.crashPoint = aviatorState.crashPoint;
  await bet.save();
  await pruneAviatorHistory();
  aviatorOpenBets.delete(betId);

  updateRoundBet(String(bet._id), {
    status: "lost",
    winAmount: 0
  });

  sendToAviatorUser(bet.userId, {
    type: "bet",
    betId: String(bet._id),
    slot: bet.slot,
    status: "lost"
  });
}

function startAviatorWaiting() {
  aviatorState.status = "WAITING";
  aviatorState.multiplier = 1;
  aviatorState.crashPoint = 1;
  aviatorState.countdown = 10;
  aviatorState.startTime = 0;
  aviatorState.resolving = false;
  aviatorRoundBets = [];

  if (aviatorState.intervalId) {
    clearInterval(aviatorState.intervalId);
  }

  broadcastAviator({ type: "state", data: getAviatorSnapshot() });

  aviatorState.intervalId = setInterval(() => {
    aviatorState.countdown = Math.max(0, aviatorState.countdown - AVIATOR_TICK_MS / 1000);
    broadcastAviator({ type: "state", data: getAviatorSnapshot() });

    if (aviatorState.countdown <= 0) {
      startAviatorFlying();
    }
  }, AVIATOR_TICK_MS);
}

function startAviatorFlying() {
  if (aviatorState.intervalId) {
    clearInterval(aviatorState.intervalId);
  }

  aviatorState.status = "FLYING";
  aviatorState.startTime = Date.now();
  aviatorState.crashPoint = generateAviatorCrashPoint();
  aviatorState.multiplier = 1;
  aviatorState.resolving = false;
  broadcastAviator({ type: "state", data: getAviatorSnapshot() });

  aviatorState.intervalId = setInterval(() => {
    void updateAviatorFlying();
  }, AVIATOR_TICK_MS);
}

async function updateAviatorFlying() {
  if (aviatorState.status !== "FLYING" || aviatorState.tickInProgress) {
    return;
  }
  aviatorState.tickInProgress = true;

  const elapsed = (Date.now() - aviatorState.startTime) / 1000;
  aviatorState.multiplier = Math.exp(AVIATOR_K * elapsed);

  if (aviatorState.multiplier >= aviatorState.crashPoint && !aviatorState.resolving) {
    aviatorState.multiplier = aviatorState.crashPoint;
    aviatorState.resolving = true;
    aviatorState.tickInProgress = false;
    await resolveAviatorCrash();
    return;
  }

  const autoCashouts = [];
  for (const [betId, bet] of aviatorOpenBets.entries()) {
    if (bet.autoCashout > 1 && aviatorState.multiplier >= bet.autoCashout) {
      autoCashouts.push({ betId, autoCashout: bet.autoCashout });
    }
  }

  for (const item of autoCashouts) {
    await resolveAviatorWin(item.betId, item.autoCashout);
  }

  broadcastAviator({ type: "state", data: getAviatorSnapshot() });
  aviatorState.tickInProgress = false;
}

async function resolveAviatorCrash() {
  aviatorState.status = "CRASHED";
  broadcastAviator({ type: "state", data: getAviatorSnapshot() });

  await AviatorRound.create({ crashPoint: aviatorState.crashPoint });
  await pruneAviatorRounds();

  const openBetIds = Array.from(aviatorOpenBets.keys());
  for (const betId of openBetIds) {
    await resolveAviatorLose(betId);
  }

  broadcastAviator({
    type: "roundBets",
    bets: aviatorRoundBets.map((item) => ({
      userId: item.userId,
      userName: item.userName,
      amount: item.amount,
      status: item.status,
      cashoutAt: item.cashoutAt,
      winAmount: item.winAmount
    }))
  });
  broadcastAviator({ type: "history" });
  setTimeout(() => {
    startAviatorWaiting();
  }, 2200);
}

app.get("/api/matches", async (req, res) => {
  const status = req.query.status;
  const sport = typeof req.query.sport === "string" ? req.query.sport.trim().toLowerCase() : "";
  const league = typeof req.query.league === "string" ? req.query.league.trim().toLowerCase() : "";
  const query = {};

  if (status) {
    query.status = status;
  }

  if (sport) {
    if (!["football", "basketball"].includes(sport)) {
      return res.status(400).json({ error: "Invalid sport" });
    }
    query.sport = sport;
  }

  if (league) {
    if (!["epl", "laliga", "uefa", "afc", "afc_asian_cup", "ksa1", "nba"].includes(league)) {
      return res.status(400).json({ error: "Invalid league" });
    }
    query.league = league;
  }

  const matches = await Match.find(query).sort({ kickoff: 1 });
  res.json(matches);
});

app.get("/api/aviator/session", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  res.json({
    userId: user.userId,
    userName: user.userName,
    balance: user.balance
  });
});

app.get("/api/aviator/stream", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sendAviatorEvent(res, { type: "state", data: getAviatorSnapshot() });
  sendAviatorEvent(res, { type: "balance", balance: user.balance, userId: user.userId });

  const existing = aviatorClients.get(user.userId) || new Set();
  existing.add(res);
  aviatorClients.set(user.userId, existing);

  req.on("close", () => {
    const current = aviatorClients.get(user.userId);
    if (current) {
      current.delete(res);
      if (current.size === 0) {
        aviatorClients.delete(user.userId);
      }
    }
  });
});

app.get("/api/aviator/history", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  const history = await AviatorBet.find({
    userId: user.userId,
    status: { $ne: "open" }
  })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json(history.map((item) => ({
    crashPoint: item.crashPoint,
    cashoutAt: item.cashoutAt,
    winAmount: item.winAmount,
    amount: item.amount,
    status: item.status,
    createdAt: item.createdAt
  })));
});

app.get("/api/aviator/rounds", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  const rounds = await AviatorRound.find({}).sort({ createdAt: -1 }).limit(20);
  res.json(rounds.map((item) => ({
    crashPoint: item.crashPoint,
    createdAt: item.createdAt
  })));
});


app.post("/api/aviator/bet/place", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  if (aviatorState.status !== "WAITING") {
    return res.status(400).json({ error: "Bet only in WAITING" });
  }

  const amount = Number(req.body.amount);
  const autoCashout = Number(req.body.autoCashout);
  const slot = Number(req.body.slot);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }
  if (!Number.isInteger(slot) || slot < 0 || slot > 1) {
    return res.status(400).json({ error: "Invalid slot" });
  }
  if (user.balance < amount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  for (const bet of aviatorOpenBets.values()) {
    if (bet.userId === user.userId && bet.slot === slot) {
      return res.status(400).json({ error: "Slot already used" });
    }
  }

  const bet = await AviatorBet.create({
    userId: user.userId,
    amount,
    autoCashout: Number.isFinite(autoCashout) && autoCashout > 1 ? autoCashout : 0,
    slot
  });

  aviatorOpenBets.set(String(bet._id), {
    userId: user.userId,
    amount: bet.amount,
    autoCashout: bet.autoCashout,
    slot: bet.slot
  });

  aviatorRoundBets.push({
    betId: String(bet._id),
    userId: user.userId,
    userName: user.userName || "",
    amount: bet.amount,
    autoCashout: bet.autoCashout,
    status: "open",
    cashoutAt: 0,
    winAmount: 0
  });

  broadcastAviator({
    type: "roundBets",
    bets: aviatorRoundBets.map((item) => ({
      userId: item.userId,
      userName: item.userName,
      amount: item.amount,
      status: item.status,
      cashoutAt: item.cashoutAt,
      winAmount: item.winAmount
    }))
  });

  user.balance -= amount;
  await user.save();

  res.json({
    betId: bet._id,
    balance: user.balance,
    autoCashout: bet.autoCashout,
    slot: bet.slot
  });
});

app.post("/api/aviator/bet/cashout", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  const betId = String(req.body.betId || "").trim();
  if (!betId) {
    return res.status(400).json({ error: "Missing betId" });
  }
  if (aviatorState.status !== "FLYING") {
    return res.status(400).json({ error: "Cashout only in FLYING" });
  }

  const bet = await AviatorBet.findOne({ _id: betId, userId: user.userId });
  if (!bet) {
    return res.status(404).json({ error: "Bet not found" });
  }
  if (bet.status !== "open") {
    return res.json({
      balance: user.balance,
      cashoutAt: bet.cashoutAt,
      winAmount: bet.winAmount
    });
  }

  await resolveAviatorWin(String(bet._id), aviatorState.multiplier);
  const updated = await AviatorBet.findById(bet._id);
  const latestUser = await User.findOne({ userId: user.userId });

  await pruneAviatorHistory();

  res.json({
    balance: latestUser ? latestUser.balance : user.balance,
    cashoutAt: updated ? updated.cashoutAt : aviatorState.multiplier,
    winAmount: updated ? updated.winAmount : 0
  });
});

app.post("/api/aviator/bet/lose", async (req, res) => {
  const user = await getAviatorUser(req, res);
  if (!user) {
    return;
  }

  if (aviatorState.status !== "CRASHED") {
    return res.status(400).json({ error: "Round is not crashed" });
  }

  const betId = String(req.body.betId || "").trim();
  const crashPoint = Number(req.body.crashPoint);
  if (!betId) {
    return res.status(400).json({ error: "Missing betId" });
  }

  const bet = await AviatorBet.findOne({ _id: betId, userId: user.userId });
  if (!bet) {
    return res.status(404).json({ error: "Bet not found" });
  }
  if (bet.status !== "open") {
    return res.json({ ok: true });
  }

  bet.status = "lost";
  bet.crashPoint = Number.isFinite(crashPoint) ? crashPoint : bet.crashPoint;
  await bet.save();
  await pruneAviatorHistory();

  res.json({ ok: true });
});

app.get("/api/users", async (req, res) => {
  const users = await User.find({}).sort({ updatedAt: -1 });
  res.json(users);
});

app.post("/api/users/:id/balance", async (req, res) => {
  const { id } = req.params;
  const { amount, userName } = req.body || {};
  const delta = Number(amount);

  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: "amount must be a non-zero number" });
  }

  let user = await User.findOne({ userId: id });
  if (!user) {
    user = await User.create({ userId: id, userName: userName || "", balance: 0 });
  }

  user.balance += delta;
  if (userName && user.userName !== userName) {
    user.userName = userName;
  }
  user.lastSeen = new Date();
  await user.save();

  res.json({ ok: true, balance: user.balance });
});

app.post("/api/admin/broadcast", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const all = Boolean(req.body?.all);

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  if (message.length > 1900) {
    return res.status(400).json({ error: "message is too long" });
  }

  if (!all) {
    return res.status(400).json({ error: "all must be true" });
  }

  if (!client.isReady()) {
    return res.status(503).json({ error: "Discord client is not ready" });
  }

  const guilds = Array.from(client.guilds.cache.values());
  let sent = 0;
  const results = [];

  for (const guild of guilds) {
    try {
      const channel = await resolveGuildBroadcastChannel(guild);
      if (!channel) {
        results.push({ guildId: guild.id, guildName: guild.name, sent: false, reason: "No sendable text channel" });
        continue;
      }

      await channel.send({ content: message });
      sent += 1;
      results.push({ guildId: guild.id, guildName: guild.name, channelId: channel.id, sent: true });
    } catch (error) {
      results.push({
        guildId: guild.id,
        guildName: guild.name,
        sent: false,
        reason: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  res.json({
    ok: true,
    totalGuilds: guilds.length,
    sent,
    failed: guilds.length - sent,
    results
  });
});

app.post("/api/matches", async (req, res) => {
  const { homeTeam, awayTeam, stadium, kickoff, odds, sport, league } = req.body;
  if (!homeTeam || !awayTeam || !kickoff || !Array.isArray(odds) || odds.length === 0) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const normalizedSport = typeof sport === "string" ? sport.trim().toLowerCase() : "football";
  if (!["football", "basketball"].includes(normalizedSport)) {
    return res.status(400).json({ error: "Invalid sport" });
  }

  const normalizedLeague = typeof league === "string" ? league.trim().toLowerCase() : "";
  const fallbackLeague = normalizedSport === "basketball" ? "nba" : "epl";
  const nextLeague = normalizedLeague || fallbackLeague;
  if (!["epl", "laliga", "uefa", "afc", "afc_asian_cup", "ksa1", "nba"].includes(nextLeague)) {
    return res.status(400).json({ error: "Invalid league" });
  }

  const kickoffDate = parseKickoffInput(kickoff);
  if (!kickoffDate) {
    return res.status(400).json({ error: "Invalid kickoff" });
  }

  const matchCode = await generateMatchCode();

  const match = await Match.create({
    sport: normalizedSport,
    league: nextLeague,
    matchCode,
    homeTeam,
    awayTeam,
    stadium: stadium || "",
    kickoff: kickoffDate,
    odds,
    status: "open"
  });

  await pruneOldMatches();

  res.status(201).json(match);
});

app.put("/api/matches/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};
  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  if (updates.kickoff !== undefined) {
    const kickoffDate = parseKickoffInput(updates.kickoff);
    if (!kickoffDate) {
      return res.status(400).json({ error: "Invalid kickoff" });
    }
  }

  if (updates.sport !== undefined) {
    const nextSport = typeof updates.sport === "string" ? updates.sport.trim().toLowerCase() : "";
    if (!["football", "basketball"].includes(nextSport)) {
      return res.status(400).json({ error: "Invalid sport" });
    }
  }

  if (updates.league !== undefined) {
    const nextLeague = typeof updates.league === "string" ? updates.league.trim().toLowerCase() : "";
    if (!["epl", "laliga", "uefa", "afc", "afc_asian_cup", "ksa1", "nba"].includes(nextLeague)) {
      return res.status(400).json({ error: "Invalid league" });
    }
  }

  const allowed = ["homeTeam", "awayTeam", "stadium", "kickoff", "odds", "sport", "league"];
  allowed.forEach((key) => {
    if (updates[key] !== undefined) {
      if (key === "kickoff") {
        match[key] = parseKickoffInput(updates[key]);
        return;
      }

      if (key === "sport") {
        const nextSport = updates[key].trim().toLowerCase();
        match[key] = nextSport;
        return;
      }

      if (key === "league") {
        const nextLeague = updates[key].trim().toLowerCase();
        match[key] = nextLeague;
        return;
      }

      match[key] = updates[key];
    }
  });

  await match.save();
  res.json(match);
});

app.post("/api/matches/:id/score", async (req, res) => {
  const { id } = req.params;
  const { scoreHome, scoreAway } = req.body || {};
  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  if (Number.isFinite(scoreHome)) {
    match.scoreHome = scoreHome;
  }
  if (Number.isFinite(scoreAway)) {
    match.scoreAway = scoreAway;
  }

  await match.save();
  res.json(match);
});

app.post("/api/matches/:id/corners", async (req, res) => {
  const { id } = req.params;
  const { cornerHome, cornerAway } = req.body || {};
  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  if (Number.isFinite(cornerHome)) {
    match.cornerHome = cornerHome;
  }
  if (Number.isFinite(cornerAway)) {
    match.cornerAway = cornerAway;
  }

  await match.save();
  res.json(match);
});

app.post("/api/matches/:id/live", async (req, res) => {
  const { id } = req.params;
  const { isLive } = req.body || {};
  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  match.isLive = Boolean(isLive);
  if (match.isLive) {
    match.betLocked = true;
  }
  await match.save();
  res.json(match);
});

app.post("/api/matches/:id/bet-lock", async (req, res) => {
  const { id } = req.params;
  const { betLocked } = req.body || {};
  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  match.betLocked = Boolean(betLocked);
  await match.save();
  res.json(match);
});

app.post("/api/matches/:id/goals", async (req, res) => {
  const { id } = req.params;
  const { goals } = req.body || {};
  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  const parsedGoals = Array.isArray(goals)
    ? goals
      .map((goal) => {
        const scorer = typeof goal.scorer === "string" ? goal.scorer.trim() : "";
        const team = typeof goal.team === "string" ? goal.team.trim() : "";
        const minute = Number(goal.minute);
        if (!scorer || !team) {
          return null;
        }
        return {
          scorer,
          team,
          minute: Number.isFinite(minute) ? minute : null
        };
      })
      .filter(Boolean)
    : [];

  match.goals = parsedGoals;
  await match.save();
  res.json(match);
});

app.post("/api/matches/:id/close", async (req, res) => {
  const { id } = req.params;
  const { winnerKey, winnerKeys, scoreHome, scoreAway } = req.body;
  const winners = Array.isArray(winnerKeys)
    ? winnerKeys.filter((key) => typeof key === "string" && key.trim())
    : winnerKey
      ? [String(winnerKey).trim()]
      : [];

  const uniqueWinners = Array.from(new Set(winners));
  if (uniqueWinners.length === 0) {
    return res.status(400).json({ error: "winnerKeys is required" });
  }

  const match = await Match.findById(id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  if (match.status === "closed") {
    return res.status(400).json({ error: "Match already closed" });
  }

  await closeMatchAndSettleBets(match, {
    winnerKeys: uniqueWinners,
    scoreHome,
    scoreAway
  });

  res.json({ ok: true });
});

const discordToken = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
if (!discordToken) {
  console.warn("DISCORD_TOKEN is missing. Bot will not start.");
}
if (!clientId) {
  console.warn("CLIENT_ID is missing. Slash commands cannot auto-register.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function registerGuildCommands(guildId) {
  if (!discordToken || !clientId) {
    return;
  }

  const rest = new REST({ version: "10" }).setToken(discordToken);
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: getCommandData()
    });
    console.log(`Commands deployed to guild ${guildId}.`);
  } catch (err) {
    console.error(`Failed to deploy commands to guild ${guildId}.`);
    console.error(err);
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    if (!isIgnorableInteractionError(error)) {
      console.error(error);
    }
  }
});

client.on("guildCreate", async (guild) => {
  await registerGuildCommands(guild.id);
});

client.once("clientReady", () => {
  console.log(`Bot ready as ${client.user.tag}`);
  const guilds = client.guilds.cache.map((guild) => guild.id);
  guilds.forEach((guildId) => {
    registerGuildCommands(guildId);
  });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  await backfillMatchSports();
  await cleanupOldBettingData().catch((error) => {
    console.error("Initial betting-data cleanup failed:", error);
  });
  await syncEplCreateMatches().catch((error) => {
    console.error("Initial EPL create sync failed:", error);
  });
  await syncEplPrematchOdds().catch((error) => {
    console.error("Initial EPL prematch sync failed:", error);
  });
  await syncEplLiveOddsAndScores().catch((error) => {
    console.error("Initial EPL live sync failed:", error);
  });
  await syncLaLigaCreateMatches().catch((error) => {
    console.error("Initial LaLiga create sync failed:", error);
  });
  await syncLaLigaPrematchOdds().catch((error) => {
    console.error("Initial LaLiga prematch sync failed:", error);
  });
  await syncLaLigaLiveOddsAndScores().catch((error) => {
    console.error("Initial LaLiga live sync failed:", error);
  });
  await syncAfcCreateMatches().catch((error) => {
    console.error("Initial UEFA Champions create sync failed:", error);
  });
  await syncAfcPrematchOdds().catch((error) => {
    console.error("Initial UEFA Champions prematch sync failed:", error);
  });
  await syncAfcLiveOddsAndScores().catch((error) => {
    console.error("Initial UEFA Champions live sync failed:", error);
  });
  await syncAfcAsianCupCreateMatches().catch((error) => {
    console.error("Initial AFC Asian Cup create sync failed:", error);
  });
  await syncAfcAsianCupPrematchOdds().catch((error) => {
    console.error("Initial AFC Asian Cup prematch sync failed:", error);
  });
  await syncAfcAsianCupLiveOddsAndScores().catch((error) => {
    console.error("Initial AFC Asian Cup live sync failed:", error);
  });
  await syncKsa1CreateMatches().catch((error) => {
    console.error("Initial KSA create sync failed:", error);
  });
  await syncKsa1PrematchOdds().catch((error) => {
    console.error("Initial KSA prematch sync failed:", error);
  });
  await syncKsa1LiveOddsAndScores().catch((error) => {
    console.error("Initial KSA live sync failed:", error);
  });
  await syncNbaCreateMatches().catch((error) => {
    console.error("Initial NBA create sync failed:", error);
  });
  await syncNbaPrematchOdds().catch((error) => {
    console.error("Initial NBA prematch sync failed:", error);
  });
  await syncNbaLiveOddsAndScores().catch((error) => {
    console.error("Initial NBA live sync failed:", error);
  });
  await lockMatchesAtKickoff();
  startMatchAutoLockScheduler();
  startEplCreateSyncScheduler();
  startEplPrematchSyncScheduler();
  startEplLiveSyncScheduler();
  startLaLigaCreateSyncScheduler();
  startLaLigaPrematchSyncScheduler();
  startLaLigaLiveSyncScheduler();
  startAfcCreateSyncScheduler();
  startAfcPrematchSyncScheduler();
  startAfcLiveSyncScheduler();
  startAfcAsianCupCreateSyncScheduler();
  startAfcAsianCupPrematchSyncScheduler();
  startAfcAsianCupLiveSyncScheduler();
  startKsa1CreateSyncScheduler();
  startKsa1PrematchSyncScheduler();
  startKsa1LiveSyncScheduler();
  startNbaCreateSyncScheduler();
  startNbaPrematchSyncScheduler();
  startNbaLiveSyncScheduler();
  startDataCleanupScheduler();

  app.listen(PORT, () => {
    console.log(`Admin panel on http://localhost:${PORT}/admin`);
  });

  startAviatorWaiting();

  if (discordToken) {
    await client.login(discordToken);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (isIgnorableInteractionError(reason)) {
    return;
  }

  console.error("Unhandled promise rejection:", reason);
});
