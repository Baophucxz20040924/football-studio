const path = require('path')
const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })

const { buildDeck, shuffleDeck, sortCards, detectCombo, canBeat, parseCard } = require('./gameLogic')
const User = require('../../models/User')
const mongoose = User.base
const { verifyTienLenToken } = require('../token')

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
  },
})

const PORT = Number(process.env.TIENLEN_PORT || 3001)
const ALLOWED_BET_UNITS = [1, 5, 10, 50, 100, 500]
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/football_bot'
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 0)
const MIN_ENTRY_MULTIPLIER = Number(process.env.TIENLEN_MIN_ENTRY_MULTIPLIER || 15)
const BALANCE_SYNC_INTERVAL_MS = Number(process.env.TIENLEN_BALANCE_SYNC_INTERVAL_MS || 2000)

const rooms = new Map()

// Lưu timer giới hạn lượt cho từng phòng
const turnTimeouts = new Map()

const TURN_TIME_LIMIT_MS = 30000 // 30 giây

function clearTurnTimeout(roomCode) {
  const timeout = turnTimeouts.get(roomCode)
  if (timeout) {
    clearTimeout(timeout)
    turnTimeouts.delete(roomCode)
  }
}

function scheduleTurnTimeout(room) {
  clearTurnTimeout(room.code)
  const game = room.game
  if (!game?.started) return
  const currentPlayer = room.players[game.turnIndex]
  if (!currentPlayer) return
  turnTimeouts.set(room.code, setTimeout(() => {
    // Tự động pass nếu hết giờ
    try {
      if (!room.game?.started) return
      const stillCurrent = room.players[room.game.turnIndex]?.id === currentPlayer.id
      if (stillCurrent) {
        room.infoMessage = `${currentPlayer.name} đã hết 30 giây, tự động bỏ lượt.`
        room.game.passes.add(currentPlayer.id)
        advanceTurnAfterPass(room)
        emitRoomState(room)
        scheduleTurnTimeout(room)
      }
    } catch (e) { console.error('Auto pass error', e) }
  }, TURN_TIME_LIMIT_MS))
}

const findParticipantByUserId = (room, userId) => {
  const activePlayer = room.players.find((participant) => participant.userId === userId)
  if (activePlayer) {
    return { role: 'player', participant: activePlayer }
  }

  const spectator = (room.spectators || []).find((participant) => participant.userId === userId)
  if (spectator) {
    return { role: 'spectator', participant: spectator }
  }

  return null
}

const getMinimumEntryBalance = (betUnit) => Math.max(0, Number(betUnit || 0) * MIN_ENTRY_MULTIPLIER)

const normalizeUserId = (value) => String(value || '').trim().slice(0, 64)

const getTokenFromRequest = (req) => {
  return req.query.token || (req.body && req.body.token) || req.headers['x-tienlen-token']
}

const getOrCreateDbUser = async (userId, userName) => {
  const updates = {
    $set: {
      lastSeen: new Date(),
    },
    $setOnInsert: {
      userId,
      balance: STARTING_BALANCE,
    },
  }

  if (userName) {
    updates.$set.userName = userName
  }

  return User.findOneAndUpdate(
    { userId },
    updates,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  )
}

const applyBalanceDelta = async (userId, delta) => {
  if (!userId || !delta) {
    return
  }

  await User.updateOne(
    { userId },
    {
      $inc: { balance: delta },
      $set: { lastSeen: new Date() },
    },
  )
}

const resolvePlayerByToken = async (token) => {
  const payload = verifyTienLenToken(token)
  if (!payload) {
    return null
  }

  const normalizedUserId = normalizeUserId(payload.userId)
  if (!normalizedUserId) {
    return null
  }

  const preferredName = String(payload.userName || '').trim().slice(0, 24)
  const dbUser = await getOrCreateDbUser(normalizedUserId, preferredName)
  const displayName = (dbUser.userName || preferredName || `User-${normalizedUserId.slice(-4)}`).slice(0, 24)

  return {
    userId: normalizedUserId,
    userName: displayName,
    dbUser,
  }
}

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''

  do {
    code = ''
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
  } while (rooms.has(code))

  return code
}

const nextIndex = (players, currentIndex) => {
  if (players.length === 0) {
    return -1
  }
  return (currentIndex + 1) % players.length
}

const rankPowerOf = (rank) => parseCard(`${rank}S`).rankPower

const findThreeConsecutivePairsCards = (hand) => {
  if (!Array.isArray(hand) || hand.length < 6) {
    return null
  }

  const groups = new Map()
  for (const rawCard of sortCards(hand)) {
    const card = parseCard(rawCard)
    if (!groups.has(card.rankPower)) {
      groups.set(card.rankPower, [])
    }
    groups.get(card.rankPower).push(rawCard)
  }

  const twoRank = rankPowerOf('2')
  let runStart = null
  let runLength = 0

  for (let rank = 0; rank < twoRank; rank += 1) {
    const cards = groups.get(rank) || []
    if (cards.length >= 2) {
      if (runStart === null) {
        runStart = rank
      }
      runLength += 1
      if (runLength >= 3) {
        const chosen = []
        for (let takeRank = rank - 2; takeRank <= rank; takeRank += 1) {
          const pairCards = (groups.get(takeRank) || []).slice(0, 2)
          if (pairCards.length < 2) {
            return null
          }
          chosen.push(...pairCards)
        }
        return sortCards(chosen)
      }
    } else {
      runStart = null
      runLength = 0
    }
  }

  return null
}

