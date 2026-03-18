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
const { buildEmbed, getOrCreateUser, normalizeAmount, formatPoints } = require("./utils");
const {
  DEFAULT_SYMBOL,
  TRADE_SESSION_INTERVAL_MINUTES,
  PAYOUT_MULTIPLIER,
  formatPrice,
  getCurrentTradePrice,
  getTradeOverview,
  getUserTradeBet,
  placeTradeBet,
  ensureTradeEngineStarted
} = require("../../trade/service");

const SESSION_TIMEOUT_MS = 60000;
const LIVE_PRICE_REFRESH_MS = 5000;
const QUICK_AMOUNT_OPTIONS = [100, 500, 1000, 5000, 10000];

function formatDirection(direction) {
  return direction === "up" ? "Lên" : "Xuống";
}

function buildSessionLabel(session) {
  if (!session) {
    return "Chưa sẵn sàng";
  }

  return `${formatDiscordTime(session.startTime)} -> ${formatDiscordTime(session.endTime)}`;
}

function formatDiscordTime(value, style = "t") {
  const date = new Date(value);
  const seconds = Math.floor(date.getTime() / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "(không rõ)";
  }

  return `<t:${seconds}:${style}>`;
}

function toValidLivePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return price;
}

function buildTradeDescription({ overview, balance, existingBet, selectedDirection, selectedAmount, note, livePrice, livePriceAt }) {
  const lines = [
    `Coin: **${overview.symbol || DEFAULT_SYMBOL}**`,
    `Link chart: ${overview.chartUrl}`
  ];

  const validLivePrice = toValidLivePrice(livePrice);
  if (validLivePrice !== null) {
    lines.push(`Giá hiện tại: **${formatPrice(validLivePrice)}**`);
    if (livePriceAt) {
      lines.push(`Data cập nhật lúc: **${formatDiscordTime(livePriceAt, "T")}**`);
    }
  }

  if (overview.activeSession) {
    lines.push(
      "",
      `Phiên đang chạy: **${buildSessionLabel(overview.activeSession)}**`,
      `Giá mở: **${formatPrice(overview.activeSession.openPrice)}**`
    );
  }

  if (overview.nextSession) {
    lines.push(
      "",
      `Phiên đang nhận cược: **${buildSessionLabel(overview.nextSession)}**`,
      "Mở cược: **ngay bây giờ**",
      `Đóng cược lúc: **${formatDiscordTime(overview.nextSession.endTime, "f")}**`
    );
  }

  if (overview.lastSettledSession) {
    lines.push(
      "",
      `Phiên vừa chốt: **${buildSessionLabel(overview.lastSettledSession)}**`,
      `Kết quả: **${overview.lastSettledSession.result === "up" ? "Lên" : overview.lastSettledSession.result === "down" ? "Xuống" : "Hòa"}**`,
      `Giá: **${formatPrice(overview.lastSettledSession.openPrice)}** -> **${formatPrice(overview.lastSettledSession.closePrice)}**`,
      `Mốc data đầu ra đã chốt: **${formatDiscordTime(overview.lastSettledSession.endTime, "f")}**`
    );
  }

  const currentBet = existingBet;
  if (currentBet) {
    lines.push(
      "",
      `Cược của bạn cho phiên kế tiếp: **${formatDirection(currentBet.direction)}** ${formatPoints(currentBet.amount)}`
    );
  } else {
    lines.push(
      "",
      `Hướng đã chọn: **${selectedDirection ? formatDirection(selectedDirection) : "(chưa chọn)"}**`,
      `Số tiền đã chọn: **${selectedAmount ? formatPoints(selectedAmount) : "(chưa chọn)"}**`
    );
  }

  if (note) {
    lines.push("", note);
  }

  lines.push(
    "",
    `Số dư hiện tại: **${formatPoints(balance)}**`,
    `Thắng nhận: **x${PAYOUT_MULTIPLIER}** | Hòa: **hoàn tiền**`
  );

  return lines.join("\n");
}

function buildDirectionRow(selectedDirection, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("trade:dir:up")
      .setLabel("Lên")
      .setStyle(selectedDirection === "up" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("trade:dir:down")
      .setLabel("Xuống")
      .setStyle(selectedDirection === "down" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

function buildAmountRow(selectedAmount, disabled = false) {
  return new ActionRowBuilder().addComponents(
    ...QUICK_AMOUNT_OPTIONS.map((amount) => (
      new ButtonBuilder()
        .setCustomId(`trade:amt:${amount}`)
        .setLabel(amount >= 1000 ? `${Math.round(amount / 1000)}K` : String(amount))
        .setStyle(selectedAmount === amount ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled)
    ))
  );
}

function buildActionRows({ selectedDirection, selectedAmount, disableAll = false }) {
  return [
    buildDirectionRow(selectedDirection, disableAll),
    buildAmountRow(selectedAmount, disableAll || !selectedDirection),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("trade:amt_custom")
        .setLabel("Nhập tay")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disableAll || !selectedDirection),
      new ButtonBuilder()
        .setCustomId("trade:confirm")
        .setLabel("Xác nhận")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disableAll || !selectedDirection || !selectedAmount)
    )
  ];
}

