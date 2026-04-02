const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  buildEmbed,
  normalizeAmount,
  getOrCreateUser,
  formatPoints
} = require("./utils");

const GRID_SIZE = 3;
const JACKPOT_EMOJI = "💎";
const JACKPOT_BONUS = 50_000;

const SYMBOLS = [
  { emoji: "🍒", weight: 30, multiplier: 2 },
  { emoji: "🍋", weight: 24, multiplier: 3 },
  { emoji: "🍊", weight: 18, multiplier: 4 },
  { emoji: "🍇", weight: 13, multiplier: 6 },
  { emoji: "🔔", weight: 9, multiplier: 10 },
  { emoji: "⭐", weight: 5, multiplier: 20 },
  { emoji: JACKPOT_EMOJI, weight: 1, multiplier: 100 }
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
const MULTIPLIER_BY_EMOJI = new Map(SYMBOLS.map((symbol) => [symbol.emoji, symbol.multiplier]));
const COOLDOWN_MS = 3_000;
const cooldownByUser = new Map();
const SPIN_FRAME_DELAYS_MS = [180, 220, 260, 320, 420, 520];

function pickSymbol() {
  let roll = Math.random() * TOTAL_WEIGHT;

  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) {
      return symbol.emoji;
    }
  }

  return SYMBOLS[SYMBOLS.length - 1].emoji;
}

function spinGrid() {
  return Array.from({ length: GRID_SIZE }, () => (
    Array.from({ length: GRID_SIZE }, () => pickSymbol())
  ));
}

function evaluateWinningLines(grid) {
  const winningLines = [];
  let totalMultiplier = 0;

  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];
    if (row.every((emoji) => emoji === row[0])) {
      const multiplier = Number(MULTIPLIER_BY_EMOJI.get(row[0]) || 0);
      if (multiplier > 0) {
        winningLines.push({ label: `Hàng ${rowIndex + 1}`, emoji: row[0], multiplier });
        totalMultiplier += multiplier;
      }
    }
  }

  const mainDiagonal = grid.map((row, index) => row[index]);
  if (mainDiagonal.every((emoji) => emoji === mainDiagonal[0])) {
    const multiplier = Number(MULTIPLIER_BY_EMOJI.get(mainDiagonal[0]) || 0);
    if (multiplier > 0) {
      winningLines.push({ label: "Đường chéo", emoji: mainDiagonal[0], multiplier });
      totalMultiplier += multiplier;
    }
  }

  const secondaryDiagonal = grid.map((row, index) => row[GRID_SIZE - 1 - index]);
  if (secondaryDiagonal.every((emoji) => emoji === secondaryDiagonal[0])) {
    const multiplier = Number(MULTIPLIER_BY_EMOJI.get(secondaryDiagonal[0]) || 0);
    if (multiplier > 0) {
      winningLines.push({ label: "Đường chéo", emoji: secondaryDiagonal[0], multiplier });
      totalMultiplier += multiplier;
    }
  }

  return { winningLines, totalMultiplier };
}

function isJackpot(grid) {
  return grid.every((row) => row.every((emoji) => emoji === JACKPOT_EMOJI));
}

function formatGrid(grid) {
  return grid.map((row) => row.join(" ")).join("\n");
}

