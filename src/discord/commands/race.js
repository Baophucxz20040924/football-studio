const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");
const {
  buildEmbed,
  normalizeAmount,
  getOrCreateUser,
  formatPoints,
  primeEmojiCaches,
  getEmojiLookupCaches
} = require("./utils");
const { acquireChannelGameLock, releaseChannelGameLock } = require("./channelLocks");

const BET_WINDOW_MS = 30_000;
const TRACK_LENGTH = 25;
const TURN_DELAY_MS = 3_000;
const MAX_IDLE_ROUNDS = 2;
const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const CARS = [
  { id: 1, emoji: "🚗", odds: 3.8 },
  { id: 2, emoji: "🏎️", odds: 3.8 },
  { id: 3, emoji: "🚙", odds: 3.8 },
  { id: 4, emoji: "🚓", odds: 3.8 },
  { id: 5, emoji: "🚕", odds: 3.8 },
  { id: 6, emoji: "🚘", odds: 3.8 },
  { id: 7, emoji: "🚖", odds: 3.8 },
  { id: 8, emoji: "🚐", odds: 3.8 }
];

let sessionCounter = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rollDice() {
  return 1 + Math.floor(Math.random() * 6);
}

function normalizeDiceEmojiName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function resolveDiceFaces(guild) {
  const resolved = DICE_FACES.slice();
  const valueToEmoji = new Map();

  for (const collection of getEmojiLookupCaches(guild)) {
    if (!collection) {
      continue;
    }

    for (const emoji of collection.values()) {
      const normalized = normalizeDiceEmojiName(emoji.name);
      const match = normalized.match(/^dice([1-6])$/i);
      if (!match) {
        continue;
      }

      const value = Number(match[1]);
      if (!valueToEmoji.has(value)) {
        valueToEmoji.set(value, emoji.toString());
      }
    }
  }

  for (let value = 1; value <= 6; value += 1) {
    if (valueToEmoji.has(value)) {
      resolved[value - 1] = valueToEmoji.get(value);
    }
  }

  return resolved;
}

function diceToStep(diceValue) {
  return Math.ceil(diceValue / 2);
}

function getDiceFace(diceFaces, diceValue) {
  const fallback = DICE_FACES[diceValue - 1] || "🎲";
  if (!Array.isArray(diceFaces) || diceFaces.length < diceValue) {
    return fallback;
  }

  return diceFaces[diceValue - 1] || fallback;
}

function renderTrack(position) {
  const safePos = Math.max(0, Math.min(TRACK_LENGTH, Number(position) || 0));
  const done = "#".repeat(safePos);
  const remaining = "-".repeat(TRACK_LENGTH - safePos);
  return `${done}${remaining}`;
}

function getCarById(carId) {
  return CARS.find((car) => car.id === carId) || null;
}

function buildCarRows(sessionId, round, disabled = false) {
  const rows = [];
  for (let i = 0; i < CARS.length; i += 4) {
    const row = new ActionRowBuilder();
    for (const car of CARS.slice(i, i + 4)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`race:${sessionId}:${round}:car:${car.id}`)
          .setLabel(`Xe ${car.id}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }

  return rows;
}

function buildBetEmbed(round, secondsLeft, totalBets) {
  const oddsText = CARS
    .map((car) => `${car.emoji} Xe ${car.id}: **x${car.odds.toFixed(2)}**`)
    .join("\n");

  return buildEmbed({
    title: "Đua xe cược /race 🏁",
    description: [
      `Phiên: **${round}**`,
      `Đường đua: **${TRACK_LENGTH} bước**`,
      `Thời gian đặt cược còn: **${secondsLeft}s**`,
      `Tổng lượt cược hiện tại: **${totalBets}**`,
      "",
      "Tỉ lệ trả thưởng:",
      oddsText,
      "",
      "Mỗi lượt cả 8 xe tung xúc xắc (1-6) rồi tiến 1-3 bước."
    ].join("\n"),
    color: 0xf6c244
  });
}

function buildRaceEmbed({ turn, positions, diceValues, diceFaces, title, subtitle, color }) {
  const lines = CARS.map((car, index) => {
    const pos = positions[index] || 0;
    const diceText = Array.isArray(diceValues)
      ? ` | ${getDiceFace(diceFaces, diceValues[index])} (${diceValues[index]})`
      : "";
    return `${car.emoji} Xe ${car.id} (x${car.odds.toFixed(2)})\n\`${renderTrack(pos)}\` ${pos}/${TRACK_LENGTH}${diceText}`;
  });

  return buildEmbed({
    title,
    description: [
      `Lượt: **${turn}**`,
      subtitle || "",
      "",
      ...lines
    ].filter(Boolean).join("\n"),
    color
  });
}

function summarizeUserPnl(items, maxRows = 12) {
  if (!Array.isArray(items) || items.length === 0) {
    return ["(không có)"];
  }

  const lines = items.slice(0, maxRows).map((item) => (
    `${item.label} | cược ${formatPoints(item.amount)} | ${item.delta >= 0 ? "+" : "-"}${formatPoints(Math.abs(item.delta))}`
  ));

  if (items.length > maxRows) {
    lines.push(`... và ${items.length - maxRows} dòng khác`);
  }

  return lines;
}

