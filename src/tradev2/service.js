const User = require("../models/User");
const TradeV2Position = require("../models/TradeV2Position");

const PRICE_API_BASE_URL = process.env.BINANCE_PRICE_API_BASE_URL || "https://api.binance.com";
const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"];
const MAX_LEVERAGE = 150;
const MAX_OPEN_POSITIONS = 10;
const HISTORY_LIMIT_MAX = 8;

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function isSupportedSymbol(symbol) {
  return SUPPORTED_SYMBOLS.includes(normalizeSymbol(symbol));
}

function assertSupportedSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!isSupportedSymbol(normalized)) {
    throw new Error(`Coin không hỗ trợ. Chỉ dùng: ${SUPPORTED_SYMBOLS.join(", ")}.`);
  }
  return normalized;
}

function normalizeSide(side) {
  const normalized = String(side || "").trim().toLowerCase();
  if (!["long", "short"].includes(normalized)) {
    throw new Error("Side không hợp lệ. Chọn long hoặc short.");
  }
  return normalized;
}

function normalizeLeverage(leverage) {
  const value = Number(leverage);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LEVERAGE) {
    throw new Error(`Leverage phải là số nguyên từ 1 đến ${MAX_LEVERAGE}.`);
  }
  return value;
}

function normalizeLimit(limit) {
  const value = Number(limit || HISTORY_LIMIT_MAX);
  if (!Number.isInteger(value) || value < 1) {
    return HISTORY_LIMIT_MAX;
  }
  return Math.min(value, HISTORY_LIMIT_MAX);
}

async function pruneUserHistory(userId) {
  const keepers = await TradeV2Position.find({ userId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT_MAX)
    .select("_id")
    .lean();
  const keeperIds = keepers.map((position) => position._id);
  if (keeperIds.length < HISTORY_LIMIT_MAX) {
    return { deletedCount: 0 };
  }
  return TradeV2Position.deleteMany({
    userId,
    _id: { $nin: keeperIds }
  });
}

function calculatePnl(position, currentPrice) {
  const price = Number(currentPrice);
  const entryPrice = Number(position.entryPrice);
  const quantity = Number(position.quantity);
  const margin = Number(position.margin);
  if (!Number.isFinite(price) || !Number.isFinite(entryPrice) || !Number.isFinite(quantity) || price <= 0 || entryPrice <= 0) {
    return { pnl: 0, roe: 0 };
  }

  const pnl = position.side === "long"
    ? (price - entryPrice) * quantity
    : (entryPrice - price) * quantity;
  const roe = margin > 0 ? (pnl / margin) * 100 : 0;
  return { pnl, roe };
}

async function fetchJson(path) {
  const response = await fetch(`${PRICE_API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Không lấy được giá Binance (HTTP ${response.status}).`);
  }
  return response.json();
}

async function fetchTicker(symbol) {
  const normalized = assertSupportedSymbol(symbol);
  const payload = await fetchJson(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(normalized)}`);
  const price = Number(payload?.lastPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Dữ liệu giá Binance không hợp lệ.");
  }
  return {
    symbol: normalized,
    price,
    priceChangePercent: Number(payload?.priceChangePercent || 0),
    highPrice: Number(payload?.highPrice || 0),
    lowPrice: Number(payload?.lowPrice || 0),
    volume: Number(payload?.volume || 0),
    fetchedAt: new Date()
  };
}

async function fetchLiveTickers() {
  const query = encodeURIComponent(JSON.stringify(SUPPORTED_SYMBOLS));
  const payload = await fetchJson(`/api/v3/ticker/24hr?symbols=${query}`);
  if (!Array.isArray(payload)) {
    throw new Error("Dữ liệu bảng giá Binance không hợp lệ.");
  }

  const bySymbol = new Map(payload.map((item) => [normalizeSymbol(item?.symbol), item]));
  return SUPPORTED_SYMBOLS.map((symbol) => {
    const item = bySymbol.get(symbol);
    const price = Number(item?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Dữ liệu giá ${symbol} không hợp lệ.`);
    }
    return {
      symbol,
      price,
      priceChangePercent: Number(item?.priceChangePercent || 0),
      highPrice: Number(item?.highPrice || 0),
      lowPrice: Number(item?.lowPrice || 0),
      volume: Number(item?.volume || 0),
      fetchedAt: new Date()
    };
  });
}

