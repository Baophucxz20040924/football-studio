const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const {
  buildEmbed,
  normalizeAmount,
  getOrCreateUser,
  formatPoints,
  primeEmojiCaches,
  findEmojiByName
} = require("./utils");

const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
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
const GAME_TIMEOUT_MS = 90_000;
const DEALER_DRAW_DELAY_MS = 3_000;
const CARD_BACK_EMOJI_NAME = "download";
const CARD_BACK_EMOJI_FALLBACK = "🂠";

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
    const emoji = findEmojiByName(guild, emojiName);
    if (emoji) {
      return emoji.toString();
    }
  }

  return null;
}

function resolveCardBackEmoji(guild) {
  if (!guild) {
    return CARD_BACK_EMOJI_FALLBACK;
  }

  const emoji = findEmojiByName(guild, CARD_BACK_EMOJI_NAME);
  return emoji ? emoji.toString() : CARD_BACK_EMOJI_FALLBACK;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawCard(guild) {
  const rank = CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)];
  const suit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
  const customEmoji = resolveCustomCardEmoji(guild, rank, suit);
  const fallbackSuitEmoji = CARD_SUIT_EMOJIS[suit] || "";
  const display = customEmoji || `${rank}${fallbackSuitEmoji}`;
  return { rank, suit, emoji: customEmoji || fallbackSuitEmoji, label: display };
}

function getCardBaseValue(rank) {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return Number(rank);
}

