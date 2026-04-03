const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  buildEmbed,
  normalizeAmount,
  getOrCreateUser,
  formatPoints
} = require("./utils");

const GRID_SIZE = 6;
const MIN_CLUSTER_SIZE = 4;
const JACKPOT_EMOJI = "💎";
const JACKPOT_CLUSTER_BONUS = 30_000;
const COOLDOWN_MS = 4_000;
const SPIN_FRAME_DELAYS_MS = [140, 180, 220, 280, 340];
const CASCADE_FRAME_DELAY_MS = 230;
const CASCADE_PRE_DROP_DELAY_MS = 3_000;
const CASCADE_SAFETY_MAX_STEPS = 50;

const SYMBOLS = [
  { emoji: "🍒", weight: 32, base: 0.03 },
  { emoji: "🍋", weight: 24, base: 0.04 },
  { emoji: "🍊", weight: 18, base: 0.05 },
  { emoji: "🍇", weight: 12, base: 0.07 },
  { emoji: "🍀", weight: 8, base: 0.1 },
  { emoji: "🔔", weight: 4, base: 0.18 },
  { emoji: "⭐", weight: 2, base: 0.35 },
  { emoji: JACKPOT_EMOJI, weight: 1, base: 0.9 }
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
const BASE_BY_EMOJI = new Map(SYMBOLS.map((symbol) => [symbol.emoji, symbol.base]));
const cooldownByUser = new Map();
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

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

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function getSizeFactor(size) {
  if (size <= 4) {
    return 1;
  }

  if (size === 5) {
    return 1.35;
  }

  if (size === 6) {
    return 1.8;
  }

  if (size === 7) {
    return 2.4;
  }

  if (size === 8) {
    return 3.1;
  }

  if (size === 9) {
    return 3.9;
  }

  if (size === 10) {
    return 4.8;
  }

  return 5.8;
}

function findWinningClusters(grid) {
  const visited = Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => false));
  const clusters = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if (visited[row][col]) {
        continue;
      }

      const emoji = grid[row][col];
      if (!emoji) {
        visited[row][col] = true;
        continue;
      }

      const queue = [{ row, col }];
      const cells = [];
      visited[row][col] = true;

      while (queue.length > 0) {
        const current = queue.shift();
        cells.push(current);

        for (const [dr, dc] of DIRECTIONS) {
          const nextRow = current.row + dr;
          const nextCol = current.col + dc;
          const inside = nextRow >= 0 && nextRow < GRID_SIZE && nextCol >= 0 && nextCol < GRID_SIZE;
          if (!inside || visited[nextRow][nextCol]) {
            continue;
          }

          if (grid[nextRow][nextCol] !== emoji) {
            continue;
          }

          visited[nextRow][nextCol] = true;
          queue.push({ row: nextRow, col: nextCol });
        }
      }

      if (cells.length >= MIN_CLUSTER_SIZE) {
        clusters.push({ emoji, cells, size: cells.length });
      }
    }
  }

  return clusters;
}

function scoreCluster(cluster, bet) {
  const base = Number(BASE_BY_EMOJI.get(cluster.emoji) || 0);
  const sizeFactor = getSizeFactor(cluster.size);
  const factor = base * sizeFactor;
  const payout = Math.round(bet * factor);
  const jackpotBonus = cluster.emoji === JACKPOT_EMOJI && cluster.size >= 5 ? JACKPOT_CLUSTER_BONUS : 0;

  return {
    emoji: cluster.emoji,
    size: cluster.size,
    factor,
    payout,
    jackpotBonus,
    total: payout + jackpotBonus,
    cells: cluster.cells
  };
}

function clearClustersAndDrop(grid, scoredClusters) {
  const nextGrid = cloneGrid(grid);
  for (const cluster of scoredClusters) {
    for (const cell of cluster.cells) {
      nextGrid[cell.row][cell.col] = null;
    }
  }

  for (let col = 0; col < GRID_SIZE; col += 1) {
    const kept = [];
    for (let row = GRID_SIZE - 1; row >= 0; row -= 1) {
      const value = nextGrid[row][col];
      if (value) {
        kept.push(value);
      }
    }

    for (let row = GRID_SIZE - 1, idx = 0; row >= 0; row -= 1, idx += 1) {
      nextGrid[row][col] = kept[idx] || pickSymbol();
    }
  }

  return nextGrid;
}