async function settleBets(bets, winnerCarIds) {
  const winnerSet = new Set(winnerCarIds);
  let winnerCount = 0;
  let loserCount = 0;
  let totalPayout = 0;
  let totalLost = 0;

  const winnerLines = [];
  const loserLines = [];

  for (const bet of bets) {
    const isWinner = winnerSet.has(bet.carId);
    const car = getCarById(bet.carId);

    if (!car) {
      continue;
    }

    if (!isWinner) {
      loserCount += 1;
      totalLost += bet.amount;
      loserLines.push({
        label: `<@${bet.userId}> - Xe ${car.id}`,
        amount: bet.amount,
        delta: -bet.amount
      });
      continue;
    }

    const payout = Math.round(bet.amount * car.odds);
    if (payout <= 0) {
      continue;
    }

    const user = await getOrCreateUser(bet.userId, bet.userName);
    user.balance += payout;
    await user.save();

    winnerCount += 1;
    totalPayout += payout;
    winnerLines.push({
      label: `<@${bet.userId}> - Xe ${car.id}`,
      amount: bet.amount,
      delta: payout
    });
  }

  return {
    winnerCount,
    loserCount,
    totalPayout,
    totalLost,
    betCount: bets.length,
    winnerLines: summarizeUserPnl(winnerLines),
    loserLines: summarizeUserPnl(loserLines)
  };
}

async function collectRoundBets(channel, session, round) {
  const bets = [];
  const endTime = Date.now() + BET_WINDOW_MS;

  const betMessage = await channel.send({
    embeds: [buildBetEmbed(round, Math.ceil(BET_WINDOW_MS / 1000), 0)],
    components: buildCarRows(session.id, round, false)
  });

  const collector = betMessage.createMessageComponentCollector({ time: BET_WINDOW_MS });
  const countdown = setInterval(() => {
    const secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    betMessage.edit({
      embeds: [buildBetEmbed(round, secondsLeft, bets.length)],
      components: buildCarRows(session.id, round, secondsLeft <= 0)
    }).catch(() => null);

    if (secondsLeft <= 0) {
      clearInterval(countdown);
    }
  }, 1000);

  collector.on("collect", async (btn) => {
    const parts = btn.customId.split(":");
    if (parts.length !== 5 || parts[0] !== "race" || parts[1] !== session.id || Number(parts[2]) !== round || parts[3] !== "car") {
      await btn.reply({ content: "Phiên cược này đã hết hạn.", flags: MessageFlags.Ephemeral });
      return;
    }

    const carId = Number(parts[4]);

    const selectedCar = getCarById(carId);
    if (!selectedCar) {
      await btn.reply({ content: "Xe không tồn tại.", flags: MessageFlags.Ephemeral });
      return;
    }

    const modalId = `racem:${session.id}:${round}:${btn.user.id}:${carId}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Cược Xe ${carId}`);
    const amountInput = new TextInputBuilder()
      .setCustomId("amount")
      .setLabel("Số điểm cược")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("Ví dụ: 500 hoặc 2k");

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    await btn.showModal(modal);

    let submitted;
    try {
      submitted = await btn.awaitModalSubmit({
        time: BET_WINDOW_MS,
        filter: (i) => i.customId === modalId && i.user.id === btn.user.id
      });
    } catch {
      return;
    }

    await submitted.deferReply({ flags: MessageFlags.Ephemeral });

    if (collector.ended || Date.now() > endTime) {
      await submitted.editReply({ content: "Phiên cược đã kết thúc." });
      return;
    }

    const amountText = submitted.fields.getTextInputValue("amount").trim();
    const amount = normalizeAmount(amountText);

    await submitBet({
      interaction: submitted,
      collector,
      endTime,
      bets,
      carId,
      amount
    });
  });

  await new Promise((resolve) => collector.on("end", resolve));
  clearInterval(countdown);

  await betMessage.edit({
    embeds: [buildBetEmbed(round, 0, bets.length)],
    components: buildCarRows(session.id, round, true)
  }).catch(() => null);

  return bets;
}

async function submitBet({ interaction, collector, endTime, bets, carId, amount }) {
  if (collector.ended || Date.now() > endTime) {
    await interaction.editReply({ content: "Phiên cược đã kết thúc." });
    return;
  }

  const selectedCar = getCarById(carId);
  if (!selectedCar) {
    await interaction.editReply({ content: "Xe không tồn tại." });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    await interaction.editReply({ content: "Số điểm không hợp lệ." });
    return;
  }

  const userName = interaction.user.globalName || interaction.user.username;
  const user = await getOrCreateUser(interaction.user.id, userName);
  if (user.balance < amount) {
    await interaction.editReply({
      content: `Không đủ số dư. Hiện tại: ${formatPoints(user.balance)}.`
    });
    return;
  }

  user.balance -= amount;
  await user.save();

  bets.push({
    userId: interaction.user.id,
    userName,
    amount,
    carId: selectedCar.id
  });

  await interaction.editReply({
    content: [
      `Đã cược **${formatPoints(amount)}** vào **${selectedCar.emoji} Xe ${selectedCar.id}** (x${selectedCar.odds.toFixed(2)}).`,
      `Số dư mới: **${formatPoints(user.balance)}**`
    ].join("\n")
  });
}

