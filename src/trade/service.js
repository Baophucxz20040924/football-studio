const TradeSession = require("../models/TradeSession");
const TradeBet = require("../models/TradeBet");
const User = require("../models/User");

const DEFAULT_SYMBOL = String(process.env.TRADE_SYMBOL || "BTCUSDT").trim().toUpperCase() || "BTCUSDT";
const SESSION_INTERVAL_MS = Number(process.env.TRADE_SESSION_INTERVAL_MS || 2 * 60 * 1000);
const PRICE_API_BASE_URL = process.env.TRADE_PRICE_API_BASE_URL || "https://api.binance.com";
const PRICE_SYMBOL = String(process.env.TRADE_PRICE_SYMBOL || DEFAULT_SYMBOL).trim().toUpperCase() || DEFAULT_SYMBOL;
const PAYOUT_MULTIPLIER = Number(process.env.TRADE_PAYOUT_MULTIPLIER || 2);
const DISPLAY_TIME_ZONE = process.env.DISPLAY_TIME_ZONE || "Asia/Ho_Chi_Minh";
const DISPLAY_LOCALE = process.env.DISPLAY_LOCALE || "en-US";

let settlementBroadcaster = null;

function setSettlementBroadcaster(fn) {
  settlementBroadcaster = typeof fn === "function" ? fn : null;
}

const state = {
  running: false,
  timerId: null,
  nextBoundaryTime: null,
  boundaryInProgress: false
};

function getNow() {
  return new Date();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getIntervalMs() {
  return SESSION_INTERVAL_MS > 0 ? SESSION_INTERVAL_MS : 2 * 60 * 1000;
}

const TRADE_SESSION_INTERVAL_MINUTES = getIntervalMs() / 60000;

function floorToBoundary(date) {
  const time = date instanceof Date ? date.getTime() : Date.now();
  const intervalMs = getIntervalMs();
  return new Date(Math.floor(time / intervalMs) * intervalMs);
}

function getNextBoundary(date = getNow()) {
  const intervalMs = getIntervalMs();
  const time = date instanceof Date ? date.getTime() : Date.now();
  return new Date((Math.floor(time / intervalMs) + 1) * intervalMs);
}

function addInterval(date, count = 1) {
  return new Date(date.getTime() + getIntervalMs() * count);
}

function formatSessionTime(date) {
  const value = new Date(date);
  try {
    return value.toLocaleTimeString(DISPLAY_LOCALE, {
      timeZone: DISPLAY_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return value.toLocaleTimeString();
  }
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) {
    return "-";
  }
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  });
}

function getTradeChartUrl(symbol = DEFAULT_SYMBOL) {
  return `https://www.binance.com/en/trade/${encodeURIComponent(symbol)}?type=spot`;
}

async function fetchTradePrice(symbol = PRICE_SYMBOL) {
  const response = await fetch(`${PRICE_API_BASE_URL}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Không lấy được giá coin (HTTP ${response.status})`);
  }

  const payload = await response.json();
  const price = Number(payload?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Dữ liệu giá coin không hợp lệ");
  }

  return {
    price,
    symbol: String(payload?.symbol || symbol).trim().toUpperCase() || symbol,
    source: "binance",
    fetchedAt: new Date()
  };
}

async function getNextUpcomingSession(now = getNow()) {
  return TradeSession.findOne({
    symbol: DEFAULT_SYMBOL,
    status: "upcoming",
    startTime: { $gt: now }
  }).sort({ startTime: 1 });
}

async function getActiveSession(now = getNow()) {
  return TradeSession.findOne({
    symbol: DEFAULT_SYMBOL,
    status: "active",
    startTime: { $lte: now },
    endTime: { $gt: now }
  }).sort({ startTime: 1 });
}