const findThreeSpadesHolderId = (room, hands) => {
  return room.players.find((player) => (hands[player.id] || []).includes('3S'))?.id ?? null
}

const findSmallestCardHolderId = (room, hands) => {
  let holderId = null
  let smallestCard = null

  for (const player of room.players) {
    const hand = hands[player.id] || []
    if (hand.length === 0) {
      continue
    }

    const candidateCard = hand[0]
    if (!smallestCard) {
      smallestCard = candidateCard
      holderId = player.id
      continue
    }

    const a = parseCard(candidateCard)
    const b = parseCard(smallestCard)

    if (a.rankPower < b.rankPower || (a.rankPower === b.rankPower && a.suitPower < b.suitPower)) {
      smallestCard = candidateCard
      holderId = player.id
    }
  }

  return holderId
}

const pushMoneyEvent = (room, message) => {
  room.moneyEvents = room.moneyEvents || []
  room.moneyEvents.push(message)
  if (room.moneyEvents.length > 10) {
    room.moneyEvents.shift()
  }
}

const transferMoney = (room, fromId, toId, cardUnits, reason) => {
  if (!cardUnits || cardUnits <= 0 || !fromId || !toId || fromId === toId) {
    return 0
  }

  room.money[fromId] = room.money[fromId] || 0
  room.money[toId] = room.money[toId] || 0

  const amount = cardUnits * room.betUnit
  room.money[fromId] -= amount
  room.money[toId] += amount

  const fromPlayer = room.players.find((p) => p.id === fromId)
  const toPlayer = room.players.find((p) => p.id === toId)
  const fromUserId = fromPlayer?.userId
  const toUserId = toPlayer?.userId

  applyBalanceDelta(fromUserId, -amount).catch((err) => {
    console.error('Failed to decrease balance', { userId: fromUserId, err: err?.message || err })
  })
  applyBalanceDelta(toUserId, amount).catch((err) => {
    console.error('Failed to increase balance', { userId: toUserId, err: err?.message || err })
  })

  const fromName = room.players.find((p) => p.id === fromId)?.name || 'Người chơi'
  const toName = room.players.find((p) => p.id === toId)?.name || 'Người chơi'
  pushMoneyEvent(room, `${reason}: ${fromName} -> ${toName}: ${amount}`)
  return amount
}

const getConsecutivePairRun = (hand) => {
  const counts = {}
  for (const raw of hand) {
    const card = parseCard(raw)
    counts[card.rankPower] = (counts[card.rankPower] || 0) + 1
  }

  const twoRank = rankPowerOf('2')
  let maxRun = 0
  let run = 0

  for (let rank = 0; rank < twoRank; rank += 1) {
    if ((counts[rank] || 0) >= 2) {
      run += 1
      maxRun = Math.max(maxRun, run)
    } else {
      run = 0
    }
  }

  return maxRun
}

const getThoiExtraUnits = (hand) => {
  const parsed = hand.map((card) => parseCard(card))
  const twoRank = rankPowerOf('2')

  let blackTwoCount = 0
  let redTwoCount = 0
  const rankCounts = {}

  for (const card of parsed) {
    rankCounts[card.rankPower] = (rankCounts[card.rankPower] || 0) + 1

    if (card.rankPower === twoRank) {
      if (card.suit === 'S' || card.suit === 'C') {
        blackTwoCount += 1
      } else {
        redTwoCount += 1
      }
    }
  }

  let extra = blackTwoCount * 2 + redTwoCount * 3

  const hasFourOfKind = Object.values(rankCounts).some((count) => count === 4)
  if (hasFourOfKind) {
    extra += 8
  }

  const pairRun = getConsecutivePairRun(hand)
  if (pairRun >= 4) {
    extra += 12
  } else if (pairRun >= 3) {
    extra += 10
  }

  return extra
}

const settleEndGameMoney = (room, winnerId) => {
  const game = room.game
  const winner = room.players.find((player) => player.id === winnerId)
  const roundResult = {
    winnerId,
    winnerName: winner?.name || 'Người thắng',
    transfers: [],
    totalUnits: 0,
    totalAmount: 0,
  }

  for (const player of room.players) {
    if (player.id === winnerId) {
      continue
    }

    const hand = game.hands[player.id] || []
    const isCong = hand.length === 13
    const baseUnits = isCong ? 26 : hand.length
    const extraUnits = getThoiExtraUnits(hand)
    const totalUnits = baseUnits + extraUnits

    const reason = isCong ? 'Cóng' : `${hand.length} lá còn lại`
    const amount = transferMoney(
      room,
      player.id,
      winnerId,
      totalUnits,
      `${reason}${extraUnits > 0 ? ` + thối lá ${extraUnits}` : ''}`,
    )

    if (amount > 0) {
      roundResult.transfers.push({
        fromId: player.id,
        fromName: player.name,
        toId: winnerId,
        toName: roundResult.winnerName,
        units: totalUnits,
        amount,
      })
      roundResult.totalUnits += totalUnits
      roundResult.totalAmount += amount
    }
  }

  settlePendingLeavePenalties(room, winnerId)
  room.lastRoundResult = roundResult
}

const getLeavePenaltyUnits = (hand) => {
  if (!Array.isArray(hand) || hand.length === 0) {
    return 0
  }

  const baseUnits = hand.length
  const extraUnits = getThoiExtraUnits(hand)
  return baseUnits + extraUnits
}