async function buildTradePanel({ userId, balance, existingBet, selectedDirection, selectedAmount, note, closed, livePrice, livePriceAt }) {
  const overview = await getTradeOverview();
  const sessionMinutes = Number.isFinite(TRADE_SESSION_INTERVAL_MINUTES)
    ? TRADE_SESSION_INTERVAL_MINUTES
    : 2;
  const embed = buildEmbed({
    title: existingBet
      ? `Trade ${sessionMinutes} phút (đã đặt cược)`
      : `Trade ${sessionMinutes} phút`,
    description: buildTradeDescription({
      overview,
      balance,
      existingBet,
      selectedDirection,
      selectedAmount,
      note,
      livePrice,
      livePriceAt
    }),
    color: existingBet ? 0x22c55e : 0x6ae4c5
  });

  if (closed || existingBet) {
    return { embeds: [embed], components: [] };
  }

  return {
    embeds: [embed],
    components: buildActionRows({ selectedDirection, selectedAmount })
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Mở bảng trade và đặt cược cho phiên kế tiếp"),
  async execute(interaction) {
    const userName = interaction.user.globalName || interaction.user.username;
    const user = await getOrCreateUser(interaction.user.id, userName);
    await ensureTradeEngineStarted();

    const overview = await getTradeOverview();
    const initialBet = overview.nextSession
      ? await getUserTradeBet(interaction.user.id, overview.nextSession._id)
      : null;

    let selectedDirection = null;
    let selectedAmount = null;
    let finalized = false;
    let finalizeReason = "";
    let panelNote = null;
    let panelClosed = false;
    let existingBetState = initialBet || null;
    let livePrice = null;
    let livePriceAt = null;
    let livePriceTimer = null;

    async function refreshLivePriceAndPanel() {
      try {
        const overview = await getTradeOverview();

        // Nếu phiên user đã cược đã được chốt, dừng ticker để không đè message kết quả.
        if (
          existingBetState &&
          overview.lastSettledSession &&
          String(overview.lastSettledSession._id) === String(existingBetState.sessionId)
        ) {
          stopLiveTicker();
          return;
        }

        const snapshot = await getCurrentTradePrice();
        livePrice = toValidLivePrice(snapshot?.price);
        livePriceAt = snapshot?.fetchedAt || new Date();

        await interaction.editReply(await buildTradePanel({
          userId: interaction.user.id,
          balance: user.balance,
          existingBet: existingBetState,
          selectedDirection,
          selectedAmount,
          note: panelNote,
          closed: panelClosed,
          livePrice,
          livePriceAt
        }));
      } catch {
        // Ignore transient fetch/edit errors during live ticker.
      }
    }

    function startLiveTicker() {
      if (livePriceTimer) {
        return;
      }
      livePriceTimer = setInterval(() => {
        void refreshLivePriceAndPanel();
      }, LIVE_PRICE_REFRESH_MS);
    }

    function stopLiveTicker() {
      if (livePriceTimer) {
        clearInterval(livePriceTimer);
        livePriceTimer = null;
      }
    }

    // Lấy giá realtime ngay lần đầu để panel vừa hiện đã có giá.
    try {
      const snapshot = await getCurrentTradePrice();
      livePrice = toValidLivePrice(snapshot?.price);
      livePriceAt = snapshot?.fetchedAt || new Date();
    } catch {
      // Ignore initial live-price fetch errors.
    }

    await interaction.reply(await buildTradePanel({
      userId: interaction.user.id,
      balance: user.balance,
      existingBet: existingBetState,
      selectedDirection,
      selectedAmount,
      note: panelNote,
      closed: panelClosed,
      livePrice,
      livePriceAt
    }));

    startLiveTicker();
    void refreshLivePriceAndPanel();

    if (initialBet) {
      return null;
    }

    const replyMessage = await interaction.fetchReply();
    const collector = replyMessage.createMessageComponentCollector({ time: SESSION_TIMEOUT_MS });

    collector.on("collect", async (componentInteraction) => {
      if (componentInteraction.user.id !== interaction.user.id) {
        await componentInteraction.reply({ content: "Bảng trade này không phải của bạn.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (!componentInteraction.isButton()) {
        return;
      }

      const [, action, value] = componentInteraction.customId.split(":");
      if (action === "dir") {
        selectedDirection = value === "up" ? "up" : value === "down" ? "down" : null;
        if (!selectedDirection) {
          await componentInteraction.reply({ content: "Hướng trade không hợp lệ.", flags: MessageFlags.Ephemeral });
          return;
        }

        selectedAmount = null;
        await componentInteraction.update(await buildTradePanel({
          userId: interaction.user.id,
          balance: user.balance,
          existingBet: null,
          selectedDirection,
          selectedAmount
        }));
        return;
      }

      if (action === "amt") {
        if (!selectedDirection) {
          await componentInteraction.reply({ content: "Chọn hướng trước khi chọn số tiền.", flags: MessageFlags.Ephemeral });
          return;
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          await componentInteraction.reply({ content: "Số tiền không hợp lệ.", flags: MessageFlags.Ephemeral });
          return;
        }

        selectedAmount = Math.floor(parsed);
        await componentInteraction.update(await buildTradePanel({
          userId: interaction.user.id,
          balance: user.balance,
          existingBet: null,
          selectedDirection,
          selectedAmount
        }));
        return;
      }

      if (action === "amt_custom") {
        if (!selectedDirection) {
          await componentInteraction.reply({ content: "Chọn hướng trước khi nhập tiền.", flags: MessageFlags.Ephemeral });
          return;
        }

        const modalId = `trade_custom:${interaction.id}:${componentInteraction.id}`;
        const modal = new ModalBuilder()
          .setCustomId(modalId)
          .setTitle("Nhập số tiền trade");

        const amountInput = new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Số điểm (hỗ trợ 1k, 2.5k)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("Ví dụ: 1000 hoặc 1k");

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await componentInteraction.showModal(modal);

        let submitted;
        try {
          submitted = await componentInteraction.awaitModalSubmit({
            time: SESSION_TIMEOUT_MS,
            filter: (i) => i.customId === modalId && i.user.id === componentInteraction.user.id
          });
        } catch {
          return;
        }

        const parsedAmount = normalizeAmount(submitted.fields.getTextInputValue("amount").trim());
        if (!parsedAmount || parsedAmount <= 0) {
          await submitted.reply({ content: "Số tiền không hợp lệ.", flags: MessageFlags.Ephemeral });
          return;
        }

        selectedAmount = parsedAmount;
        await submitted.reply({
          content: `Đã chọn ${formatPoints(selectedAmount)} điểm. Bấm Xác nhận để đặt cược.`,
          flags: MessageFlags.Ephemeral
        });

        await interaction.editReply(await buildTradePanel({
          userId: interaction.user.id,
          balance: user.balance,
          existingBet: null,
          selectedDirection,
          selectedAmount
        }));
        return;
      }

      if (action === "confirm") {
        if (!selectedDirection || !selectedAmount) {
          await componentInteraction.reply({ content: "Chọn đủ hướng và số tiền trước khi xác nhận.", flags: MessageFlags.Ephemeral });
          return;
        }

        try {
          const placed = await placeTradeBet({
            userId: interaction.user.id,
            userName,
            direction: selectedDirection,
            amount: selectedAmount,
            channelId: componentInteraction.channelId,
            messageId: componentInteraction.message.id
          });
          user.balance = placed.balance;
          existingBetState = placed.bet;
          panelNote = "Đặt cược thành công. Hệ thống sẽ tự động chốt kết quả khi hết phiên.";
          panelClosed = true;

          finalized = true;
          finalizeReason = "placed";
          collector.stop("placed");

          await componentInteraction.update(await buildTradePanel({
            userId: interaction.user.id,
            balance: placed.balance,
            existingBet: existingBetState,
            selectedDirection,
            selectedAmount,
            note: panelNote,
            closed: panelClosed,
            livePrice,
            livePriceAt
          }));

          // Vẫn giữ ticker để cập nhật giá 5s/lần cho tới khi phiên active kết thúc.
          startLiveTicker();
        } catch (error) {
          await componentInteraction.reply({
            content: String(error?.message || "Không thể đặt trade lúc này."),
            flags: MessageFlags.Ephemeral
          });
        }
      }
    });

    collector.on("end", async () => {
      if (finalized && finalizeReason === "placed") {
        return;
      }

      try {
        panelClosed = true;
        panelNote = "Phiên thao tác đã hết hạn. Gõ /trade để mở lại.";
        await interaction.editReply(await buildTradePanel({
          userId: interaction.user.id,
          balance: user.balance,
          existingBet: null,
          selectedDirection,
          selectedAmount,
          note: panelNote,
          closed: panelClosed,
          livePrice,
          livePriceAt
        }));
      } catch {
        // Ignore edit failures when panel expired.
      }
    });

    return null;
  }
};