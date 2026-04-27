const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { buildEmbed, getOrCreateUser, normalizeAmount, formatPoints } = require("./utils");
const {
  SUPPORTED_SYMBOLS,
  MAX_LEVERAGE,
  HISTORY_LIMIT_MAX,
  fetchLiveTickers,
  openPosition,
  getOpenPositions,
  closePosition,
  getHistory,
  getWeeklyPnl
} = require("../../tradev2/service");

const COLOR_NEUTRAL = 0x38bdf8;
const COLOR_PROFIT = 0x22c55e;
const COLOR_LOSS = 0xef4444;
const COLOR_WARN = 0xf59e0b;
const LIVE_POSITIONS_DURATION_MS = 60_000;
const LIVE_POSITIONS_REFRESH_MS = 5_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) {
    return "-";
  }
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

function formatPercent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(2)}%`;
}

function formatSignedPoints(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatPoints(amount)}`;
}

function formatDiscordTime(value, style = "f") {
  const date = new Date(value);
  const seconds = Math.floor(date.getTime() / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "-";
  }
  return `<t:${seconds}:${style}>`;
}

function shortId(position) {
  return String(position?._id || "").slice(-8) || "-";
}

function getPnlColor(value) {
  const amount = Number(value);
  if (amount > 0) return COLOR_PROFIT;
  if (amount < 0) return COLOR_LOSS;
  return COLOR_NEUTRAL;
}

function addSymbolChoices(option) {
  for (const symbol of SUPPORTED_SYMBOLS) {
    option.addChoices({ name: symbol, value: symbol });
  }
  return option;
}

function buildLiveEmbed(tickers) {
  const rows = tickers.map((ticker) => {
    const change = formatPercent(ticker.priceChangePercent);
    return `**${ticker.symbol}** | ${formatPrice(ticker.price)} | 24h ${change}`;
  });
  return buildEmbed({
    title: "TradeV2 Live Binance Futures",
    description: `${rows.join("\n")}\n\nMarket giả lập, không đặt lệnh thật.`,
    color: COLOR_NEUTRAL
  });
}

function buildOpenEmbed({ position, ticker, balance }) {
  const description = [
    `Position: **${shortId(position)}**`,
    `Symbol: **${position.symbol}** | Side: **${position.side.toUpperCase()}**`,
    `Entry: **${formatPrice(ticker.price)}**`,
    `Margin: **${formatPoints(position.margin)}** | Leverage: **${position.leverage}x**`,
    `Quantity: **${position.quantity.toFixed(8)}**`,
    `Balance còn lại: **${formatPoints(balance)}**`,
    "",
    `Đóng lệnh bằng: \`/tradev2 close position_id:${position._id}\``
  ].join("\n");
  return buildEmbed({ title: "TradeV2 đã khớp lệnh", description, color: COLOR_PROFIT });
}

function buildPositionsEmbed(items, options = {}) {
  const { refreshEndsAt, isFinal = false, updatedAt = new Date() } = options;
  if (!items.length) {
    return buildEmbed({
      title: "TradeV2 Positions",
      description: "Bạn chưa có position nào đang mở.",
      color: COLOR_NEUTRAL
    });
  }

  const rows = items.map(({ position, ticker, pnl, roe }) => [
    `**${shortId(position)}** | ${position.symbol} ${position.side.toUpperCase()} ${position.leverage}x`,
    `Entry: ${formatPrice(position.entryPrice)} | Now: ${formatPrice(ticker?.price)}`,
    `Margin: ${formatPoints(position.margin)} | PnL: **${formatSignedPoints(pnl)}** (${formatPercent(roe)})`,
    `Close: \`/tradev2 close position_id:${position._id}\``
  ].join("\n"));

  const liveNote = refreshEndsAt
    ? isFinal
      ? "Live đã kết thúc. Gõ `/tradev2 positions` để xem tiếp."
      : `Live refresh mỗi ${LIVE_POSITIONS_REFRESH_MS / 1000}s đến ${formatDiscordTime(refreshEndsAt, "T")}.`
    : "";
  const updatedNote = `Cập nhật: ${formatDiscordTime(updatedAt, "T")}`;

  return buildEmbed({
    title: "TradeV2 Positions",
    description: [rows.join("\n\n"), liveNote, updatedNote].filter(Boolean).join("\n\n"),
    color: COLOR_NEUTRAL
  });
}