const recordLeavePenalty = (room, player, hand) => {
  if (!room?.game?.started || !player?.userId) {
    return
  }

  const units = getLeavePenaltyUnits(hand)
  if (units <= 0) {
    return
  }

  room.game.pendingLeavePenalties = room.game.pendingLeavePenalties || []
  room.game.pendingLeavePenalties.push({
    userId: player.userId,
    name: player.name,
    units,
    cardCount: hand.length,
    extraUnits: Math.max(0, units - hand.length),
  })

  const amount = units * room.betUnit
  pushMoneyEvent(room, `Rời bàn (phạt chờ xử): ${player.name} -${amount}`)
}

const settlePendingLeavePenalties = (room, winnerId) => {
  const game = room.game
  const penalties = game?.pendingLeavePenalties || []

  if (!winnerId || penalties.length === 0) {
    return
  }

  const winner = room.players.find((player) => player.id === winnerId)
  if (!winner?.userId) {
    return
  }

  room.money[winnerId] = room.money[winnerId] || 0

  for (const penalty of penalties) {
    const amount = penalty.units * room.betUnit
    room.money[winnerId] += amount

    applyBalanceDelta(penalty.userId, -amount).catch((err) => {
      console.error('Failed to apply leave penalty debit', {
        userId: penalty.userId,
        err: err?.message || err,
      })
    })

    applyBalanceDelta(winner.userId, amount).catch((err) => {
      console.error('Failed to apply leave penalty credit', {
        userId: winner.userId,
        err: err?.message || err,
      })
    })

    const baseText = `${penalty.cardCount} lá còn lại`
    const thoiText = penalty.extraUnits > 0 ? ` + thối lá ${penalty.extraUnits} ` : ''
    pushMoneyEvent(room, `Rời bàn phạt (${baseText}${thoiText}): ${penalty.name} -> ${winner.name}: ${amount}`)
  }

  game.pendingLeavePenalties = []
}

const getSingleTwoChopUnits = (combo) => {
  if (!combo || combo.type !== 'single' || combo.rankPower !== rankPowerOf('2')) {
    return 0
  }

  return combo.suitPower <= parseCard('3C').suitPower ? 4 : 8
}

const processImmediateChopMoney = (room, newPlayerId, newCombo, prevTrick) => {
  if (!prevTrick) {
    return
  }

  const game = room.game
  const prevCombo = prevTrick.combo

  if (game.chopState && prevTrick.playerId === game.chopState.lastChopperId && newCombo.type === prevCombo.type) {
    const units = game.chopState.units * 2
    transferMoney(room, game.chopState.lastChopperId, newPlayerId, units, 'Chặt đè')
    game.chopState = {
      units,
      lastChopperId: newPlayerId,
      type: newCombo.type,
    }
    return
  }

  const singleTwoUnits = getSingleTwoChopUnits(prevCombo)
  if (singleTwoUnits > 0 && newCombo.type === 'fourOfKind') {
    transferMoney(room, prevTrick.playerId, newPlayerId, singleTwoUnits, 'Chặt 2')
    game.chopState = {
      units: singleTwoUnits,
      lastChopperId: newPlayerId,
      type: newCombo.type,
    }
    return
  }

  const isPairTwo = prevCombo.type === 'pair' && prevCombo.rankPower === rankPowerOf('2')
  if (isPairTwo && newCombo.type === 'consecutivePairs' && newCombo.length >= 8) {
    const units = 10
    transferMoney(room, prevTrick.playerId, newPlayerId, units, 'Chặt đôi 2 bằng 4 đôi thông')
    game.chopState = {
      units,
      lastChopperId: newPlayerId,
      type: newCombo.type,
    }
  }
}

const buildStateForPlayer = (room, playerId) => {
  const game = room.game
  const myHand = game?.hands?.[playerId] ?? []
  const isSpectator = !room.players.some((player) => player.id === playerId)
  const canRobStarter =
    !!game?.started &&
    !game?.currentTrick &&
    !!game?.starterRobbery &&
    !game.starterRobbery.resolved &&
    game.starterRobbery.eligibleIds.has(playerId) &&
    !game.starterRobbery.declinedIds.has(playerId)

  return {
    roomCode: room.code,
    ownerId: room.ownerId,
    betUnit: room.betUnit,
    moneyEvents: room.moneyEvents ?? [],
    players: room.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      cardCount: game?.hands?.[player.id]?.length ?? 0,
      isTurn: game ? game.turnIndex === index : false,
      money: room.money?.[player.id] ?? 0,
    })),
    spectators: (room.spectators || []).map((spectator) => ({
      id: spectator.id,
      name: spectator.name,
    })),
    game: game
      ? {
          started: game.started,
          turnPlayerId: room.players[game.turnIndex]?.id ?? null,
          currentTrick: game.currentTrick,
          winnerId: game.winnerId,
          roundResult: !game.started ? room.lastRoundResult ?? null : null,
          firstTurnPending: game.firstTurnPending,
          canRobStarter,
          myHand,
          isSpectator,
          canStart: room.ownerId === playerId && room.players.length >= 2,
        }
      : {
          started: false,
          turnPlayerId: null,
          currentTrick: null,
          winnerId: null,
          roundResult: null,
          firstTurnPending: false,
          canRobStarter: false,
          myHand: [],
          isSpectator,
          canStart: room.ownerId === playerId && room.players.length >= 2,
        },
    infoMessage: room.infoMessage ?? '',
  }
}