async function ensureUpcomingSession(now = getNow()) {
  const existing = await getNextUpcomingSession(now);
  if (existing) {
    return existing;
  }

  const startTime = getNextBoundary(now);
  const endTime = addInterval(startTime, 1);

  return TradeSession.findOneAndUpdate(
    { symbol: DEFAULT_SYMBOL, startTime },
    {
      $setOnInsert: {
        symbol: DEFAULT_SYMBOL,
        startTime,
        endTime,
        status: "upcoming",
        result: "pending"
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}

async function ensureFollowingUpcomingSession(boundaryTime) {
  const startTime = addInterval(boundaryTime, 1);
  const endTime = addInterval(startTime, 1);

  return TradeSession.findOneAndUpdate(
    { symbol: DEFAULT_SYMBOL, startTime },
    {
      $setOnInsert: {
        symbol: DEFAULT_SYMBOL,
        startTime,
        endTime,
        status: "upcoming",
        result: "pending"
      }
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
}

function clearBoundaryTimer() {
  if (state.timerId) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
}

function stopTradeEngine(reason = "idle") {
  clearBoundaryTimer();
  state.running = false;
  state.nextBoundaryTime = null;
  state.boundaryInProgress = false;
  console.log(`Trade engine stopped (${reason}).`);
}

function scheduleNextBoundary(referenceTime = getNow()) {
  clearBoundaryTimer();
  if (!state.running) {
    return;
  }

  const nextBoundary = getNextBoundary(referenceTime);
  const delay = Math.max(250, nextBoundary.getTime() - Date.now());
  state.nextBoundaryTime = nextBoundary;
  state.timerId = setTimeout(() => {
    void processBoundary(nextBoundary);
  }, delay);
}

async function settleSession(session, closePrice, settledAt) {
  const result = closePrice > session.openPrice
    ? "up"
    : closePrice < session.openPrice
      ? "down"
      : "flat";

  const bets = await TradeBet.find({ sessionId: session._id, status: "open" });
  for (const bet of bets) {
    const user = await User.findOne({ userId: bet.userId });
    if (!user) {
      continue;
    }

    if (result === "flat") {
      bet.status = "push";
      bet.payout = bet.amount;
      user.balance += bet.amount;
    } else if (bet.direction === result) {
      bet.status = "won";
      bet.payout = bet.amount * PAYOUT_MULTIPLIER;
      user.balance += bet.payout;
    } else {
      bet.status = "lost";
      bet.payout = 0;
    }

    bet.settledAt = settledAt;
    user.lastSeen = settledAt;
    await bet.save();
    await user.save();
  }

  session.closePrice = closePrice;
  session.status = "settled";
  session.result = result;
  session.settledAt = settledAt;
  await session.save();

  return {
    result,
    betCount: bets.length,
    settled: bets.map((bet) => ({
      userName: bet.userName || bet.userId,
      direction: bet.direction,
      amount: bet.amount,
      status: bet.status,
      payout: bet.payout
    }))
  };
}

async function activateSessionForBoundary(boundaryTime, priceSnapshot) {
  const session = await TradeSession.findOne({
    symbol: DEFAULT_SYMBOL,
    startTime: boundaryTime,
    status: "upcoming"
  });

  if (!session) {
    return null;
  }

  session.status = "active";
  session.openPrice = priceSnapshot.price;
  session.priceSource = priceSnapshot.source;
  await session.save();
  return session;
}

async function processBoundary(boundaryTime) {
  if (!state.running || state.boundaryInProgress) {
    return;
  }

  state.boundaryInProgress = true;

  try {
    const priceSnapshot = await fetchTradePrice();
    const activeSession = await TradeSession.findOne({
      symbol: DEFAULT_SYMBOL,
      status: "active",
      endTime: boundaryTime
    });

    if (activeSession) {
      const settleResult = await settleSession(activeSession, priceSnapshot.price, priceSnapshot.fetchedAt);
      if (settlementBroadcaster) {
        try {
          settlementBroadcaster({
            session: activeSession,
            closePrice: priceSnapshot.price,
            result: settleResult.result,
            betCount: settleResult.betCount,
            settled: settleResult.settled
          });
        } catch (broadcastError) {
          console.error("Trade settlement broadcast failed:", broadcastError);
        }
      }
      // Dừng engine sau khi chốt 1 phiên
      stopTradeEngine("session-done");
      return;
    }

    // Chưa có phiên cần chốt — kích hoạt phiên sắp bắt đầu và chờ timer kế
    await activateSessionForBoundary(boundaryTime, priceSnapshot);
  } catch (error) {
    console.error("Trade boundary processing failed:", error);
  } finally {
    state.boundaryInProgress = false;
  }

  if (state.running) {
    scheduleNextBoundary(boundaryTime);
  }
}

async function startTradeEngine() {
  if (state.running) {
    return getTradeOverview();
  }

  state.running = true;
  await ensureUpcomingSession();
  scheduleNextBoundary();
  console.log(`Trade engine started for ${DEFAULT_SYMBOL}.`);
  return getTradeOverview();
}

async function ensureTradeEngineStarted() {
  if (!state.running) {
    await startTradeEngine();
  } else {
    await ensureUpcomingSession();
  }
  return getTradeOverview();
}

async function getLastSettledSession() {
  return TradeSession.findOne({ symbol: DEFAULT_SYMBOL, status: "settled" }).sort({ endTime: -1 });
}

async function getTradeOverview() {
  const now = getNow();
  const nextSession = await getNextUpcomingSession(now);
  const activeSession = await getActiveSession(now);
  const lastSettledSession = await getLastSettledSession();

  return {
    running: state.running,
    symbol: DEFAULT_SYMBOL,
    chartUrl: getTradeChartUrl(DEFAULT_SYMBOL),
    nextBoundaryTime: state.nextBoundaryTime,
    activeSession,
    nextSession,
    lastSettledSession
  };
}

async function getUserTradeBet(userId, sessionId) {
  if (!userId || !sessionId) {
    return null;
  }

  return TradeBet.findOne({ userId, sessionId });
}

async function placeTradeBet({ userId, userName, direction, amount }) {
  if (!["up", "down"].includes(direction)) {
    throw new Error("Hướng cược không hợp lệ.");
  }

  const stake = toNumber(amount);
  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error("Số điểm cược không hợp lệ.");
  }

  await ensureTradeEngineStarted();

  const session = await getNextUpcomingSession();
  if (!session) {
    throw new Error("Không tìm thấy phiên trade kế tiếp.");
  }

  const user = await User.findOne({ userId });
  if (!user) {
    throw new Error("Không tìm thấy tài khoản người chơi.");
  }

  const existingBet = await getUserTradeBet(userId, session._id);
  if (existingBet) {
    throw new Error("Bạn đã đặt cược cho phiên kế tiếp rồi.");
  }

  if (user.balance < stake) {
    throw new Error("Số dư không đủ để đặt cược.");
  }

  user.balance -= stake;
  user.lastSeen = new Date();
  await user.save();

  let bet = null;
  try {
    bet = await TradeBet.create({
      userId,
      userName: String(userName || user.userName || "").trim().slice(0, 50),
      sessionId: session._id,
      symbol: DEFAULT_SYMBOL,
      direction,
      amount: stake
    });
  } catch (error) {
    user.balance += stake;
    await user.save();
    if (error?.code === 11000) {
      throw new Error("Bạn đã đặt cược cho phiên kế tiếp rồi.");
    }
    throw error;
  }

  session.betCount += 1;
  session.totalStake += stake;
  await session.save();
  state.idleSettledSessions = 0;

  return {
    bet,
    session,
    balance: user.balance
  };
}

module.exports = {
  setSettlementBroadcaster,
  DEFAULT_SYMBOL,
  TRADE_SESSION_INTERVAL_MINUTES,
  PAYOUT_MULTIPLIER,
  formatPrice,
  formatSessionTime,
  getTradeChartUrl,
  getTradeOverview,
  getUserTradeBet,
  placeTradeBet,
  ensureTradeEngineStarted,
  stopTradeEngine
};