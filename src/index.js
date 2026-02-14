const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
require("dotenv").config();

const Match = require("./models/Match");
const Bet = require("./models/Bet");
const User = require("./models/User");
const AviatorBet = require("./models/AviatorBet");
const AviatorRound = require("./models/AviatorRound");
const { verifyAviatorToken } = require("./aviator/token");
const { handleInteraction, getCommandData } = require("./discord/commands");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/football_bot";
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 0);
const AVIATOR_TICK_MS = 100;
const AVIATOR_K = 0.12;
const AVIATOR_HOUSE_EDGE = Number(process.env.AVIATOR_HOUSE_EDGE || 0.01);
const TIENLEN_DIST_DIR = path.join(__dirname, "tienlen", "server", "client", "dist");

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

app.use(express.json());
app.use("/admin", express.static(path.join(__dirname, "admin", "public")));
app.use("/aviator/assets", express.static(path.join(__dirname, "aviator", "public")));
app.use("/tienlen/assets", express.static(path.join(TIENLEN_DIST_DIR, "assets")));
app.use("/assets", express.static(path.join(TIENLEN_DIST_DIR, "assets")));

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

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
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
  const query = status ? { status } : {};
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

app.post("/api/matches", async (req, res) => {
  const { homeTeam, awayTeam, stadium, kickoff, odds } = req.body;
  if (!homeTeam || !awayTeam || !kickoff || !Array.isArray(odds) || odds.length === 0) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const matchCode = await generateMatchCode();

  const match = await Match.create({
    matchCode,
    homeTeam,
    awayTeam,
    stadium: stadium || "",
    kickoff: new Date(kickoff),
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

  const allowed = ["homeTeam", "awayTeam", "stadium", "kickoff", "odds"];
  allowed.forEach((key) => {
    if (updates[key] !== undefined) {
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

  match.status = "closed";
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
  await handleInteraction(interaction);
});

client.on("guildCreate", async (guild) => {
  await registerGuildCommands(guild.id);
});

client.once("ready", () => {
  console.log(`Bot ready as ${client.user.tag}`);
  const guilds = client.guilds.cache.map((guild) => guild.id);
  guilds.forEach((guildId) => {
    registerGuildCommands(guildId);
  });
});

async function start() {
  await mongoose.connect(MONGODB_URI);
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