function calculateHandValue(cards) {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += getCardBaseValue(card.rank);
    if (card.rank === "A") {
      aces += 1;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function isBlackjack(cards) {
  return cards.length === 2 && calculateHandValue(cards) === 21;
}

function formatHand(cards) {
  return cards.map((card) => card.label).join(" ");
}

function buildControls(gameId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:${gameId}:hit`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj:${gameId}:stand`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildDisabledControls(gameId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:${gameId}:hit`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`bj:${gameId}:stand`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function buildGameEmbed({
  playerName,
  amount,
  playerCards,
  dealerCards,
  revealDealer,
  status,
  cardBackEmoji
}) {
  const playerTotal = calculateHandValue(playerCards);
  const shownDealerCards = revealDealer
    ? formatHand(dealerCards)
    : `${dealerCards[0].label} ${cardBackEmoji}`;
  const dealerTotal = revealDealer ? calculateHandValue(dealerCards) : "?";

  return buildEmbed({
    title: "Blackjack 🃏",
    description: [
      `Người chơi: **${playerName}**`,
      `Cược: **${formatPoints(amount)}** điểm`,
      `Dealer: **${shownDealerCards}** (=${dealerTotal})`,
      `Bạn: **${formatHand(playerCards)}** (=${playerTotal})`,
      "",
      status
    ].join("\n"),
    color: revealDealer ? 0x6ae4c5 : 0xf6c244
  });
}

function isCustomEmoji(value) {
  return /^<a?:\w+:\d+>$/.test(value);
}

function buildJumboCardBoard(playerCards, dealerCards, revealDealer, cardBackEmoji) {
  const visibleDealerCards = revealDealer ? dealerCards : dealerCards.slice(0, 1);
  const visibleCards = [...playerCards, ...visibleDealerCards];
  if (visibleCards.length === 0 || visibleCards.some((card) => !isCustomEmoji(card.emoji))) {
    return null;
  }

  const dealerLine = revealDealer
    ? ["🟥", ...dealerCards.map((card) => card.emoji)].join(" ")
    : ["🟥", dealerCards[0].emoji, cardBackEmoji].join(" ");
  const playerLine = ["🟦", ...playerCards.map((card) => card.emoji)].join(" ");
  return [dealerLine, playerLine].join("\n");
}

function buildGameMessagePayload({
  playerName,
  amount,
  playerCards,
  dealerCards,
  revealDealer,
  status,
  components,
  fetchReply,
  cardBackEmoji = CARD_BACK_EMOJI_FALLBACK
}) {
  const payload = {
    embeds: [
      buildGameEmbed({
        playerName,
        amount,
        playerCards,
        dealerCards,
        revealDealer,
        status,
        cardBackEmoji
      })
    ]
  };

  const jumboCardBoard = buildJumboCardBoard(playerCards, dealerCards, revealDealer, cardBackEmoji);
  if (jumboCardBoard) {
    payload.content = jumboCardBoard;
  }

  if (components) {
    payload.components = components;
  }

  if (fetchReply) {
    payload.fetchReply = true;
  }

  return payload;
}

function settleResult({ playerCards, dealerCards, amount }) {
  const playerTotal = calculateHandValue(playerCards);
  const dealerTotal = calculateHandValue(dealerCards);
  const playerBj = isBlackjack(playerCards);
  const dealerBj = isBlackjack(dealerCards);

  if (playerTotal > 21) {
    return { outcome: "lose", payout: 0, message: "Bạn quắc (>21). Thua ván này." };
  }

  if (playerBj && dealerBj) {
    return { outcome: "push", payout: amount, message: "Cả hai cùng Blackjack. Hòa (push)." };
  }

  if (playerBj) {
    return {
      outcome: "blackjack",
      payout: Math.round(amount * 2.5),
      message: "Blackjack! (A + 10/J/Q/K) trả thưởng 3:2."
    };
  }

  if (dealerBj) {
    return { outcome: "lose", payout: 0, message: "Dealer có Blackjack. Bạn thua." };
  }

  if (dealerTotal > 21) {
    return { outcome: "win", payout: amount * 2, message: "Dealer quắc (>21). Bạn thắng!" };
  }

  if (playerTotal > dealerTotal) {
    return { outcome: "win", payout: amount * 2, message: "Bạn gần 21 hơn dealer. Bạn thắng!" };
  }

  if (playerTotal < dealerTotal) {
    return { outcome: "lose", payout: 0, message: "Dealer gần 21 hơn. Bạn thua." };
  }

  return { outcome: "push", payout: amount, message: "Bằng điểm dealer. Hòa (push)." };
}

let gameCounter = 0;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bj")
    .setDescription("Blackjack - đấu với dealer")
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Số điểm cược").setRequired(true)
    ),
  async execute(interaction) {
    const cardBackEmoji = resolveCardBackEmoji(interaction.guild);

    if (!interaction.channel) {
      return interaction.reply({ content: "Lệnh này chỉ dùng trong server.", flags: MessageFlags.Ephemeral });
    }

    const amount = normalizeAmount(interaction.options.getInteger("amount", true));
    if (!amount) {
      return interaction.reply({ content: "Số điểm cược không hợp lệ.", flags: MessageFlags.Ephemeral });
    }

    const userName = interaction.user.globalName || interaction.user.username;
    let user;
    let wagerReserved = false;
    let gameSettled = false;

    try {
      await interaction.deferReply();
      void primeEmojiCaches(interaction.guild).catch((error) => {
        console.warn("Failed to prime emoji caches for bj command:", error?.message || error);
      });

      user = await getOrCreateUser(interaction.user.id, userName);
      if (user.balance < amount) {
        await interaction.editReply({ content: "Không đủ số dư để đặt cược này." });
        return;
      }

      user.balance -= amount;
      await user.save();
      wagerReserved = true;

      const playerCards = [drawCard(interaction.guild), drawCard(interaction.guild)];
      const dealerCards = [drawCard(interaction.guild), drawCard(interaction.guild)];
      const gameId = `${interaction.id}-${++gameCounter}`;

      const initialPlayerBj = isBlackjack(playerCards);
      const initialDealerBj = isBlackjack(dealerCards);
      const immediateEnd = initialPlayerBj || initialDealerBj;

      if (immediateEnd) {
        const settlement = settleResult({ playerCards, dealerCards, amount });
        if (settlement.payout > 0) {
          user.balance += settlement.payout;
          await user.save();
        }
        gameSettled = true;

        await interaction.editReply(buildGameMessagePayload({
          playerName: userName,
          amount,
          playerCards,
          dealerCards,
          revealDealer: true,
          status: settlement.message,
          cardBackEmoji
        }));
        return;
      }

      await interaction.editReply(buildGameMessagePayload({
        playerName: userName,
        amount,
        playerCards,
        dealerCards,
        revealDealer: false,
        status: "Bấm **Hit** để rút thêm, hoặc **Stand** để dừng.",
        components: [buildControls(gameId)],
        cardBackEmoji
      }));
      const replyMessage = await interaction.fetchReply();

      let finished = false;
      const safeEditGameMessage = async (payload) => {
        try {
          await replyMessage.edit(payload);
          return true;
        } catch (error) {
          console.warn("Failed to edit bj game message:", error?.message || error);
          return false;
        }
      };

      const endGame = async (statusMessage) => {
        if (finished) {
          return;
        }
        finished = true;

        const playerTotal = calculateHandValue(playerCards);
        const needsDealerPlay = playerTotal <= 21;

        if (needsDealerPlay) {
          await safeEditGameMessage(buildGameMessagePayload({
            playerName: userName,
            amount,
            playerCards,
            dealerCards,
            revealDealer: true,
            status: `${statusMessage}\nDealer lật bài...`,
            components: [buildDisabledControls(gameId)],
            cardBackEmoji
          }));

          await sleep(DEALER_DRAW_DELAY_MS);

          while (calculateHandValue(dealerCards) < 17) {
            dealerCards.push(drawCard(interaction.guild));

            await safeEditGameMessage(buildGameMessagePayload({
              playerName: userName,
              amount,
              playerCards,
              dealerCards,
              revealDealer: true,
              status: `${statusMessage}\nDealer rút thêm 1 lá...`,
              components: [buildDisabledControls(gameId)],
              cardBackEmoji
            }));

            await sleep(DEALER_DRAW_DELAY_MS);
          }
        }

        const settlement = settleResult({ playerCards, dealerCards, amount });
        if (settlement.payout > 0) {
          user.balance += settlement.payout;
          await user.save();
        }
        gameSettled = true;

        const summary = [
          statusMessage,
          settlement.message
        ].join("\n");

        await safeEditGameMessage(buildGameMessagePayload({
          playerName: userName,
          amount,
          playerCards,
          dealerCards,
          revealDealer: true,
          status: summary,
          components: [buildDisabledControls(gameId)],
          cardBackEmoji
        }));
      };

      const collector = replyMessage.createMessageComponentCollector({
        time: GAME_TIMEOUT_MS
      });

      collector.on("collect", async (btn) => {
        try {
          const [prefix, targetGameId, action] = btn.customId.split(":");
          if (prefix !== "bj" || targetGameId !== gameId) {
            await btn.reply({ content: "Ván này đã hết hạn.", flags: MessageFlags.Ephemeral });
            return;
          }

          if (btn.user.id !== interaction.user.id) {
            await btn.reply({ content: "Chỉ người tạo ván mới được bấm nút.", flags: MessageFlags.Ephemeral });
            return;
          }

          if (finished) {
            await btn.reply({ content: "Ván đã kết thúc.", flags: MessageFlags.Ephemeral });
            return;
          }

          await btn.deferUpdate();

          if (action === "hit") {
            playerCards.push(drawCard(interaction.guild));
            const total = calculateHandValue(playerCards);

            if (total > 21) {
              collector.stop("player-bust");
              await endGame("Bạn đã chọn **Hit**.");
              return;
            }

            if (total === 21) {
              collector.stop("auto-stand");
              await endGame("Bạn đạt **21**. Tự động Stand.");
              return;
            }

            await safeEditGameMessage(buildGameMessagePayload({
              playerName: userName,
              amount,
              playerCards,
              dealerCards,
              revealDealer: false,
              status: "Bạn vừa **Hit**. Tiếp tục Hit hoặc Stand.",
              components: [buildControls(gameId)],
              cardBackEmoji
            }));
            return;
          }

          collector.stop("player-stand");
          await endGame("Bạn đã chọn **Stand**.");
        } catch (error) {
          console.error("Failed to handle bj button interaction:", error);
          if (!finished) {
            collector.stop("collector-error");
            await endGame("Có lỗi khi xử lý lượt. Tự động **Stand**.");
          }
        }
      });

      collector.on("end", async (_collected, reason) => {
        try {
          if (finished) {
            return;
          }

          if (reason === "time") {
            await endGame("Hết thời gian thao tác. Tự động **Stand**.");
          }
        } catch (error) {
          console.error("Failed to finalize bj game collector:", error);
        }
      });
    } catch (error) {
      console.error("Blackjack command failed:", error);

      let refunded = false;
      if (user && wagerReserved && !gameSettled) {
        try {
          user.balance += amount;
          await user.save();
          refunded = true;
        } catch (refundError) {
          console.error("Failed to refund bj wager after command error:", refundError);
        }
      }

      const fallbackContent = refunded
        ? "Lệnh bj bị lỗi tạm thời. Tiền cược đã được hoàn lại, bạn thử lại giúp mình."
        : "Lệnh bj bị lỗi tạm thời. Vui lòng thử lại sau ít phút.";

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: fallbackContent, embeds: [], components: [] });
        } else {
          await interaction.reply({ content: fallbackContent, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error("Failed to send bj fallback response:", replyError);
      }
    }
  }
};