const emitRoomStateSnapshot = (room) => {
  for (const player of room.players) {
    io.to(player.id).emit('roomState', buildStateForPlayer(room, player.id))
  }

  for (const spectator of room.spectators || []) {
    io.to(spectator.id).emit('roomState', buildStateForPlayer(room, spectator.id))
  }
}

const syncRoomBalancesFromDb = async (room, { force = false } = {}) => {
  const now = Date.now()
  const lastSyncAt = Number(room.lastBalanceSyncAt || 0)
  if (!force && now - lastSyncAt < BALANCE_SYNC_INTERVAL_MS) {
    return false
  }

  if (room.balanceSyncPromise) {
    return room.balanceSyncPromise
  }

  room.balanceSyncPromise = (async () => {
    const participants = [...room.players, ...(room.spectators || [])].filter(
      (participant) => participant?.id && participant?.userId,
    )

    if (participants.length === 0) {
      room.lastBalanceSyncAt = Date.now()
      return false
    }

    const userIds = [...new Set(participants.map((participant) => participant.userId))]
    const users = await User.find({ userId: { $in: userIds } }, { userId: 1, balance: 1 }).lean()
    const balanceByUserId = new Map(users.map((user) => [String(user.userId), Number(user.balance || 0)]))

    let changed = false
    for (const participant of participants) {
      const dbBalance = Number(balanceByUserId.get(String(participant.userId)) || 0)
      const currentBalance = Number(room.money?.[participant.id] ?? 0)
      if (dbBalance !== currentBalance) {
        room.money[participant.id] = dbBalance
        changed = true
      }
    }

    room.lastBalanceSyncAt = Date.now()
    return changed
  })()

  try {
    return await room.balanceSyncPromise
  } catch (error) {
    console.error('Failed to sync room balances', {
      roomCode: room.code,
      message: error?.message || String(error),
    })
    return false
  } finally {
    room.balanceSyncPromise = null
  }
}

const emitRoomState = (room) => {
  emitRoomStateSnapshot(room)

  syncRoomBalancesFromDb(room)
    .then((changed) => {
      if (changed) {
        emitRoomStateSnapshot(room)
      }
    })
    .catch(() => {})
}

const emitError = (socket, message) => {
  socket.emit('errorMessage', message)
}

const promoteWaitingSpectators = (room) => {
  room.spectators = room.spectators || []
  const promoted = []

  while (room.players.length < 4 && room.spectators.length > 0) {
    const nextSpectator = room.spectators.shift()
    room.players.push(nextSpectator)
    promoted.push(nextSpectator.name)

    if (!Object.prototype.hasOwnProperty.call(room.money, nextSpectator.id)) {
      room.money[nextSpectator.id] = 0
    }
  }

  return promoted
}

const enforceMinimumBalanceForRoom = (room) => {
  const minBalance = getMinimumEntryBalance(room.betUnit)
  room.spectators = room.spectators || []

  const eligiblePlayers = []
  const movedPlayers = []

  for (const player of room.players) {
    const balance = Number(room.money?.[player.id] ?? 0)
    if (balance < minBalance) {
      room.spectators.push(player)
      movedPlayers.push(player)
      continue
    }
    eligiblePlayers.push(player)
  }

  room.players = eligiblePlayers

  if (!room.players.some((player) => player.id === room.ownerId)) {
    room.ownerId = room.players[0]?.id ?? null
  }

  return {
    minBalance,
    movedPlayers,
  }
}

const clearAutoStartTimer = (room) => {
  if (room.autoStartInterval) {
    clearInterval(room.autoStartInterval)
    room.autoStartInterval = null
  }
}

const scheduleAutoStartNextRound = (room) => {
  clearAutoStartTimer(room)

  if (room.players.length < 2) {
    room.infoMessage = 'Chưa đủ người chơi để tự động bắt đầu ván mới.'
    return
  }

  let secondsLeft = 15
  room.infoMessage = `Ván mới sẽ tự bắt đầu sau ${secondsLeft}s.`
  emitRoomState(room)

  room.autoStartInterval = setInterval(async () => {
    if (room.players.length < 2) {
      clearAutoStartTimer(room)
      room.infoMessage = 'Đã hủy tự động bắt đầu vì không đủ người.'
      emitRoomState(room)
      return
    }

    if (room.game?.started) {
      clearAutoStartTimer(room)
      return
    }

    secondsLeft -= 1

    if (secondsLeft > 0) {
      room.infoMessage = `Ván mới sẽ tự bắt đầu sau ${secondsLeft}s.`
      emitRoomState(room)
      return
    }

    clearAutoStartTimer(room)

    await syncRoomBalancesFromDb(room, { force: true })

    const { minBalance, movedPlayers } = enforceMinimumBalanceForRoom(room)
    if (movedPlayers.length > 0 && room.players.length < 2) {
      room.infoMessage = `${movedPlayers.map((player) => player.name).join(', ')} không đủ ${minBalance} điểm để tiếp tục. Cần ít nhất 2 người đủ điểm để tự động bắt đầu.`
      emitRoomState(room)
      return
    }

    const preRoundNotice =
      movedPlayers.length > 0
        ? `${movedPlayers.map((player) => player.name).join(', ')} không đủ ${minBalance} điểm nên được chuyển sang khán giả.`
        : ''

    setupGame(room, preRoundNotice)
    emitRoomState(room)
  }, 1000)
}

