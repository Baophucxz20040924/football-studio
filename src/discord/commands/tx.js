const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { buildEmbed, normalizeAmount, getOrCreateUser, formatPoints } = require("./utils");

const BET_WINDOW_MS = 30_000;
const MAX_IDLE_ROUNDS = 4;
const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const DICE_REVEAL_DELAY_MS = 3000;

const NUMBER_ODDS = new Map([
  [3, 100],
  [4, 42],
  [5, 26],
  [6, 18],
  [7, 12],
  [8, 8],
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 8],
  [14, 12],
  [15, 18],
  [16, 26],
  [17, 42],
  [18, 100]
]);

const sessions = new Map();
let sessionCounter = 0;

function rollDice() {
  const dice = [
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6)
  ];
  const total = dice.reduce((sum, value) => sum + value, 0);
  const faces = dice.map((value) => DICE_FACES[value - 1]);
  return { dice, total, faces };
}

function getSpinFrame(index) {
  const face = DICE_FACES[index % DICE_FACES.length];
  return `${face} ${face} ${face}`;
}

function buildBetRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:tai`)
      .setLabel("Tài")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:xiu`)
      .setLabel("Xỉu")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:chan`)
      .setLabel("Chẵn")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:le`)
      .setLabel("Lẻ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:so`)
      .setLabel("Số (3-18)")
      .setStyle(ButtonStyle.Success)
  );
}

function buildDisabledRow(sessionId, round) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:tai`)
      .setLabel("Tài")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:xiu`)
      .setLabel("Xỉu")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:chan`)
      .setLabel("Chẵn")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:le`)
      .setLabel("Lẻ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`tx:${sessionId}:${round}:so`)
      .setLabel("Số (3-18)")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );
}

function buildRoundEmbed(round, secondsLeft, frame) {
  return buildEmbed({
    title: "Tài Xỉu 🎲",
    description: [
      `Phiên: **${round}**`,
      `Còn lại: **${secondsLeft}s** ${frame}`,
      "Đặt cược trong 30 giây.",
      "Tài/Xỉu/Chẵn/Lẻ: 1 ăn 1.",
      "Cược số (3-18): theo bảng tỉ lệ."
    ].join("\n"),
    color: 0xf6c244
  });
}

function buildResultEmbed(round, roll, settlement) {
  const taiXiu = roll.total >= 11 ? "Tài" : "Xỉu";
  const chanLe = roll.total % 2 === 0 ? "Chẵn" : "Lẻ";
  const diceLabel = roll.faces ? roll.faces.join(" ") : roll.dice.join(" - ");

  return buildEmbed({
    title: "Kết quả Tài Xỉu 🎲",
    description: [
      `Phiên: **${round}**`,
      `Kết quả: ${diceLabel} = **${roll.total}** (${taiXiu}, ${chanLe})`,
      `Số lượt cược: **${settlement.betCount}**`,
      `Thắng: **${settlement.winners}**`,
      `Tổng trả thưởng: **${formatPoints(settlement.totalPayout)}**`
    ].join("\n"),
    color: 0x6ae4c5
  });
}

function buildRevealEmbed(round, faces, revealedCount) {
  const slots = [0, 1, 2].map((index) => (index < revealedCount ? faces[index] : "❔")).join(" ");
  return buildEmbed({
    title: "Tài Xỉu 🎲",
    description: [
      `Phiên: **${round}**`,
      "Đang mở xúc xắc...",
      `Kết quả: ${slots}`
    ].join("\n"),
    color: 0xf6c244
  });
}

function getPickLabel(pick, number) {
  if (pick === "tai") return "Tài";
  if (pick === "xiu") return "Xỉu";
  if (pick === "chan") return "Chẵn";
  if (pick === "le") return "Lẻ";
  return `Số ${number}`;
}

function isWinningBet(bet, roll) {
  if (bet.pick === "tai") return roll.total >= 11;
  if (bet.pick === "xiu") return roll.total <= 10;
  if (bet.pick === "chan") return roll.total % 2 === 0;
  if (bet.pick === "le") return roll.total % 2 === 1;
  return bet.pick === "so" && bet.number === roll.total;
}