async function openPosition({ userId, userName, symbol, side, margin, leverage }) {
  const normalizedSymbol = assertSupportedSymbol(symbol);
  const normalizedSide = normalizeSide(side);
  const normalizedLeverage = normalizeLeverage(leverage);
  const normalizedMargin = Number(margin);
  if (!Number.isFinite(normalizedMargin) || normalizedMargin <= 0) {
    throw new Error("Margin phải lớn hơn 0.");
  }

  const openCount = await TradeV2Position.countDocuments({ userId, status: "open" });
  if (openCount >= MAX_OPEN_POSITIONS) {
    throw new Error(`Bạn chỉ được mở tối đa ${MAX_OPEN_POSITIONS} position cùng lúc.`);
  }

  const user = await User.findOne({ userId });
  if (!user) {
    throw new Error("Không tìm thấy tài khoản của bạn.");
  }
  if (user.balance < normalizedMargin) {
    throw new Error("Balance không đủ để mở lệnh này.");
  }

  const ticker = await fetchTicker(normalizedSymbol);
  const notional = normalizedMargin * normalizedLeverage;
  const quantity = notional / ticker.price;

  user.balance -= normalizedMargin;
  user.userName = userName || user.userName || "";
  user.lastSeen = new Date();

  const position = await TradeV2Position.create({
    userId,
    userName: userName || "",
    symbol: normalizedSymbol,
    side: normalizedSide,
    margin: normalizedMargin,
    leverage: normalizedLeverage,
    quantity,
    entryPrice: ticker.price,
    status: "open",
    matchStatus: "filled",
    openedAt: new Date()
  });
  await user.save();
  await pruneUserHistory(userId);

  return { position, ticker, balance: user.balance };
}

async function getOpenPositions(userId) {
  const positions = await TradeV2Position.find({ userId, status: "open" }).sort({ openedAt: -1 });
  const tickers = await fetchLiveTickers();
  const prices = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
  return positions.map((position) => {
    const ticker = prices.get(position.symbol);
    const pnl = calculatePnl(position, ticker?.price);
    return { position, ticker, ...pnl };
  });
}

async function closePosition({ userId, positionId }) {
  const position = await TradeV2Position.findOne({ _id: positionId, userId, status: "open" });
  if (!position) {
    throw new Error("Không tìm thấy position đang mở của bạn.");
  }

  const user = await User.findOne({ userId });
  if (!user) {
    throw new Error("Không tìm thấy tài khoản của bạn.");
  }

  const ticker = await fetchTicker(position.symbol);
  const { pnl, roe } = calculatePnl(position, ticker.price);
  const returnedMargin = Math.max(0, position.margin + pnl);

  position.exitPrice = ticker.price;
  position.realizedPnl = pnl;
  position.status = "closed";
  position.closedAt = new Date();
  position.matchStatus = "filled";

  user.balance += returnedMargin;
  user.lastSeen = new Date();

  await position.save();
  await user.save();
  await pruneUserHistory(userId);

  return { position, ticker, pnl, roe, returnedMargin, balance: user.balance };
}

async function getHistory(userId, limit) {
  await pruneUserHistory(userId);
  return TradeV2Position.find({ userId })
    .sort({ createdAt: -1 })
    .limit(normalizeLimit(limit));
}

function getWeekStart(date = new Date()) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  return weekStart;
}

async function getWeeklyPnl(userId) {
  const weekStart = getWeekStart();
  const closed = await TradeV2Position.find({
    userId,
    status: "closed",
    closedAt: { $gte: weekStart }
  }).sort({ closedAt: -1 });
  const openCount = await TradeV2Position.countDocuments({ userId, status: "open" });

  const totalPnl = closed.reduce((sum, position) => sum + Number(position.realizedPnl || 0), 0);
  const wins = closed.filter((position) => Number(position.realizedPnl || 0) > 0).length;
  const losses = closed.filter((position) => Number(position.realizedPnl || 0) < 0).length;
  const breakeven = closed.length - wins - losses;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

  return { weekStart, totalPnl, totalTrades: closed.length, wins, losses, breakeven, winRate, openCount };
}

module.exports = {
  SUPPORTED_SYMBOLS,
  MAX_LEVERAGE,
  MAX_OPEN_POSITIONS,
  HISTORY_LIMIT_MAX,
  pruneUserHistory,
  calculatePnl,
  fetchLiveTickers,
  fetchTicker,
  openPosition,
  getOpenPositions,
  closePosition,
  getHistory,
  getWeeklyPnl
};
