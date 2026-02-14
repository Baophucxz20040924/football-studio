const SUITS = ['S', 'C', 'D', 'H']
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']

const suitPower = (suit) => SUITS.indexOf(suit)
const rankPower = (rank) => RANKS.indexOf(rank)

const parseCard = (card) => {
  const suit = card.at(-1)
  const rank = card.slice(0, -1)
  return {
    raw: card,
    rank,
    suit,
    rankPower: rankPower(rank),
    suitPower: suitPower(suit),
  }
}

const sortCards = (cards) => {
  return [...cards].sort((a, b) => {
    const ca = typeof a === 'string' ? parseCard(a) : a
    const cb = typeof b === 'string' ? parseCard(b) : b

    if (ca.rankPower !== cb.rankPower) {
      return ca.rankPower - cb.rankPower
    }

    return ca.suitPower - cb.suitPower
  })
}

const buildDeck = () => {
  const deck = []

  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`)
    }
  }

  return deck
}

const shuffleDeck = (deck) => {
  const copied = [...deck]
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copied[i]
    copied[i] = copied[j]
    copied[j] = temp
  }
  return copied
}

const isConsecutive = (powers) => {
  for (let i = 1; i < powers.length; i += 1) {
    if (powers[i] !== powers[i - 1] + 1) {
      return false
    }
  }
  return true
}

const getMaxSuitForRank = (cards, targetRankPower) => {
  return cards
    .filter((card) => card.rankPower === targetRankPower)
    .reduce((max, card) => Math.max(max, card.suitPower), -1)
}

const detectCombo = (selectedCards) => {
  if (!selectedCards || selectedCards.length === 0) {
    return null
  }

  const cards = sortCards(selectedCards).map((card) =>
    typeof card === 'string' ? parseCard(card) : card,
  )

  const len = cards.length
  const uniqueRanks = new Set(cards.map((card) => card.rankPower))
  const highest = cards[len - 1]

  if (len === 1) {
    return {
      type: 'single',
      length: 1,
      rankPower: highest.rankPower,
      suitPower: highest.suitPower,
      cards: cards.map((card) => card.raw),
    }
  }

  if (len === 2 && uniqueRanks.size === 1) {
    const rank = cards[0].rankPower
    return {
      type: 'pair',
      length: 2,
      rankPower: rank,
      suitPower: Math.max(cards[0].suitPower, cards[1].suitPower),
      cards: cards.map((card) => card.raw),
    }
  }

  if (len === 3 && uniqueRanks.size === 1) {
    const rank = cards[0].rankPower
    return {
      type: 'triple',
      length: 3,
      rankPower: rank,
      suitPower: Math.max(...cards.map((card) => card.suitPower)),
      cards: cards.map((card) => card.raw),
    }
  }

  if (len === 4 && uniqueRanks.size === 1) {
    const rank = cards[0].rankPower
    return {
      type: 'fourOfKind',
      length: 4,
      rankPower: rank,
      suitPower: Math.max(...cards.map((card) => card.suitPower)),
      cards: cards.map((card) => card.raw),
    }
  }

  if (len >= 3 && uniqueRanks.size === len) {
    const rankPowers = cards.map((card) => card.rankPower)
    const hasTwo = rankPowers.includes(rankPower('2'))
    if (!hasTwo && isConsecutive(rankPowers)) {
      return {
        type: 'straight',
        length: len,
        rankPower: highest.rankPower,
        suitPower: highest.suitPower,
        cards: cards.map((card) => card.raw),
      }
    }
  }

  if (len >= 6 && len % 2 === 0) {
    const rankGroups = []
    for (let i = 0; i < cards.length; i += 2) {
      const c1 = cards[i]
      const c2 = cards[i + 1]

      if (c1.rankPower !== c2.rankPower) {
        return null
      }

      rankGroups.push(c1.rankPower)
    }

    const hasTwo = rankGroups.includes(rankPower('2'))
    if (!hasTwo && isConsecutive(rankGroups)) {
      const highestRank = rankGroups[rankGroups.length - 1]
      return {
        type: 'consecutivePairs',
        length: len,
        rankPower: highestRank,
        suitPower: getMaxSuitForRank(cards, highestRank),
        cards: cards.map((card) => card.raw),
      }
    }
  }

  return null
}

const sameTypeCanBeat = (currentCombo, nextCombo) => {
  if (currentCombo.type !== nextCombo.type || currentCombo.length !== nextCombo.length) {
    return false
  }

  if (nextCombo.rankPower > currentCombo.rankPower) {
    return true
  }

  if (nextCombo.rankPower === currentCombo.rankPower) {
    return nextCombo.suitPower > currentCombo.suitPower
  }

  return false
}

const canBeat = (currentCombo, nextCombo) => {
  if (!nextCombo) {
    return false
  }

  if (!currentCombo) {
    return true
  }

  if (sameTypeCanBeat(currentCombo, nextCombo)) {
    return true
  }

  const twoRank = rankPower('2')
  const isSingleTwo = currentCombo.type === 'single' && currentCombo.rankPower === twoRank
  const isPairTwo = currentCombo.type === 'pair' && currentCombo.rankPower === twoRank

  if (isSingleTwo && nextCombo.type === 'fourOfKind') {
    return true
  }

  if (isPairTwo && nextCombo.type === 'consecutivePairs' && nextCombo.length >= 8) {
    return true
  }

  return false
}

module.exports = {
  SUITS,
  RANKS,
  parseCard,
  sortCards,
  buildDeck,
  shuffleDeck,
  detectCombo,
  canBeat,
}