function getPayoutMultiplier(bet) {
  if (bet.pick === "so") {
    const odds = NUMBER_ODDS.get(bet.number) || 0;
    return 1 + odds;
  }
  return 2;
}

async function settleBets(bets, roll) {
  let totalPayout = 0;
  let winners = 0;

  for (const bet of bets) {
    if (!isWinningBet(bet, roll)) {
      continue;
    }

    const multiplier = getPayoutMultiplier(bet);
    const payout = Math.round(bet.amount * multiplier);
    if (payout <= 0) {
      continue;
    }

    const user = await getOrCreateUser(bet.userId, bet.userName);
    user.balance += payout;
    await user.save();

    winners += 1;
    totalPayout += payout;
  }

  return { totalPayout, winners, betCount: bets.length };
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
      if (prefix !== "tx" || sessionId !== session.id || Number(roundId) !== round) {
        await btn.reply({ content: "Phiên cược này đã hết hạn.", ephemeral: true });
        return;
      }

      const modalId = `txm:${sessionId}:${round}:${btn.user.id}:${pick}`;
      const modal = new ModalBuilder().setCustomId(modalId).setTitle("Đặt cược Tài Xỉu");

      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Số điểm")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputs = [new ActionRowBuilder().addComponents(amountInput)];

      if (pick === "so") {
        const numberInput = new TextInputBuilder()
          .setCustomId("number")
          .setLabel("Chọn số (3-18)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        inputs.unshift(new ActionRowBuilder().addComponents(numberInput));
      }

      modal.addComponents(...inputs);

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

      await submitted.deferReply({ ephemeral: true });

      const amount = normalizeAmount(submitted.fields.getTextInputValue("amount").trim());
      if (!amount) {
        await submitted.editReply({ content: "Số điểm không hợp lệ." });
        return;
      }

      let selectedNumber = null;
      if (pick === "so") {
        const rawNumber = submitted.fields.getTextInputValue("number").trim();
        const parsedNumber = Number(rawNumber);
        if (!Number.isInteger(parsedNumber) || parsedNumber < 3 || parsedNumber > 18) {
          await submitted.editReply({ content: "Số cược phải từ 3 đến 18." });
          return;
        }
        selectedNumber = parsedNumber;
      }

      if (collector.ended) {
        await submitted.editReply({ content: "Phiên cược đã kết thúc." });
        return;
      }

      const userName = submitted.user.globalName || submitted.user.username;
      const user = await getOrCreateUser(submitted.user.id, userName);
      if (user.balance < amount) {
        await submitted.editReply({
          content: `Không đủ số dư. Hiện tại: ${formatPoints(user.balance)}.`
        });
        return;
      }

      user.balance -= amount;
      await user.save();

      bets.push({
        userId: submitted.user.id,
        userName,
        pick,
        number: selectedNumber,
        amount
      });

      await submitted.editReply({
        content: `Đã đặt cược **${formatPoints(amount)}** vào **${getPickLabel(pick, selectedNumber)}**.`
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

    const roll = rollDice();
    for (let i = 1; i <= 3; i += 1) {
      const revealEmbed = buildRevealEmbed(round, roll.faces, i);
      await message.edit({
        embeds: [revealEmbed],
        components: [buildDisabledRow(session.id, round)]
      }).catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, DICE_REVEAL_DELAY_MS));
    }

    const settlement = await settleBets(bets, roll);
    const resultEmbed = buildResultEmbed(round, roll, settlement);

    await channel.send({ embeds: [resultEmbed] });

    if (noPlayers && session.idleRounds >= MAX_IDLE_ROUNDS) {
      session.running = false;
      break;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tx")
    .setDescription("Tai xiu - dat cuoc tai/xiu/chan/le/so"),
  async execute(interaction) {
    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", ephemeral: true });
    }

    const channelId = interaction.channelId;
    if (sessions.has(channelId)) {
      return interaction.reply({
        content: "Tài Xỉu đang chạy ở kênh này. Hãy chờ phiên kết thúc.",
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
      content: "Đã bắt đầu Tài Xỉu. Mọi người đặt cược!",
      ephemeral: true
    });

    try {
      await runSession(interaction.channel, session);
    } finally {
      sessions.delete(channelId);
    }
  }
};
