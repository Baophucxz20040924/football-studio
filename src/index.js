const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
require("dotenv").config();

const Match = require("./models/Match");
const Bet = require("./models/Bet");
const User = require("./models/User");
const { handleInteraction, getCommandData } = require("./discord/commands");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/football_bot";

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

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/matches", async (req, res) => {
  const status = req.query.status;
  const query = status ? { status } : {};
  const matches = await Match.find(query).sort({ kickoff: 1 });
  res.json(matches);
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

  if (discordToken) {
    await client.login(discordToken);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
