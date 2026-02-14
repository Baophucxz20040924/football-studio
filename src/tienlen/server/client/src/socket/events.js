import { io } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3001'

const suitBase = { S: 0, H: 13, D: 26, C: 39 }
const rankToOffset = { A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9, J: 10, Q: 11, K: 12 }

const cardCodeToFrame = (cardCode) => {
  const suit = cardCode.at(-1)
  const rank = cardCode.slice(0, -1)
  return (suitBase[suit] ?? 0) + (rankToOffset[rank] ?? 0)
}

class SocketEvents {
  constructor() {
    this.socket = io(SERVER_URL)
    this.listeners = new Map()
    this.roomId = ''
    this.token = ''
    this.mySocketId = ''
    this.lastSeatPlayers = {}
    this.started = false
    this.bind()
  }

  setToken(token) {
    this.token = String(token || '')
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(handler)
  }

  emitLocal(event, payload) {
    ;(this.listeners.get(event) || []).forEach((handler) => handler(payload))
  }

  bind() {
    this.socket.on('connect', () => {
      this.mySocketId = this.socket.id
    })

    const contractEvents = [
      'joined',
      'player_joined',
      'player_left',
      'game_start',
      'deal',
      'play_success',
      'play_error',
      'player_pass',
      'round_reset',
      'player_out',
      'game_over',
      'sync_state',
    ]

    contractEvents.forEach((eventName) => {
      this.socket.on(eventName, (payload) => this.emitLocal(eventName, payload))
    })

    this.socket.on('errorMessage', (payload) => {
      this.emitLocal('play_error', { message: payload })
    })

    this.socket.on('joinedRoom', ({ roomCode }) => {
      this.roomId = roomCode
      this.emitLocal('joined', { roomId: roomCode })
    })

    this.socket.on('roomState', (state) => {
      this.roomId = state.roomCode
      const seats = {}
      state.players.forEach((player, idx) => {
        seats[idx] = {
          seat: idx,
          id: player.id,
          name: player.name,
          cardCount: player.cardCount,
          money: player.money ?? 0,
        }
      })

      Object.keys(seats).forEach((seat) => {
        const prev = this.lastSeatPlayers[seat]
        const next = seats[seat]
        if (!prev || prev.id !== next.id) {
          this.emitLocal('player_joined', { seat: Number(seat), name: next.name })
        }
      })

      Object.keys(this.lastSeatPlayers).forEach((seat) => {
        if (!seats[seat]) {
          this.emitLocal('player_left', { seat: Number(seat) })
        }
      })

      this.lastSeatPlayers = seats

      const mySeat = state.players.findIndex((player) => player.id === this.mySocketId)
      const myCards = (state.game?.myHand || []).map((cardCode) => ({ id: cardCode, frame: cardCodeToFrame(cardCode) }))

      const tableCards = (state.game?.currentTrick?.cards || []).map((cardCode) => ({
        id: cardCode,
        frame: cardCodeToFrame(cardCode),
      }))

      const syncPayload = {
        roomId: state.roomCode,
        betUnit: state.betUnit,
        moneyEvents: state.moneyEvents || [],
        mySeat,
        players: Object.values(seats),
        hands: {
          [mySeat]: myCards,
        },
        handsCount: Object.values(seats).reduce((acc, p) => {
          acc[p.seat] = p.cardCount
          return acc
        }, {}),
        table: {
          cards: tableCards,
          combo: state.game?.currentTrick?.combo?.type || '',
          player: state.players.findIndex((player) => player.id === state.game?.currentTrick?.playerId),
        },
        currentTurn: state.players.findIndex((player) => player.id === state.game?.turnPlayerId),
        canStart: state.game?.canStart,
        started: state.game?.started,
        info: state.infoMessage,
      }

      if (state.game?.started && !this.started) {
        this.emitLocal('game_start', {
          activeSeats: Object.values(seats).map((p) => p.seat),
          currentTurn: syncPayload.currentTurn,
          hands: {
            [mySeat]: myCards,
          },
        })
        this.emitLocal('deal', { count: 13 })
      }

      if (!state.game?.started) {
        this.started = false
      } else {
        this.started = true
      }

      this.emitLocal('sync_state', syncPayload)
    })
  }

  createRoom(payload) {
    this.socket.emit('createRoom', { betUnit: payload.betUnit, token: payload.token || this.token })
  }

  joinRoom(roomId, payload = {}) {
    this.roomId = roomId
    this.socket.emit('join_room', { roomId, token: payload.token || this.token })
    this.socket.emit('joinRoom', { roomCode: roomId, token: payload.token || this.token })
  }

  startGame() {
    this.socket.emit('start_game', { roomId: this.roomId })
    this.socket.emit('startGame', { roomCode: this.roomId })
  }

  playCards(cards) {
    this.socket.emit('play_cards', { cards })
    this.socket.emit('playCards', { roomCode: this.roomId, cards })
  }

  pass() {
    this.socket.emit('pass_turn', { roomId: this.roomId })
    this.socket.emit('passTurn', { roomCode: this.roomId })
  }
}

export const socketEvents = new SocketEvents()