const setupGame = (room, preRoundNotice = '') => {
  const deck = shuffleDeck(buildDeck())
  const playerCount = room.players.length
  const hands = {}

  for (let i = 0; i < playerCount; i += 1) {
    const player = room.players[i]
    const hand = deck.slice(i * 13, i * 13 + 13)
    hands[player.id] = sortCards(hand)
  }

  const threeSpadesHolderId = findThreeSpadesHolderId(room, hands)

  let starterId = null
  if (room.previousWinnerId && hands[room.previousWinnerId]) {
    starterId = room.previousWinnerId
  } else {
    starterId = threeSpadesHolderId ?? findSmallestCardHolderId(room, hands) ?? room.players[0].id
  }

  room.game = {
    started: true,
    hands,
    turnIndex: room.players.findIndex((player) => player.id === starterId),
    currentTrick: null,
    passes: new Set(),
    winnerId: null,
    firstTurnPending: !room.previousWinnerId && !!threeSpadesHolderId,
    chopState: null,
    pendingLeavePenalties: [],
    starterRobbery: {
      eligibleIds: new Set(
        room.players
          .filter((player) => player.id !== starterId)
          .filter((player) => !!findThreeConsecutivePairsCards(hands[player.id] || []))
          .map((player) => player.id),
      ),
      declinedIds: new Set(),
      resolved: false,
    },
  }

  room.lastRoundResult = null

  const roundInfo = room.previousWinnerId
    ? `${room.players.find((player) => player.id === starterId)?.name || 'Người thắng'} đi trước ván mới.`
    : threeSpadesHolderId
      ? `Ván đầu: ai có 3♠ đi trước.`
      : `Không xác định được người giữ 3♠, người có lá nhỏ nhất đi trước.`

  room.infoMessage = preRoundNotice ? `${preRoundNotice} ${roundInfo}` : roundInfo
}

const hasCardsInHand = (hand, selectedCards) => {
  const handCounter = hand.reduce((acc, card) => {
    acc[card] = (acc[card] || 0) + 1
    return acc
  }, {})

  for (const card of selectedCards) {
    if (!handCounter[card]) {
      return false
    }
    handCounter[card] -= 1
  }

  return true
}

const removeCardsFromHand = (hand, selectedCards) => {
  const selectedSet = [...selectedCards]
  const nextHand = [...hand]
  for (const card of selectedSet) {
    const idx = nextHand.indexOf(card)
    if (idx >= 0) {
      nextHand.splice(idx, 1)
    }
  }
  return sortCards(nextHand)
}

const getSmallestCardInHand = (hand) => {
  const sorted = sortCards(hand)
  return sorted[0] || null
}

const advanceTurnAfterPlay = (room) => {
  const game = room.game
  let idx = game.turnIndex

  while (true) {
    idx = nextIndex(room.players, idx)
    const candidateId = room.players[idx]?.id
    if (!candidateId) {
      continue
    }
    if (candidateId === game.currentTrick?.playerId && room.players.length > 1) {
      continue
    }
    if (game.passes.has(candidateId)) {
      continue
    }
    game.turnIndex = idx
    break
  }
  scheduleTurnTimeout(room)
}

const advanceTurnAfterPass = (room) => {
  const game = room.game
  const totalPlayers = room.players.length

  if (game.passes.size >= totalPlayers - 1) {
    const currentWinnerId = game.currentTrick.playerId
    game.turnIndex = room.players.findIndex((player) => player.id === currentWinnerId)
    game.currentTrick = null
    game.passes = new Set()
    game.chopState = null
    room.infoMessage = 'Tất cả bỏ lượt. Người đánh cuối ra bài mới.'
    scheduleTurnTimeout(room)
    return
  }

  let idx = game.turnIndex
  while (true) {
    idx = nextIndex(room.players, idx)
    const candidateId = room.players[idx].id
    if (candidateId === game.currentTrick.playerId) {
      continue
    }
    if (!game.passes.has(candidateId)) {
      game.turnIndex = idx
      break
    }
  }
  scheduleTurnTimeout(room)
}

const normalizeTurnIndexAfterPlayerLeave = (room, removedPlayerId, removedIndex) => {
  const game = room.game
  if (!game || room.players.length === 0) {
    return
  }

  if (removedIndex < game.turnIndex) {
    game.turnIndex -= 1
  } else if (removedIndex === game.turnIndex) {
    if (game.turnIndex >= room.players.length) {
      game.turnIndex = 0
    }
  }

  if (game.turnIndex >= room.players.length) {
    game.turnIndex = 0
  }
}