function buildCloseEmbed({ position, ticker, pnl, roe, returnedMargin, balance }) {
  const description = [
    `Position: **${shortId(position)}**`,
    `Symbol: **${position.symbol}** | Side: **${position.side.toUpperCase()}**`,
    `Entry: **${formatPrice(position.entryPrice)}** | Exit: **${formatPrice(ticker.price)}**`,
    `Margin: **${formatPoints(position.margin)}** | Returned: **${formatPoints(returnedMargin)}**`,
    `Realized PnL: **${formatSignedPoints(pnl)}** (${formatPercent(roe)})`,
    `Balance hiện tại: **${formatPoints(balance)}**`
  ].join("\n");
  return buildEmbed({ title: "TradeV2 đã đóng lệnh", description, color: getPnlColor(pnl) });
}

function buildHistoryEmbed(positions) {
  if (!positions.length) {
    return buildEmbed({ title: "TradeV2 History", description: "Chưa có lịch sử trade.", color: COLOR_NEUTRAL });
  }

  const rows = positions.map((position) => {
    const status = position.status === "open" ? "OPEN" : position.status.toUpperCase();
    const match = position.matchStatus === "filled" ? "khớp" : "không khớp";
    const exit = position.exitPrice > 0 ? formatPrice(position.exitPrice) : "-";
    const pnl = position.status === "closed" ? formatSignedPoints(position.realizedPnl) : "-";
    return [
      `**${shortId(position)}** | ${position.symbol} ${position.side.toUpperCase()} ${position.leverage}x | ${status}`,
      `Match: **${match}** | Margin: ${formatPoints(position.margin)} | PnL: ${pnl}`,
      `Entry: ${formatPrice(position.entryPrice)} | Exit: ${exit}`,
      `Time: ${formatDiscordTime(position.openedAt, "g")}`
    ].join("\n");
  });

  return buildEmbed({ title: "TradeV2 History", description: rows.join("\n\n"), color: COLOR_NEUTRAL });
}