function formatWinningLines(winningLines) {
  if (winningLines.length === 0) {
    return "Không có hàng hoặc đường chéo nào trùng 3 biểu tượng.";
  }

  return winningLines
    .map((win) => `${win.label}: ${win.emoji}${win.emoji}${win.emoji} x${win.multiplier}`)
    .join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSpinningEmbed({ userName, bet, grid, frameIndex, totalFrames }) {
  return buildEmbed({
    title: "Nổ Hũ - Đang quay...",
    description: [
      `Người chơi: **${userName}**`,
      `Cược: **${formatPoints(bet)}** điểm`,
      "",
      formatGrid(grid),
      "",
      `Đang quay hũ... (${frameIndex}/${totalFrames})`
    ].join("\n"),
    color: 0xf6c244
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nohu")
    .setDescription("Nổ hũ 3x3 - quay để thử vận may")
    .addIntegerOption((opt) => (
      opt
        .setName("bet")
        .setDescription("Số điểm cược")
        .setRequired(true)
    )),

  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", flags: MessageFlags.Ephemeral });
    }

    const bet = normalizeAmount(interaction.options.getInteger("bet", true));
    if (!bet) {
      return interaction.reply({ content: "Số điểm cược không hợp lệ.", flags: MessageFlags.Ephemeral });
    }

    const now = Date.now();
    const cooldownUntil = cooldownByUser.get(interaction.user.id) || 0;
    if (cooldownUntil > now) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
      return interaction.reply({
        content: `Bạn quay hơi nhanh, chờ thêm ${waitSeconds}s rồi thử lại nhé.`,
        flags: MessageFlags.Ephemeral
      });
    }
    cooldownByUser.set(interaction.user.id, now + COOLDOWN_MS);

    const userName = interaction.user.globalName || interaction.user.username;
    let user;
    let wagerReserved = false;
    let gameSettled = false;

    try {
      await interaction.deferReply();

      user = await getOrCreateUser(interaction.user.id, userName);
      if (user.balance < bet) {
        await interaction.editReply({ content: "Không đủ số dư để đặt cược này." });
        return;
      }

      user.balance -= bet;
      await user.save();
      wagerReserved = true;

      const finalGrid = spinGrid();
      for (let i = 0; i < SPIN_FRAME_DELAYS_MS.length; i += 1) {
        const frameGrid = (i === SPIN_FRAME_DELAYS_MS.length - 1) ? finalGrid : spinGrid();
        const spinEmbed = buildSpinningEmbed({
          userName,
          bet,
          grid: frameGrid,
          frameIndex: i + 1,
          totalFrames: SPIN_FRAME_DELAYS_MS.length
        });

        await interaction.editReply({ embeds: [spinEmbed], content: "" });
        await sleep(SPIN_FRAME_DELAYS_MS[i]);
      }

      const grid = finalGrid;
      const { winningLines, totalMultiplier } = evaluateWinningLines(grid);
      const basePayout = Math.round(bet * totalMultiplier);
      const jackpotBonus = isJackpot(grid) ? JACKPOT_BONUS : 0;
      const totalPayout = basePayout + jackpotBonus;

      if (totalPayout > 0) {
        user.balance += totalPayout;
        await user.save();
      }
      gameSettled = true;

      const net = totalPayout - bet;
      const jackpotText = jackpotBonus > 0 ? `\n\nNỔ HŨ ${JACKPOT_EMOJI}! Thưởng thêm **${formatPoints(jackpotBonus)}** điểm.` : "";
      const resultTitle = net >= 0 ? "Nổ Hũ - Bạn thắng!" : "Nổ Hũ - Chúc bạn may mắn lần sau";
      const resultColor = net >= 0 ? 0x42d392 : 0xff6b6b;

      const embed = buildEmbed({
        title: resultTitle,
        description: [
          `Người chơi: **${userName}**`,
          "",
          formatGrid(grid),
          "",
          `Cược: **${formatPoints(bet)}** điểm`,
          `Kết quả trúng:`,
          formatWinningLines(winningLines),
          `Tổng nhân: **x${totalMultiplier}**`,
          `Trả thưởng: **${formatPoints(totalPayout)}** điểm`,
          `Lãi/Lỗ: **${net >= 0 ? "+" : ""}${formatPoints(net)}** điểm`,
          `Số dư mới: **${formatPoints(user.balance)}** điểm${jackpotText}`
        ].join("\n"),
        color: resultColor
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Nohu command failed:", error);

      let refunded = false;
      if (user && wagerReserved && !gameSettled) {
        try {
          user.balance += bet;
          await user.save();
          refunded = true;
        } catch (refundError) {
          console.error("Failed to refund nohu wager after command error:", refundError);
        }
      }

      const fallbackContent = refunded
        ? "Lệnh /nohu bị lỗi tạm thời. Tiền cược đã được hoàn lại, bạn thử lại giúp mình."
        : "Lệnh /nohu bị lỗi tạm thời. Vui lòng thử lại sau ít phút.";

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: fallbackContent, embeds: [], components: [] });
        } else {
          await interaction.reply({ content: fallbackContent, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error("Failed to send /nohu fallback response:", replyError);
      }
    } finally {
      const latestCooldown = cooldownByUser.get(interaction.user.id);
      if (latestCooldown && latestCooldown <= Date.now()) {
        cooldownByUser.delete(interaction.user.id);
      }
    }
  }
};