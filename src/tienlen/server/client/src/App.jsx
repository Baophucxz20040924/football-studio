import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const SERVER_URL = 'http://localhost:3001'

const SUIT_SYMBOL = {
  S: '♠',
  C: '♣',
  D: '♦',
  H: '♥',
}

const cardLabel = (card) => {
  const suit = card.at(-1)
  const rank = card.slice(0, -1)
  return `${rank}${SUIT_SYMBOL[suit] ?? suit}`
}

const comboLabel = (combo) => {
  if (!combo) {
    return 'Chưa có'
  }

  const map = {
    single: 'Bài lẻ',
    pair: 'Đôi',
    triple: 'Sám',
    fourOfKind: 'Tứ quý',
    straightFlush: 'Sảnh đồng chất',
    consecutivePairs: 'Đôi thông',
  }

  return `${map[combo.type] ?? combo.type} (${combo.length} lá)`
}

function App() {
  const socketRef = useRef(null)
  const [name, setName] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomState, setRoomState] = useState(null)
  const [joinedRoomCode, setJoinedRoomCode] = useState('')
  const [selectedCards, setSelectedCards] = useState([])
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const socket = io(SERVER_URL)
    socketRef.current = socket

    socket.on('joinedRoom', ({ roomCode }) => {
      setJoinedRoomCode(roomCode)
      setSelectedCards([])
      setErrorMessage('')
    })

    socket.on('roomState', (state) => {
      setRoomState(state)
      setErrorMessage('')
    })

    socket.on('errorMessage', (message) => {
      setErrorMessage(message)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    const myHand = roomState?.game?.myHand ?? []
    setSelectedCards((prev) => prev.filter((card) => myHand.includes(card)))
  }, [roomState?.game?.myHand])

  const me = useMemo(() => {
    const id = socketRef.current?.id
    return roomState?.players?.find((player) => player.id === id) ?? null
  }, [roomState])

  const isMyTurn = useMemo(() => {
    return roomState?.game?.turnPlayerId === socketRef.current?.id
  }, [roomState])

  const isCurrentTrickMine = useMemo(() => {
    return roomState?.game?.currentTrick?.playerId === socketRef.current?.id
  }, [roomState])

  const createRoom = () => {
    socketRef.current?.emit('createRoom', { name })
  }

  const joinRoom = () => {
    socketRef.current?.emit('joinRoom', {
      name,
      roomCode: roomCodeInput,
    })
  }

  const startGame = () => {
    socketRef.current?.emit('startGame', { roomCode: joinedRoomCode })
  }

  const leaveRoom = () => {
    socketRef.current?.emit('leaveRoom', { roomCode: joinedRoomCode })
    setRoomState(null)
    setJoinedRoomCode('')
    setSelectedCards([])
    setErrorMessage('')
  }

  const toggleCard = (card) => {
    setSelectedCards((prev) =>
      prev.includes(card) ? prev.filter((item) => item !== card) : [...prev, card],
    )
  }

  const playCards = () => {
    socketRef.current?.emit('playCards', {
      roomCode: joinedRoomCode,
      cards: selectedCards,
    })
    setSelectedCards([])
  }

  const passTurn = () => {
    socketRef.current?.emit('passTurn', { roomCode: joinedRoomCode })
    setSelectedCards([])
  }

  if (!roomState) {
    return (
      <main className="screen">
        <section className="panel">
          <h1>Tiến Lên Miền Bắc Multiplayer</h1>
          <p>Tạo phòng hoặc nhập mã phòng để chơi từ 2-4 người.</p>

          <label>
            Tên người chơi
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên của bạn"
              maxLength={24}
            />
          </label>

          <div className="actions">
            <button onClick={createRoom}>Tạo phòng</button>
          </div>

          <label>
            Mã phòng
            <input
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="VD: A7KD9P"
              maxLength={6}
            />
          </label>

          <div className="actions">
            <button onClick={joinRoom}>Vào phòng</button>
          </div>

          {errorMessage && <p className="error">{errorMessage}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="screen">
      <section className="panel game-panel">
        <div className="topbar">
          <h1>Phòng {roomState.roomCode}</h1>
          <button className="ghost" onClick={leaveRoom}>
            Rời phòng
          </button>
        </div>

        <div className="status-grid">
          <div>
            <strong>Chủ phòng:</strong>{' '}
            {roomState.players.find((p) => p.id === roomState.ownerId)?.name ?? '-'}
          </div>
          <div>
            <strong>Bạn:</strong> {me?.name ?? '-'}
          </div>
          <div>
            <strong>Đến lượt:</strong>{' '}
            {roomState.players.find((p) => p.id === roomState.game.turnPlayerId)?.name ?? '-'}
          </div>
          <div>
            <strong>Bài hiện tại:</strong> {comboLabel(roomState.game.currentTrick?.combo)}
          </div>
        </div>

        <ul className="player-list">
          {roomState.players.map((player) => (
            <li key={player.id} className={player.isTurn ? 'turn' : ''}>
              <span>{player.name}</span>
              <span>{player.cardCount} lá</span>
            </li>
          ))}
        </ul>

        {roomState.infoMessage && <p className="info">{roomState.infoMessage}</p>}
        {errorMessage && <p className="error">{errorMessage}</p>}

        {!roomState.game.started && (
          <div className="actions">
            <button onClick={startGame} disabled={!roomState.game.canStart}>
              Bắt đầu ván
            </button>
          </div>
        )}

        {roomState.game.started && (
          <>
            {roomState.game.currentTrick?.cards?.length > 0 && (
              <p className="last-play">
                Người vừa đánh:{' '}
                {roomState.players.find((p) => p.id === roomState.game.currentTrick.playerId)?.name} -{' '}
                {roomState.game.currentTrick.cards.map(cardLabel).join(' ')}
              </p>
            )}

            <h3>Bài của bạn ({roomState.game.myHand.length} lá)</h3>
            <div className="hand">
              {roomState.game.myHand.map((card) => (
                <button
                  key={card}
                  className={`card ${selectedCards.includes(card) ? 'selected' : ''}`}
                  onClick={() => toggleCard(card)}
                >
                  {cardLabel(card)}
                </button>
              ))}
            </div>

            <div className="actions">
              <button onClick={playCards} disabled={!isMyTurn || selectedCards.length === 0}>
                Đánh bài
              </button>
              <button
                onClick={passTurn}
                disabled={!isMyTurn || !roomState.game.currentTrick || isCurrentTrickMine}
              >
                Bỏ lượt
              </button>
              <button className="ghost" onClick={() => setSelectedCards([])}>
                Bỏ chọn
              </button>
            </div>
          </>
        )}

        {!roomState.game.started && roomState.game.winnerId && (
          <p className="winner">
            Người thắng ván trước:{' '}
            {roomState.players.find((p) => p.id === roomState.game.winnerId)?.name ?? 'Không xác định'}
          </p>
        )}
      </section>
    </main>
  )
}

export default App