function buildPnlEmbed(summary) {
  const description = [
    `Tuần bắt đầu: **${formatDiscordTime(summary.weekStart, "D")}**`,
    `Realized PnL: **${formatSignedPoints(summary.totalPnl)}**`,
    `Lệnh đã đóng: **${summary.totalTrades}**`,
    `Win/Loss/BE: **${summary.wins}/${summary.losses}/${summary.breakeven}**`,
    `Win rate: **${formatPercent(summary.winRate)}**`,
    `Position đang mở: **${summary.openCount}**`
  ].join("\n");
  return buildEmbed({ title: "TradeV2 PnL tuần", description, color: getPnlColor(summary.totalPnl) });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tradev2")
    .setDescription("Trade futures giả lập bằng giá Binance")
    .addSubcommand((subcommand) => subcommand
      .setName("live")
      .setDescription("Xem bảng giá hiện tại của 6 coin"))
    .addSubcommand((subcommand) => subcommand
      .setName("open")
      .setDescription("Mở position futures market")
      .addStringOption((option) => addSymbolChoices(option
        .setName("symbol")
        .setDescription("Coin muốn trade")
        .setRequired(true)))
      .addStringOption((option) => option
        .setName("side")
        .setDescription("Long hoặc Short")
        .setRequired(true)
        .addChoices(
          { name: "Long", value: "long" },
          { name: "Short", value: "short" }
        ))
      .addStringOption((option) => option
        .setName("margin")
        .setDescription("Số điểm ký quỹ, ví dụ 10000, 10k, 1m")
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName("leverage")
        .setDescription(`Đòn bẩy 1-${MAX_LEVERAGE}x`)
        .setMinValue(1)
        .setMaxValue(MAX_LEVERAGE)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("positions")
      .setDescription("Xem các position đang mở"))
    .addSubcommand((subcommand) => subcommand
      .setName("close")
      .setDescription("Đóng position đang mở")
      .addStringOption((option) => option
        .setName("position_id")
        .setDescription("ID position từ /tradev2 positions hoặc history")
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("history")
      .setDescription("Xem lịch sử trade gần nhất")
      .addIntegerOption((option) => option
        .setName("limit")
        .setDescription(`Số lệnh hiển thị, tối đa ${HISTORY_LIMIT_MAX}`)
        .setMinValue(1)
        .setMaxValue(HISTORY_LIMIT_MAX)))
    .addSubcommand((subcommand) => subcommand
      .setName("pnl")
      .setDescription("Xem lãi/lỗ đã chốt")
      .addStringOption((option) => option
        .setName("period")
        .setDescription("Khoảng thời gian")
        .addChoices({ name: "Week", value: "week" }))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userName = interaction.user.globalName || interaction.user.username;
    await getOrCreateUser(interaction.user.id, userName);

    try {
      if (subcommand === "live") {
        await interaction.deferReply();
        const tickers = await fetchLiveTickers();
        return interaction.editReply({ embeds: [buildLiveEmbed(tickers)] });
      }

      if (subcommand === "open") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const margin = normalizeAmount(interaction.options.getString("margin", true));
        if (!margin) {
          return interaction.editReply({ content: "Margin không hợp lệ. Ví dụ đúng: 10000, 10k, 1m." });
        }

        const result = await openPosition({
          userId: interaction.user.id,
          userName,
          symbol: interaction.options.getString("symbol", true),
          side: interaction.options.getString("side", true),
          margin,
          leverage: interaction.options.getInteger("leverage", true)
        });
        return interaction.editReply({ embeds: [buildOpenEmbed(result)] });
      }

      if (subcommand === "positions") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const refreshEndsAt = new Date(Date.now() + LIVE_POSITIONS_DURATION_MS);
        let positions = await getOpenPositions(interaction.user.id);
        await interaction.editReply({ embeds: [buildPositionsEmbed(positions, { refreshEndsAt })] });

        if (!positions.length) {
          return;
        }

        while (Date.now() < refreshEndsAt.getTime()) {
          await wait(LIVE_POSITIONS_REFRESH_MS);
          const isFinal = Date.now() >= refreshEndsAt.getTime();
          positions = await getOpenPositions(interaction.user.id);
          await interaction.editReply({
            embeds: [buildPositionsEmbed(positions, {
              refreshEndsAt,
              isFinal,
              updatedAt: new Date()
            })]
          });

          if (!positions.length) {
            return;
          }
        }
        return;
      }

      if (subcommand === "close") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await closePosition({
          userId: interaction.user.id,
          positionId: interaction.options.getString("position_id", true)
        });
        return interaction.editReply({ embeds: [buildCloseEmbed(result)] });
      }

      if (subcommand === "history") {
        const limit = interaction.options.getInteger("limit") || HISTORY_LIMIT_MAX;
        const positions = await getHistory(interaction.user.id, limit);
        return interaction.reply({ embeds: [buildHistoryEmbed(positions)], flags: MessageFlags.Ephemeral });
      }

      if (subcommand === "pnl") {
        const period = interaction.options.getString("period") || "week";
        if (period !== "week") {
          return interaction.reply({ content: "Hiện tại chỉ hỗ trợ period: week.", flags: MessageFlags.Ephemeral });
        }
        const summary = await getWeeklyPnl(interaction.user.id);
        return interaction.reply({ embeds: [buildPnlEmbed(summary)], flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: "Subcommand không hợp lệ.", flags: MessageFlags.Ephemeral });
    } catch (error) {
      const content = String(error?.message || "Không thể xử lý tradev2 lúc này.");
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content, embeds: [] });
      }
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
};