const handleParticipantExit = (room, participantId, reasonText) => {
  const game = room.game
  const leavingPlayer = room.players.find((player) => player.id === participantId)
  const leavingPlayerIndex = room.players.findIndex((player) => player.id === participantId)

  if (leavingPlayer && game?.started) {
    const leavingHand = game.hands?.[participantId] || []
    recordLeavePenalty(room, leavingPlayer, leavingHand)

    delete game.hands[participantId]
    game.passes = new Set([...game.passes].filter((id) => id !== participantId))

    if (game.currentTrick?.playerId === participantId) {
      game.currentTrick = null
      game.passes = new Set()
      game.chopState = null
      room.infoMessage = `${leavingPlayer.name} đã rời bàn, lượt mới được mở lại.`
    }
  }

  room.players = room.players.filter((player) => player.id !== participantId)
  room.spectators = (room.spectators || []).filter((spectator) => spectator.id !== participantId)

  if (leavingPlayer && game?.started) {
    normalizeTurnIndexAfterPlayerLeave(room, participantId, leavingPlayerIndex)
  }

  if (room.players.length === 0) {
    clearAutoStartTimer(room)
    return { shouldDeleteRoom: true }
  }

  if (room.ownerId === participantId) {
    room.ownerId = room.players[0].id
  }

  if (game?.started && room.players.length === 1) {
    const winnerId = room.players[0].id
    game.started = false
    game.winnerId = winnerId
    room.previousWinnerId = winnerId
    settlePendingLeavePenalties(room, winnerId)
    const promotedNames = promoteWaitingSpectators(room)
    room.infoMessage = `${room.players[0].name} thắng ván do các người chơi khác rời bàn.`
    if (promotedNames.length > 0) {
      room.infoMessage += ` ${promotedNames.join(', ')} sẽ vào vai người chơi ở ván kế tiếp.`
    }
    emitRoomState(room)
    scheduleAutoStartNextRound(room)
    return { shouldDeleteRoom: false, emitted: true }
  }

  if (room.players.length < 2) {
    clearAutoStartTimer(room)
    room.game = null
    room.infoMessage = reasonText
    return { shouldDeleteRoom: false }
  }

  if (leavingPlayer) {
    room.infoMessage = `${leavingPlayer.name} đã rời phòng.`
  }

  return { shouldDeleteRoom: false }
}

