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
const HOME_PAYOUT_MULTIPLIER = 2;
const DRAW_PAYOUT_MULTIPLIER = 11;
const CARD_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const CARD_SUITS = ["spades", "hearts", "diamonds", "clubs"];
const CARD_SUIT_EMOJIS = {
  spades: process.env.CARD_EMOJI_SPADES || "♠️",
  hearts: process.env.CARD_EMOJI_HEARTS || "♥️",
  diamonds: process.env.CARD_EMOJI_DIAMONDS || "♦️",
  clubs: process.env.CARD_EMOJI_CLUBS || "♣️"
};
const RANK_WORD_NAMES = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king"
};
const SPIN_FRAMES = ["⚽️↩️", "⚽️↪️"];
const REVEAL_TICK_MS = 700;
const REVEAL_TICKS = 4;

const sessions = new Map();
let sessionCounter = 0;

function drawCard() {
  const index = Math.floor(Math.random() * CARD_ORDER.length);
  const suitIndex = Math.floor(Math.random() * CARD_SUITS.length);
  const rank = CARD_ORDER[index];
  const suit = CARD_SUITS[suitIndex];
  return { rank, suit, value: index + 2 };
}

function buildCardEmojiCandidates(rank, suit) {
  const rankWordName = RANK_WORD_NAMES[rank];
  const rankLower = String(rank).toLowerCase();
  const isFace = ["J", "Q", "K"].includes(rank);
  const suffixes = isFace ? ["2", ""] : [""];
  const rankTokens = [];

  if (rankWordName) {
    rankTokens.push(rankWordName);
  }

  rankTokens.push(rankLower);

  if (/^\d+$/.test(rankLower)) {
    rankTokens.push(rankLower);
  }

  return [...new Set(rankTokens.flatMap((token) => suffixes.map((suffix) => `${token}_of_${suit}${suffix}`)))];
}

function resolveCustomCardEmoji(guild, rank, suit) {
  if (!guild) {
    return null;
  }

  const candidates = buildCardEmojiCandidates(rank, suit);
  for (const emojiName of candidates) {
    const emoji = guild.emojis.cache.find((item) => item.name === emojiName);
    if (emoji) {
      return emoji.toString();
    }
  }

  return null;
}

function formatCardDisplay(card, guild) {
  const customEmoji = resolveCustomCardEmoji(guild, card.rank, card.suit);
  if (customEmoji) {
    return customEmoji;
  }

  const fallbackSuitEmoji = CARD_SUIT_EMOJIS[card.suit] || "";
  return `${card.rank}${fallbackSuitEmoji}`;
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
    title: "Football Studio ⚽",
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
    title: "Football Studio ⚽",
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

      const modalId = `fbm:${sessionId}:${round}:${btn.user.id}:${pick}:${btn.id}`;
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

      try {
        await submitted.deferReply({ ephemeral: true });
      } catch (error) {
        if (error?.code === 40060) {
          return;
        }
        throw error;
      }

      const amount = normalizeAmount(submitted.fields.getTextInputValue("amount").trim());
      if (!amount) {
        await submitted.editReply({ content: "Số điểm không hợp lệ." });
        return;
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
        amount
      });

      await submitted.editReply({
        content: `Đã đặt cược **${formatPoints(amount)}** vào **${getPickLabel(pick)}**.`
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
    const homeDisplay = formatCardDisplay(homeCard, session.guild);
    const awayDisplay = formatCardDisplay(awayCard, session.guild);
    const result = homeCard.value > awayCard.value
      ? "home"
      : awayCard.value > homeCard.value
        ? "away"
        : "draw";

    const settlement = await settleBets(bets, result);
    const resultEmbed = buildEmbed({
      title: "Kết quả Football Studio 🏁",
      description: [
        `Home: **${homeDisplay}**`,
        `Away: **${awayDisplay}**`,
        `Kết quả: **${getPickLabel(result)}**`,
        `Số lượt cược: **${bets.length}**`,
        `Thắng: **${settlement.winners}** | Hoàn nửa: **${settlement.refunds}**`,
        `Tổng trả thưởng: **${formatPoints(settlement.totalPayout)}**`
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
      guild: interaction.guild,
      round: 0,
      idleRounds: 0,
      running: true
    };

    if (interaction.guild) {
      await interaction.guild.emojis.fetch().catch(() => null);
    }
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