function runCascade(initialGrid, bet) {
  let grid = cloneGrid(initialGrid);
  const steps = [];
  let totalPayout = 0;

  for (let step = 1; step <= CASCADE_SAFETY_MAX_STEPS; step += 1) {
    const clusters = findWinningClusters(grid);
    if (!clusters.length) {
      break;
    }

    const scored = clusters
      .map((cluster) => scoreCluster(cluster, bet))
      .filter((item) => item.total > 0);

    if (!scored.length) {
      break;
    }

    const stepBaseLinePayout = scored.reduce((sum, item) => sum + item.payout, 0);
    const stepBaseJackpotBonus = scored.reduce((sum, item) => sum + item.jackpotBonus, 0);
    const stepBaseTotal = stepBaseLinePayout + stepBaseJackpotBonus;
    const stepMultiplier = Math.pow(2, step - 1);
    const stepTotal = Math.round(stepBaseTotal * stepMultiplier);
    totalPayout += stepTotal;

    const jackpotClusters = scored.filter((item) => item.jackpotBonus > 0).length;
    const gridBeforeDrop = cloneGrid(grid);
    grid = clearClustersAndDrop(grid, scored);

    steps.push({
      step,
      scored,
      clusterCount: scored.length,
      jackpotClusters,
      baseLinePayout: stepBaseLinePayout,
      baseJackpotBonus: stepBaseJackpotBonus,
      baseTotal: stepBaseTotal,
      multiplier: stepMultiplier,
      total: stepTotal,
      gridBeforeDrop,
      gridAfterDrop: cloneGrid(grid)
    });
  }

  return {
    steps,
    totalPayout,
    finalGrid: grid
  };
}

function simulateNohuV2Round(bet) {
  const initialGrid = spinGrid();
  const result = runCascade(initialGrid, bet);
  const totalPayout = result.totalPayout;
  const net = totalPayout - bet;
  const jackpotClusterCount = result.steps.reduce((sum, step) => sum + step.jackpotClusters, 0);

  return {
    bet,
    net,
    totalPayout,
    totalCascades: result.steps.length,
    totalCombos: result.steps.reduce((sum, step) => sum + step.clusterCount, 0),
    jackpotClusterCount,
    initialGrid,
    finalGrid: result.finalGrid,
    steps: result.steps
  };
}

function formatGrid(grid) {
  return grid.map((row) => row.join(" ")).join("\n");
}

function formatTopCombos(steps, maxItems = 8) {
  const combos = steps.flatMap((step) => step.scored);
  if (!combos.length) {
    return `Không có cụm ${MIN_CLUSTER_SIZE}+ liền nhau.`;
  }

  const sorted = [...combos].sort((a, b) => b.total - a.total);
  const lines = sorted.slice(0, maxItems).map((combo) => (
    `${combo.emoji} cụm ${combo.size} ô | x${combo.factor.toFixed(2)} | +${formatPoints(combo.total)}`
  ));

  if (sorted.length > maxItems) {
    lines.push(`... và ${sorted.length - maxItems} combo khác`);
  }

  return lines.join("\n");
}

function formatComboCells(cells, maxCells = 6) {
  const preview = cells
    .slice(0, maxCells)
    .map((cell) => `(${cell.row + 1},${cell.col + 1})`)
    .join(" ");

  if (cells.length > maxCells) {
    return `${preview} ... +${cells.length - maxCells} ô`;
  }

  return preview;
}