io.on('connection', (socket) => {
  socket.on('createRoom', async ({ betUnit, token }) => {
    let player
    try {
      player = await resolvePlayerByToken(token)
    } catch (error) {
      emitError(socket, 'Không thể xác thực người chơi. Vui lòng thử lại.')
      return
    }
    if (!player) {
      emitError(socket, 'Phiên đăng nhập không hợp lệ. Hãy mở lại game từ lệnh bot /tienlen.')
      return
    }

    const parsedBet = Number(betUnit)
    if (!ALLOWED_BET_UNITS.includes(parsedBet)) {
      emitError(socket, 'Mức cược không hợp lệ. Chọn 1, 5, 10, 50, 100 hoặc 500.')
      return
    }

    let dbUser
    try {
      dbUser = player.dbUser
    } catch (err) {
      emitError(socket, 'Không thể kết nối dữ liệu người chơi. Vui lòng thử lại.')
      console.error('Create room db error', err)
      return
    }

    const minBalance = getMinimumEntryBalance(parsedBet)
    if (dbUser.balance < minBalance) {
      emitError(socket, `Không đủ điểm vào bàn. Cần tối thiểu ${minBalance} điểm cho mức cược ${parsedBet}.`)
      return
    }

    const code = generateRoomCode()
    const room = {
      code,
      ownerId: socket.id,
      players: [{ id: socket.id, userId: player.userId, name: player.userName }],
      spectators: [],
      betUnit: parsedBet,
      money: { [socket.id]: dbUser.balance || 0 },
      moneyEvents: [`Mức cược phòng: ${parsedBet}/lá`],
      game: null,
      lastRoundResult: null,
      previousWinnerId: null,
      infoMessage: 'Tạo phòng thành công.',
      lastBalanceSyncAt: Date.now(),
      balanceSyncPromise: null,
    }

    rooms.set(code, room)
    socket.join(code)
    socket.emit('joinedRoom', { roomCode: code, playerId: socket.id })
    emitRoomState(room)
  })

  socket.on('joinRoom', async ({ roomCode, token }) => {
    const normalizedCode = (roomCode || '').trim().toUpperCase()
    let player
    try {
      player = await resolvePlayerByToken(token)
    } catch (error) {
      emitError(socket, 'Không thể xác thực người chơi. Vui lòng thử lại.')
      return
    }
    if (!player) {
      emitError(socket, 'Phiên đăng nhập không hợp lệ. Hãy mở lại game từ lệnh bot /tienlen.')
      return
    }

    const room = rooms.get(normalizedCode)
    if (!room) {
      emitError(socket, 'Không tìm thấy phòng.')
      return
    }

    const existingParticipant = findParticipantByUserId(room, player.userId)
    if (existingParticipant) {
      emitError(socket, 'Tài khoản này đã có trong phòng.')
      return
    }

    let dbUser
    try {
      dbUser = player.dbUser
    } catch (err) {
      emitError(socket, 'Không thể kết nối dữ liệu người chơi. Vui lòng thử lại.')
      console.error('Join room db error', err)
      return
    }

    const minBalance = getMinimumEntryBalance(room.betUnit)
    if (dbUser.balance < minBalance) {
      emitError(socket, `Không đủ điểm vào bàn. Cần tối thiểu ${minBalance} điểm cho mức cược ${room.betUnit}.`)
      return
    }

    room.money[socket.id] = room.money[socket.id] || dbUser.balance || 0

    if (room.game?.started) {
      room.spectators = room.spectators || []
      room.spectators.push({ id: socket.id, userId: player.userId, name: player.userName })
      room.infoMessage = `${player.userName} đang xem ván hiện tại.`
    } else {
      if (room.players.length >= 4) {
        emitError(socket, 'Phòng đã đủ 4 người chơi.')
        return
      }

      room.players.push({ id: socket.id, userId: player.userId, name: player.userName })
      room.infoMessage = `${player.userName} đã vào phòng.`
    }

    socket.join(normalizedCode)
    socket.emit('joinedRoom', { roomCode: normalizedCode, playerId: socket.id })
    emitRoomState(room)
  })

  socket.on('startGame', async ({ roomCode }) => {
    const room = rooms.get((roomCode || '').trim().toUpperCase())
    if (!room) {
      emitError(socket, 'Phòng không tồn tại.')
      return
    }

    if (room.ownerId !== socket.id) {
      emitError(socket, 'Chỉ chủ phòng mới được bắt đầu.')
      return
    }

    await syncRoomBalancesFromDb(room, { force: true })

    const { minBalance, movedPlayers } = enforceMinimumBalanceForRoom(room)
    if (room.players.length < 2) {
      if (movedPlayers.length > 0) {
        room.infoMessage = `${movedPlayers.map((player) => player.name).join(', ')} không đủ ${minBalance} điểm nên chuyển sang khán giả.`
      }
      emitError(socket, `Cần ít nhất 2 người có tối thiểu ${minBalance} điểm để bắt đầu.`)
      emitRoomState(room)
      return
    }

    clearAutoStartTimer(room)

    const preRoundNotice =
      movedPlayers.length > 0
        ? `${movedPlayers.map((player) => player.name).join(', ')} không đủ ${minBalance} điểm nên được chuyển sang khán giả.`
        : ''

    setupGame(room, preRoundNotice)
    emitRoomState(room)
    scheduleTurnTimeout(room)
  })

  socket.on('playCards', ({ roomCode, cards }) => {
    clearTurnTimeout(roomCode)
    const room = rooms.get((roomCode || '').trim().toUpperCase())
    if (!room || !room.game?.started) {
      emitError(socket, 'Ván chơi chưa sẵn sàng.')
      return
    }

    const game = room.game
    const currentPlayer = room.players[game.turnIndex]
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      emitError(socket, 'Chưa tới lượt của bạn.')
      return
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      emitError(socket, 'Bạn chưa chọn lá nào.')
      return
    }

    const hand = game.hands[socket.id] || []
    if (!hasCardsInHand(hand, cards)) {
      emitError(socket, 'Bạn không có đủ các lá đã chọn.')
      return
    }

    if (game.currentTrick && game.passes.has(socket.id)) {
      emitError(socket, 'Bạn đã bỏ lượt trong vòng này, chờ vòng mới để đánh tiếp.')
      return
    }

    if (game.firstTurnPending && !hand.includes('3S')) {
      game.firstTurnPending = false
      room.infoMessage = 'Bỏ ràng buộc 3♠ để tránh kẹt lượt đầu.'
    }

    const combo = detectCombo(cards)
    if (!combo) {
      emitError(socket, 'Bộ bài không hợp lệ theo luật Tiến Lên Miền Bắc.')
      return
    }

    if (game.firstTurnPending) {
      const smallestCard = getSmallestCardInHand(hand)
      if (smallestCard && !cards.includes(smallestCard)) {
        emitError(socket, `Lượt đầu tiên phải đánh lá nhỏ nhất: ${smallestCard}.`)
        return
      }
    }

    if (!canBeat(game.currentTrick?.combo, combo)) {
      emitError(socket, 'Bài của bạn chưa chặn được bài hiện tại.')
      return
    }

    const prevTrickSnapshot = game.currentTrick
    processImmediateChopMoney(room, socket.id, combo, prevTrickSnapshot)

    game.hands[socket.id] = removeCardsFromHand(hand, cards)
    game.currentTrick = {
      playerId: socket.id,
      cards: sortCards(cards),
      combo,
    }
    game.passes = new Set([...game.passes].filter((id) => id !== socket.id))
    game.firstTurnPending = false
    if (game.starterRobbery && !game.starterRobbery.resolved) {
      game.starterRobbery.resolved = true
    }

    if (game.hands[socket.id].length === 0) {
      game.started = false
      game.winnerId = socket.id
      room.previousWinnerId = socket.id
      settleEndGameMoney(room, socket.id)
      const promotedNames = promoteWaitingSpectators(room)
      room.infoMessage = `${currentPlayer.name} đã thắng ván này!`
      if (promotedNames.length > 0) {
        room.infoMessage += ` ${promotedNames.join(', ')} sẽ vào vai người chơi ở ván kế tiếp.`
      }
      emitRoomState(room)
      scheduleAutoStartNextRound(room)
      return
    }

    room.infoMessage = `${currentPlayer.name} đã đánh ${cards.length} lá.`
    advanceTurnAfterPlay(room)
    emitRoomState(room)
  })

  socket.on('starterDecision', ({ roomCode, action }) => {
    const room = rooms.get((roomCode || '').trim().toUpperCase())
    if (!room || !room.game?.started) {
      emitError(socket, 'Ván chơi chưa sẵn sàng.')
      return
    }

    const game = room.game
    const robbery = game.starterRobbery
    if (!robbery || robbery.resolved) {
      emitError(socket, 'Không còn quyền cướp cái ở thời điểm này.')
      return
    }

    if (game.currentTrick) {
      robbery.resolved = true
      emitError(socket, 'Vòng đánh đã bắt đầu, không thể cướp cái.')
      emitRoomState(room)
      return
    }

    if (!robbery.eligibleIds.has(socket.id) || robbery.declinedIds.has(socket.id)) {
      emitError(socket, 'Bạn không có quyền cướp cái.')
      return
    }

    if (action !== 'claim' && action !== 'skip') {
      emitError(socket, 'Lựa chọn cướp cái không hợp lệ.')
      return
    }

    const currentPlayer = room.players.find((player) => player.id === socket.id)
    if (!currentPlayer) {
      emitError(socket, 'Không tìm thấy người chơi trong phòng.')
      return
    }

    if (action === 'skip') {
      robbery.declinedIds.add(socket.id)
      const unresolved = [...robbery.eligibleIds].filter((id) => !robbery.declinedIds.has(id))
      if (unresolved.length === 0) {
        robbery.resolved = true
      }
      room.infoMessage = `${currentPlayer.name} chọn không cướp cái.`
      emitRoomState(room)
      return
    }

    const hand = game.hands[socket.id] || []
    const robCards = findThreeConsecutivePairsCards(hand)
    const combo = detectCombo(robCards || [])
    if (!robCards || !combo || combo.type !== 'consecutivePairs' || combo.length !== 6) {
      robbery.declinedIds.add(socket.id)
      const unresolved = [...robbery.eligibleIds].filter((id) => !robbery.declinedIds.has(id))
      if (unresolved.length === 0) {
        robbery.resolved = true
      }
      emitError(socket, 'Không còn đủ 3 đôi thông để cướp cái.')
      emitRoomState(room)
      return
    }

    game.turnIndex = room.players.findIndex((player) => player.id === socket.id)
    game.hands[socket.id] = removeCardsFromHand(hand, robCards)
    game.currentTrick = {
      playerId: socket.id,
      cards: robCards,
      combo,
    }
    game.passes = new Set()
    game.firstTurnPending = false
    robbery.resolved = true
    room.infoMessage = `${currentPlayer.name} cướp cái bằng 3 đôi thông.`

    if (game.hands[socket.id].length === 0) {
      game.started = false
      game.winnerId = socket.id
      room.previousWinnerId = socket.id
      settleEndGameMoney(room, socket.id)
      const promotedNames = promoteWaitingSpectators(room)
      room.infoMessage = `${currentPlayer.name} đã thắng ván này!`
      if (promotedNames.length > 0) {
        room.infoMessage += ` ${promotedNames.join(', ')} sẽ vào vai người chơi ở ván kế tiếp.`
      }
      emitRoomState(room)
      scheduleAutoStartNextRound(room)
      return
    }

    advanceTurnAfterPlay(room)
    emitRoomState(room)
  })

  socket.on('passTurn', ({ roomCode }) => {
    clearTurnTimeout(roomCode)
    const room = rooms.get((roomCode || '').trim().toUpperCase())
    if (!room || !room.game?.started) {
      emitError(socket, 'Ván chơi chưa sẵn sàng.')
      return
    }

    const game = room.game
    const currentPlayer = room.players[game.turnIndex]

    if (!currentPlayer || currentPlayer.id !== socket.id) {
      emitError(socket, 'Chưa tới lượt của bạn.')
      return
    }

    if (!game.currentTrick) {
      emitError(socket, 'Bạn đang mở lượt, không thể bỏ.')
      return
    }

    if (game.currentTrick.playerId === socket.id) {
      emitError(socket, 'Bạn đang giữ bài hiện tại nên không thể bỏ lượt.')
      return
    }

    game.passes.add(socket.id)
    room.infoMessage = `${currentPlayer.name} bỏ lượt.`
    advanceTurnAfterPass(room)
    emitRoomState(room)
  })

  socket.on('leaveRoom', ({ roomCode }) => {
    clearTurnTimeout(roomCode)
    const code = (roomCode || '').trim().toUpperCase()
    const room = rooms.get(code)
    if (!room) {
      return
    }

    const result = handleParticipantExit(room, socket.id, 'Chưa đủ người chơi để tiếp tục.')
    if (result.shouldDeleteRoom) {
      rooms.delete(code)
      return
    }

    if (result.emitted) {
      return
    }

    emitRoomState(room)
  })

  socket.on('disconnect', () => {
    clearTurnTimeout(socket.id)
    for (const [code, room] of rooms.entries()) {
      const existed = room.players.some((player) => player.id === socket.id)
      const spectatorExisted = (room.spectators || []).some((spectator) => spectator.id === socket.id)
      if (!existed && !spectatorExisted) {
        continue
      }

      const result = handleParticipantExit(room, socket.id, 'Một người vừa rời phòng. Cần tối thiểu 2 người.')
      if (result.shouldDeleteRoom) {
        rooms.delete(code)
        continue
      }

      if (!result.emitted) {
        emitRoomState(room)
      }
    }
  })
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/session', async (req, res) => {
  const token = getTokenFromRequest(req)
  let player
  try {
    player = await resolvePlayerByToken(token)
  } catch (error) {
    console.error('Failed to resolve Tien Len session', {
      message: error?.message || String(error),
      stack: error?.stack,
    })
    return res.status(500).json({ error: 'Failed to load session' })
  }
  if (!player) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  return res.json({
    userId: player.userId,
    userName: player.userName,
    balance: player.dbUser.balance,
  })
})

const startServer = async () => {
  await mongoose.connect(MONGODB_URI)
  server.listen(PORT, () => {
    console.log(`Tien Len server running at http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start Tien Len server', error)
  process.exit(1)
})
