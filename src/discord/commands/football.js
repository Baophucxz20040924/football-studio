const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { buildEmbed, normalizeAmount, getOrCreateUser } = require("./utils");

const BET_WINDOW_MS = 30_000;
const MAX_IDLE_ROUNDS = 4;
const HOME_PAYOUT_MULTIPLIER = 2;
const DRAW_PAYOUT_MULTIPLIER = 11;
const CARD_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SPIN_FRAMES = ["⚽️↩️", "⚽️↪️"];
const REVEAL_TICK_MS = 700;
const REVEAL_TICKS = 4;

const sessions = new Map();
let sessionCounter = 0;

function drawCard() {
  const index = Math.floor(Math.random() * CARD_ORDER.length);
  return { label: CARD_ORDER[index], value: index + 2 };
}

function buildBetRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:home`)
      .setLabel("Home")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:away`)
      .setLabel("Away")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:draw`)
      .setLabel("Draw")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDisabledRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:home`)
      .setLabel("Home")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:away`)
      .setLabel("Away")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`fb:${sessionId}:${round}:draw`)
      .setLabel("Draw")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function getPickLabel(pick) {
  if (pick === "home") return "Home Win";
  if (pick === "away") return "Away Win";
  return "Draw";
}

function getSpinFrame(index) {
  return SPIN_FRAMES[index % SPIN_FRAMES.length];
}

function buildRoundEmbed(round, secondsLeft, frame) {
  return buildEmbed({
    title: "Football Studio",
    description: [
      `Round: **${round}**`,
      `Còn lại: **${secondsLeft}s** ${frame}`,
      "Đặt cược trong 30 giây.",
      "Home/Away: 1 ăn 1 (x2). Draw: x11.",
      "Nếu ra Draw mà không cược Draw: mất nửa tiền."
    ].join("\n"),
    color: 0xf6c244
  });
}

function buildRevealEmbed(round, frame) {
  return buildEmbed({
    title: "Football Studio",
    description: [
      `Round: **${round}**`,
      `Đang chia bài... ${frame}`
    ].join("\n"),
    color: 0xf6c244
  });
}

async function settleBets(bets, result) {
  let totalPayout = 0;
  let winners = 0;
  let refunds = 0;

  for (const bet of bets) {
    const user = await getOrCreateUser(bet.userId, bet.userName);
    let payout = 0;
    if (result === "draw") {
      if (bet.pick === "draw") {
        payout = bet.amount * DRAW_PAYOUT_MULTIPLIER;
        winners += 1;
      } else {
        payout = Math.floor(bet.amount / 2);
        if (payout > 0) {
          refunds += 1;
        }
      }
    } else if (bet.pick === result) {
      payout = bet.amount * HOME_PAYOUT_MULTIPLIER;
      winners += 1;
    }

    if (payout > 0) {
      user.balance += payout;
      totalPayout += payout;
      await user.save();
    }
  }

  return { totalPayout, winners, refunds };
}

async function runSession(channel, session) {
  while (session.running) {
    session.round += 1;

    const round = session.round;
    const bets = [];
    const endTime = Date.now() + BET_WINDOW_MS;
    let frameIndex = 0;
    const embed = buildRoundEmbed(round, Math.ceil(BET_WINDOW_MS / 1000), getSpinFrame(frameIndex));

    const message = await channel.send({
      embeds: [embed],
      components: [buildBetRow(session.id, round)]
    });

    const countdownInterval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      frameIndex += 1;
      const updated = buildRoundEmbed(round, secondsLeft, getSpinFrame(frameIndex));
      message.edit({ embeds: [updated] }).catch(() => null);

      if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    const collector = message.createMessageComponentCollector({
      time: BET_WINDOW_MS
    });

    collector.on("collect", async (btn) => {
      const [prefix, sessionId, roundId, pick] = btn.customId.split(":");
      if (prefix !== "fb" || sessionId !== session.id || Number(roundId) !== round) {
        await btn.reply({ content: "Phiên cược này đã hết hạn.", ephemeral: true });
        return;
      }

      const modalId = `fbm:${sessionId}:${round}:${btn.user.id}:${pick}`;
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Đặt cược Football");

      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Số điểm")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

      await btn.showModal(modal);

      let submitted;
      try {
        submitted = await btn.awaitModalSubmit({
          time: BET_WINDOW_MS,
          filter: (i) => i.customId === modalId && i.user.id === btn.user.id
        });
      } catch (err) {
        return;
      }

      const amount = normalizeAmount(submitted.fields.getTextInputValue("amount").trim());
      if (!amount) {
        await submitted.reply({ content: "Số điểm không hợp lệ.", ephemeral: true });
        return;
      }

      if (collector.ended) {
        await submitted.reply({ content: "Phiên cược đã kết thúc.", ephemeral: true });
        return;
      }

      const userName = submitted.user.globalName || submitted.user.username;
      const user = await getOrCreateUser(submitted.user.id, userName);
      if (user.balance < amount) {
        await submitted.reply({
          content: `Không đủ số dư. Hiện tại: ${user.balance}.`,
          ephemeral: true
        });
        return;
      }

      user.balance -= amount;
      await user.save();

      bets.push({
        userId: submitted.user.id,
        userName,
        pick,
        amount
      });

      await submitted.reply({
        content: `Đã đặt cược **${amount}** vào **${getPickLabel(pick)}**.`,
        ephemeral: true
      });
    });

    collector.on("end", async () => {
      clearInterval(countdownInterval);
      await message.edit({
        embeds: [buildRoundEmbed(round, 0, getSpinFrame(frameIndex))],
        components: [buildDisabledRow(session.id, round)]
      });
    });

    await new Promise((resolve) => setTimeout(resolve, BET_WINDOW_MS));

    const noPlayers = bets.length === 0;
    if (noPlayers) {
      session.idleRounds += 1;
    } else {
      session.idleRounds = 0;
    }

    for (let tick = 0; tick < REVEAL_TICKS; tick += 1) {
      const revealEmbed = buildRevealEmbed(round, getSpinFrame(tick));
      await message.edit({ embeds: [revealEmbed], components: [buildDisabledRow(session.id, round)] });
      await new Promise((resolve) => setTimeout(resolve, REVEAL_TICK_MS));
    }

    const homeCard = drawCard();
    const awayCard = drawCard();
    const result = homeCard.value > awayCard.value
      ? "home"
      : awayCard.value > homeCard.value
        ? "away"
        : "draw";

    const settlement = await settleBets(bets, result);
    const resultEmbed = buildEmbed({
      title: "Kết quả Football Studio",
      description: [
        `Home: **${homeCard.label}**`,
        `Away: **${awayCard.label}**`,
        `Kết quả: **${getPickLabel(result)}**`,
        `Số lượt cược: **${bets.length}**`,
        `Thắng: **${settlement.winners}** | Hoàn nửa: **${settlement.refunds}**`,
        `Tổng trả thưởng: **${settlement.totalPayout}**`
      ].join("\n"),
      color: result === "draw" ? 0xf6c244 : 0x6ae4c5
    });

    await channel.send({ embeds: [resultEmbed] });

    if (noPlayers && session.idleRounds >= MAX_IDLE_ROUNDS) {
      session.running = false;
      break;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("football")
    .setDescription("Football Studio - dat cuoc Home/Away/Draw"),
  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", ephemeral: true });
    }

    const channelId = interaction.channelId;
    if (sessions.has(channelId)) {
      return interaction.reply({
        content: "Football Studio đang chạy ở kênh này. Hãy chờ phiên kết thúc.",
        ephemeral: true
      });
    }

    const session = {
      id: String(++sessionCounter),
      channelId,
      round: 0,
      idleRounds: 0,
      running: true
    };
    sessions.set(channelId, session);

    await interaction.reply({
      content: "Đã bắt đầu Football Studio. Mọi người đặt cược!",
      ephemeral: true
    });

    try {
      await runSession(interaction.channel, session);
    } finally {
      sessions.delete(channelId);
    }
  }
};