function formatStepComboBreakdown(step, maxItems = 6) {
  if (!Array.isArray(step?.scored) || step.scored.length === 0) {
    return "Không có combo hợp lệ ở phase này.";
  }

  const sorted = [...step.scored].sort((a, b) => b.total - a.total);
  const lines = sorted.slice(0, maxItems).map((combo, index) => {
    const jackpotText = combo.jackpotBonus > 0 ? ` + jackpot ${formatPoints(combo.jackpotBonus)}` : "";
    return [
      `#${index + 1} ${combo.emoji} cụm ${combo.size} ô | base x${combo.factor.toFixed(2)} = ${formatPoints(combo.payout)}${jackpotText}`,
      `Ô ăn: ${formatComboCells(combo.cells)}`
    ].join("\n");
  });

  if (sorted.length > maxItems) {
    lines.push(`... và ${sorted.length - maxItems} combo khác`);
  }

  return lines.join("\n");
}

function formatCascadeSummary(steps) {
  if (!steps.length) {
    return "Không kích hoạt cascade nào.";
  }

  return steps
    .map((step) => {
      const jackpotText = step.jackpotClusters > 0
        ? ` | Jackpot: ${step.jackpotClusters}`
        : "";
      return `Cascade ${step.step}: ${step.clusterCount} combo | Base ${formatPoints(step.baseTotal)} x${step.multiplier} = +${formatPoints(step.total)}${jackpotText}`;
    })
    .join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSpinEmbed({ userName, bet, grid, frameIndex, totalFrames }) {
  return buildEmbed({
    title: "Nổ Hũ V2 6x6 - Đang quay...",
    description: [
      `Người chơi: **${userName}**`,
      `Cược: **${formatPoints(bet)}** điểm`,
      "",
      formatGrid(grid),
      "",
      `Đang quay (${frameIndex}/${totalFrames})`
    ].join("\n"),
    color: 0xf6c244
  });
}

function buildCascadeEmbed({ userName, bet, step, totalPayoutSoFar }) {
  return buildEmbed({
    title: `Nổ Hũ V2 6x6 - Cascade ${step.step}`,
    description: [
      `Người chơi: **${userName}**`,
      `Cược: **${formatPoints(bet)}** điểm`,
      `Combo: **${step.clusterCount}** | Base: **${formatPoints(step.baseTotal)}** | Hệ số: **x${step.multiplier}**`,
      `Bước này nhận: **+${formatPoints(step.total)}**`,
      `Tạm tính: **+${formatPoints(totalPayoutSoFar)}**`,
      "",
      formatGrid(step.gridAfterDrop)
    ].join("\n"),
    color: 0x6ae4c5
  });
}

function buildCascadePreDropEmbed({ userName, bet, step, totalPayoutSoFar }) {
  return buildEmbed({
    title: `Nổ Hũ V2 6x6 - Combo ${step.step}`,
    description: [
      `Người chơi: **${userName}**`,
      `Cược: **${formatPoints(bet)}** điểm`,
      `Combo: **${step.clusterCount}** | Base: **${formatPoints(step.baseTotal)}** | Hệ số: **x${step.multiplier}**`,
      `Công thức phase: **${formatPoints(step.baseTotal)} x ${step.multiplier} = ${formatPoints(step.total)}**`,
      `Combo này nhận: **+${formatPoints(step.total)}**`,
      `Tạm tính: **+${formatPoints(totalPayoutSoFar)}**`,
      "",
      "Chi tiết phase:",
      formatStepComboBreakdown(step),
      "",
      formatGrid(step.gridBeforeDrop),
      "",
      "Đang chuẩn bị nổ combo..."
    ].join("\n"),
    color: 0xf6c244
  });
}

module.exports = {
  simulateNohuV2Round,
  data: new SlashCommandBuilder()
    .setName("nohuv2")
    .setDescription("Nổ hũ V2 6x6 - combo cụm + cascade")
    .addStringOption((opt) => (
      opt
        .setName("bet")
        .setDescription("Số điểm cược (vd: 1000, 1k, 2m)")
        .setRequired(true)
    )),

  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", flags: MessageFlags.Ephemeral });
    }

    const betInput = interaction.options.getString("bet", true);
    const bet = normalizeAmount(betInput);
    if (!bet) {
      return interaction.reply({ content: "Số điểm cược không hợp lệ.", flags: MessageFlags.Ephemeral });
    }

    const now = Date.now();
    const cooldownUntil = cooldownByUser.get(interaction.user.id) || 0;
    if (cooldownUntil > now) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
      return interaction.reply({
        content: `Bạn đang quay hơi nhanh, chờ thêm ${waitSeconds}s nhé.`,
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
        const frameGrid = i === SPIN_FRAME_DELAYS_MS.length - 1 ? finalGrid : spinGrid();
        const embed = buildSpinEmbed({
          userName,
          bet,
          grid: frameGrid,
          frameIndex: i + 1,
          totalFrames: SPIN_FRAME_DELAYS_MS.length
        });
        await interaction.editReply({ embeds: [embed], content: "" });
        await sleep(SPIN_FRAME_DELAYS_MS[i]);
      }

      const result = runCascade(finalGrid, bet);
      let runningPayout = 0;
      for (const step of result.steps) {
        runningPayout += step.total;

        const preDropEmbed = buildCascadePreDropEmbed({
          userName,
          bet,
          step,
          totalPayoutSoFar: runningPayout
        });
        await interaction.editReply({ embeds: [preDropEmbed], content: "" });
        await sleep(CASCADE_PRE_DROP_DELAY_MS);

        const cascadeEmbed = buildCascadeEmbed({
          userName,
          bet,
          step,
          totalPayoutSoFar: runningPayout
        });
        await interaction.editReply({ embeds: [cascadeEmbed], content: "" });
        await sleep(CASCADE_FRAME_DELAY_MS);
      }

      const totalPayout = result.totalPayout;
      if (totalPayout > 0) {
        user.balance += totalPayout;
        await user.save();
      }
      gameSettled = true;

      const net = totalPayout - bet;
      const title = net >= 0 ? "Nổ Hũ V2 6x6 - Bạn thắng!" : "Nổ Hũ V2 6x6 - Chúc bạn may mắn lần sau";
      const color = net >= 0 ? 0x42d392 : 0xff6b6b;
      const jackpotClusterCount = result.steps.reduce((sum, step) => sum + step.jackpotClusters, 0);
      const jackpotBonus = result.steps.reduce((sum, step) => sum + Math.round(step.baseJackpotBonus * step.multiplier), 0);
      const jackpotLineText = jackpotClusterCount > 0
        ? `\nCombo jackpot 💎: **${jackpotClusterCount}** | Thưởng thêm: **${formatPoints(jackpotBonus)}**`
        : "";

      const resultEmbed = buildEmbed({
        title,
        description: [
          `Người chơi: **${userName}**`,
          "",
          formatGrid(result.finalGrid),
          "",
          `Cược: **${formatPoints(bet)}** điểm`,
          `Tổng trả thưởng: **${formatPoints(totalPayout)}** điểm${jackpotLineText}`,
          `Lãi/Lỗ: **${net >= 0 ? "+" : ""}${formatPoints(net)}** điểm`,
          `Số dư mới: **${formatPoints(user.balance)}**`,
          "",
          "Tổng kết cascade:",
          formatCascadeSummary(result.steps),
          "",
          "Top combo trúng:",
          formatTopCombos(result.steps)
        ].join("\n"),
        color
      });

      await interaction.editReply({ embeds: [resultEmbed], content: "" });
    } catch (error) {
      console.error("NohuV2 command failed:", error);

      let refunded = false;
      if (user && wagerReserved && !gameSettled) {
        try {
          user.balance += bet;
          await user.save();
          refunded = true;
        } catch (refundError) {
          console.error("Failed to refund nohuv2 wager:", refundError);
        }
      }

      const fallbackContent = refunded
        ? "Lệnh /nohuv2 bị lỗi tạm thời. Tiền cược đã được hoàn lại, bạn thử lại giúp mình."
        : "Lệnh /nohuv2 bị lỗi tạm thời. Vui lòng thử lại sau.";

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: fallbackContent, embeds: [], components: [] });
        } else {
          await interaction.reply({ content: fallbackContent, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error("Failed to send /nohuv2 fallback response:", replyError);
      }
    } finally {
      const latestCooldown = cooldownByUser.get(interaction.user.id);
      if (latestCooldown && latestCooldown <= Date.now()) {
        cooldownByUser.delete(interaction.user.id);
      }
    }
  }
};