const path = require('path')
const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')
const mongoose = require('mongoose')

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })

const { buildDeck, shuffleDeck, sortCards, detectCombo, canBeat, parseCard } = require('./gameLogic')
const User = require('../../models/User')
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

const rooms = new Map()

const getMinimumEntryBalance = (betUnit) => Math.max(0, Number(betUnit || 0) * MIN_ENTRY_MULTIPLIER)

const normalizeUserId = (value) => String(value || '').trim().slice(0, 64)

const getTokenFromRequest = (req) => {
  return req.query.token || (req.body && req.body.token) || req.headers['x-tienlen-token']
}

const getOrCreateDbUser = async (userId, userName) => {
  let user = await User.findOne({ userId })
  if (!user) {
    user = await User.create({
      userId,
      userName: userName || '',
      balance: STARTING_BALANCE,
      lastSeen: new Date(),
    })
    return user
  }

  let changed = false
  if (userName && user.userName !== userName) {
    user.userName = userName
    changed = true
  }
  user.lastSeen = new Date()
  changed = true

  if (changed) {
    await user.save()
  }
  return user
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

  for (const player of room.players) {
    if (player.id === winnerId) {
      continue
    }

    const hand = game.hands[player.id] || []
    const isCong = hand.length === 13
    const baseUnits = isCong ? 26 : hand.length
    const extraUnits = getThoiExtraUnits(hand)
    const totalUnits = baseUnits + extraUnits

    const reason = isCong ? 'Cóng' : `${hand.length} lá còn`
    transferMoney(room, player.id, winnerId, totalUnits, `${reason}${extraUnits > 0 ? ` + thối ${extraUnits} lá` : ''}`)
  }
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
    game: game
      ? {
          started: game.started,
          turnPlayerId: room.players[game.turnIndex]?.id ?? null,
          currentTrick: game.currentTrick,
          winnerId: game.winnerId,
          firstTurnPending: game.firstTurnPending,
          myHand,
          canStart: room.ownerId === playerId && room.players.length >= 2,
        }
      : {
          started: false,
          turnPlayerId: null,
          currentTrick: null,
          winnerId: null,
          firstTurnPending: false,
          myHand: [],
          canStart: room.ownerId === playerId && room.players.length >= 2,
        },
    infoMessage: room.infoMessage ?? '',
  }
}

const emitRoomState = (room) => {
  for (const player of room.players) {
    io.to(player.id).emit('roomState', buildStateForPlayer(room, player.id))
  }
}

const emitError = (socket, message) => {
  socket.emit('errorMessage', message)
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

  room.autoStartInterval = setInterval(() => {
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
    setupGame(room)
    emitRoomState(room)
  }, 1000)
}

const setupGame = (room) => {
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
  }

  room.infoMessage = room.previousWinnerId
    ? `${room.players.find((player) => player.id === starterId)?.name || 'Người thắng'} đi trước ván mới.`
    : threeSpadesHolderId
      ? `Ván đầu: ai có 3♠ đi trước.`
      : `Không xác định được người giữ 3♠, người có lá nhỏ nhất đi trước.`
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

  do {
    idx = nextIndex(room.players, idx)
  } while (room.players[idx]?.id === game.currentTrick?.playerId && room.players.length > 1)

  game.turnIndex = idx
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
      return
    }
  }
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
      betUnit: parsedBet,
      money: { [socket.id]: dbUser.balance || 0 },
      moneyEvents: [`Mức cược phòng: ${parsedBet}/lá`],
      game: null,
      previousWinnerId: null,
      infoMessage: 'Tạo phòng thành công.',
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

    if (room.players.length >= 4) {
      emitError(socket, 'Phòng đã đủ 4 người chơi.')
      return
    }

    if (room.game?.started) {
      emitError(socket, 'Ván đã bắt đầu, không thể vào thêm.')
      return
    }

    if (room.players.some((existingPlayer) => existingPlayer.userId === player.userId)) {
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

    room.players.push({ id: socket.id, userId: player.userId, name: player.userName })
    room.money[socket.id] = room.money[socket.id] || dbUser.balance || 0
    room.infoMessage = `${player.userName} đã vào phòng.`
    socket.join(normalizedCode)
    socket.emit('joinedRoom', { roomCode: normalizedCode, playerId: socket.id })
    emitRoomState(room)
  })

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms.get((roomCode || '').trim().toUpperCase())
    if (!room) {
      emitError(socket, 'Phòng không tồn tại.')
      return
    }

    if (room.ownerId !== socket.id) {
      emitError(socket, 'Chỉ chủ phòng mới được bắt đầu.')
      return
    }

    if (room.players.length < 2) {
      emitError(socket, 'Cần ít nhất 2 người để bắt đầu.')
      return
    }

    clearAutoStartTimer(room)

    setupGame(room)
    emitRoomState(room)
  })

  socket.on('playCards', ({ roomCode, cards }) => {
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
    game.passes = new Set()
    game.firstTurnPending = false

    if (game.hands[socket.id].length === 0) {
      game.started = false
      game.winnerId = socket.id
      room.previousWinnerId = socket.id
      settleEndGameMoney(room, socket.id)
      room.infoMessage = `${currentPlayer.name} đã thắng ván này!`
      emitRoomState(room)
      scheduleAutoStartNextRound(room)
      return
    }

    room.infoMessage = `${currentPlayer.name} đã đánh ${cards.length} lá.`
    advanceTurnAfterPlay(room)
    emitRoomState(room)
  })

  socket.on('passTurn', ({ roomCode }) => {
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
    const code = (roomCode || '').trim().toUpperCase()
    const room = rooms.get(code)
    if (!room) {
      return
    }

    room.players = room.players.filter((player) => player.id !== socket.id)

    if (room.ownerId === socket.id && room.players.length > 0) {
      room.ownerId = room.players[0].id
    }

    if (room.players.length < 2) {
      clearAutoStartTimer(room)
      room.game = null
      room.infoMessage = 'Chưa đủ người chơi để tiếp tục.'
    }

    if (room.players.length === 0) {
      clearAutoStartTimer(room)
      rooms.delete(code)
      return
    }

    emitRoomState(room)
  })

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      const existed = room.players.some((player) => player.id === socket.id)
      if (!existed) {
        continue
      }

      room.players = room.players.filter((player) => player.id !== socket.id)

      if (room.players.length === 0) {
        clearAutoStartTimer(room)
        rooms.delete(code)
        continue
      }

      if (room.ownerId === socket.id) {
        room.ownerId = room.players[0].id
      }

      if (room.players.length < 2) {
        clearAutoStartTimer(room)
        room.game = null
        room.infoMessage = 'Một người vừa rời phòng. Cần tối thiểu 2 người.'
      }

      emitRoomState(room)
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