async function runRaceRound(channel, session, round, bets) {
  const positions = Array.from({ length: CARS.length }, () => 0);
  let turn = 0;
  let winnerIndices = [];

  const raceStateMessage = await channel.send({
    embeds: [
      buildRaceEmbed({
        turn,
        positions,
        diceFaces: session.diceFaces,
        title: "Đua xe bắt đầu 🏁",
        subtitle: `Phiên: **${round}** - Các xe chuẩn bị xuất phát...`,
        color: 0x3b82f6
      })
    ]
  });

  while (winnerIndices.length === 0) {
    turn += 1;
    const diceValues = CARS.map(() => rollDice());
    const previousPositions = positions.slice();
    const crossedThisTurn = [];

    for (let i = 0; i < CARS.length; i += 1) {
      positions[i] += diceToStep(diceValues[i]);

      if (previousPositions[i] < TRACK_LENGTH && positions[i] >= TRACK_LENGTH) {
        crossedThisTurn.push(i);
      }
    }

    if (crossedThisTurn.length > 0) {
      const bestOvershoot = Math.max(
        ...crossedThisTurn.map((index) => positions[index] - TRACK_LENGTH)
      );
      winnerIndices = crossedThisTurn.filter(
        (index) => (positions[index] - TRACK_LENGTH) === bestOvershoot
      );
    }

    await raceStateMessage.edit({
      embeds: [
        buildRaceEmbed({
          turn,
          positions,
          diceValues,
          diceFaces: session.diceFaces,
          title: "Đua xe đang diễn ra 🏁",
          subtitle: "Mỗi xe tung xúc xắc (1-6) rồi tiến từ 1 đến 3 bước.",
          color: 0x3b82f6
        })
      ]
    }).catch(() => null);

    if (winnerIndices.length > 0) {
      break;
    }

    await wait(TURN_DELAY_MS);
  }

  const winnerCars = winnerIndices
    .map((index) => CARS[index])
    .filter(Boolean);
  const winnerCarIds = winnerCars.map((car) => car.id);
  const winnerText = winnerCars
    .map((car) => `${car.emoji} Xe ${car.id} (x${car.odds.toFixed(2)})`)
    .join(" | ");

  const settlement = await settleBets(bets, winnerCarIds);

  await raceStateMessage.edit({
    embeds: [
      buildRaceEmbed({
        turn,
        positions,
        diceFaces: session.diceFaces,
        title: "Kết quả đua xe 🏆",
        subtitle: `Top 1: **${winnerText}**`,
        color: 0x22c55e
      }),
      buildEmbed({
        title: "Settlement",
        description: [
          `Tổng lượt cược: **${settlement.betCount}**`,
          `Lượt thắng: **${settlement.winnerCount}**`,
          `Lượt thua: **${settlement.loserCount}**`,
          `Tổng trả thưởng: **${formatPoints(settlement.totalPayout)}**`,
          `Tổng tiền mất: **${formatPoints(settlement.totalLost)}**`,
          "",
          "Người thắng:",
          ...settlement.winnerLines,
          "",
          "Người thua:",
          ...settlement.loserLines
        ].join("\n"),
        color: 0x22c55e
      })
    ]
  }).catch(() => null);
}

async function runSession(channel, session) {
  while (session.running) {
    session.round += 1;
    const round = session.round;

    const bets = await collectRoundBets(channel, session, round);
    if (bets.length === 0) {
      session.idleRounds += 1;

      if (session.idleRounds >= MAX_IDLE_ROUNDS) {
        session.running = false;
        await channel.send({
          embeds: [
            buildEmbed({
              title: "Đua xe đã tự động dừng",
              description: `Đã qua **${MAX_IDLE_ROUNDS}** phiên liên tiếp không có cược.`,
              color: 0xf36c5c
            })
          ]
        });
        break;
      }

      continue;
    }

    session.idleRounds = 0;
    await runRaceRound(channel, session, round, bets);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("race")
    .setDescription("Đặt cược đua xe 8 xe - tung xúc xắc mỗi lượt"),
  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", flags: MessageFlags.Ephemeral });
    }

    const channelId = interaction.channelId;
    const lockedBy = acquireChannelGameLock(channelId, "Dua xe");
    if (lockedBy) {
      return interaction.reply({
        content: `${lockedBy} đang chạy ở kênh này. Hãy chờ game hiện tại kết thúc.`,
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await primeEmojiCaches(interaction.guild);
      const diceFaces = await resolveDiceFaces(interaction.guild);

      const session = {
        id: String(++sessionCounter),
        channelId,
        round: 0,
        idleRounds: 0,
        running: true,
        diceFaces
      };

      await interaction.reply({
        content: "Đã bắt đầu game đua xe. Đặt cược nào!",
        flags: MessageFlags.Ephemeral
      });

      await runSession(interaction.channel, session);
    } finally {
      releaseChannelGameLock(channelId);
    }
  }
};
