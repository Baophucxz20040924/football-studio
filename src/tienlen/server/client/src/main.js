import Phaser from 'phaser'
import './styles.css'
import { BootScene } from './scenes/BootScene'
import { PreloadScene } from './scenes/PreloadScene'
import { GameScene } from './scenes/GameScene'
import { socketEvents } from './socket/events'

const SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3001`

const app = document.getElementById('app')
app.innerHTML = `
  <div id="lobby-screen">
    <div id="lobby-card">
      <h1>Tiến Lên Miền Trung</h1>
      <p>Tạo phòng hoặc vào phòng bằng mã.</p>
      <div id="profileText">Đang xác thực...</div>
      <input id="roomInput" placeholder="Mã phòng" maxlength="10" />
      <select id="betInput">
        <option value="">Chọn mức cược / lá</option>
        <option value="1">1</option>
        <option value="5">5</option>
        <option value="10">10</option>
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="500">500</option>
      </select>
      <div id="lobby-actions">
        <button id="createBtn">Tạo phòng</button>
        <button id="joinBtn">Vào phòng</button>
      </div>
      <span id="statusText">Sẵn sàng</span>
    </div>
  </div>
  <div id="game-shell" class="hidden">
    <div id="game-root"></div>
  </div>
`

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoRound: true,
  parent: 'game-root',
  backgroundColor: '#0f5132',
  render: {
    antialias: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, PreloadScene, GameScene],
})

window.tienLenHud = {
  setStatus(text) {
    const status = document.getElementById('statusText')
    if (status) {
      status.textContent = text || ''
    }
  },
  getRoomId() {
    return document.getElementById('roomInput')?.value?.trim().toUpperCase() || ''
  },
  getBetUnit() {
    return Number(document.getElementById('betInput')?.value || 0)
  },
}

const lobby = document.getElementById('lobby-screen')
const gameShell = document.getElementById('game-shell')
const createBtn = document.getElementById('createBtn')
const joinBtn = document.getElementById('joinBtn')
const profileText = document.getElementById('profileText')

let sessionToken = ''
let sessionUser = null

const setProfileText = () => {
  if (!profileText) {
    return
  }

  if (!sessionUser) {
    profileText.textContent = 'Chưa xác thực. Hãy mở game từ lệnh /tienlen trong Discord.'
    return
  }

  profileText.textContent = `Người chơi: ${sessionUser.userName} | Số dư: ${sessionUser.balance}`
}

const enterGameScreen = () => {
  lobby?.classList.add('hidden')
  gameShell?.classList.remove('hidden')

  requestAnimationFrame(() => {
    const width = gameShell?.clientWidth || window.innerWidth
    const height = gameShell?.clientHeight || window.innerHeight

    if (width > 0 && height > 0) {
      game.scale.resize(width, height)
    }

    game.scale.refresh()
  })
}

createBtn?.addEventListener('click', () => {
  const betUnit = window.tienLenHud.getBetUnit()
  if (!sessionToken || !sessionUser) {
    window.tienLenHud.setStatus('Phiên đăng nhập chưa hợp lệ. Mở lại từ lệnh /tienlen.')
    return
  }
  if (![1, 5, 10, 50, 100, 500].includes(betUnit)) {
    window.tienLenHud.setStatus('Chọn mức cược phòng trước khi tạo.')
    return
  }
  socketEvents.createRoom({ token: sessionToken, betUnit })
})

joinBtn?.addEventListener('click', () => {
  const roomId = window.tienLenHud.getRoomId()

  if (!sessionToken || !sessionUser || !roomId) {
    window.tienLenHud.setStatus('Thiếu phiên đăng nhập hoặc mã phòng.')
    return
  }

  socketEvents.joinRoom(roomId, { token: sessionToken })
})

const initSession = async () => {
  const urlToken = new URLSearchParams(window.location.search).get('token') || ''
  const savedToken = localStorage.getItem('tienlen_token') || ''
  sessionToken = (urlToken || savedToken).trim()

  if (!sessionToken) {
    setProfileText()
    window.tienLenHud.setStatus('Không tìm thấy token. Hãy vào từ lệnh /tienlen trên Discord.')
    return
  }

  localStorage.setItem('tienlen_token', sessionToken)
  socketEvents.setToken(sessionToken)

  try {
    const response = await fetch(`${SERVER_URL}/api/session?token=${encodeURIComponent(sessionToken)}`)
    if (!response.ok) {
      throw new Error('Unauthorized')
    }

    sessionUser = await response.json()
    setProfileText()
    window.tienLenHud.setStatus(`Xin chào ${sessionUser.userName}. Bạn đã sẵn sàng vào bàn.`)
  } catch (error) {
    sessionUser = null
    localStorage.removeItem('tienlen_token')
    setProfileText()
    window.tienLenHud.setStatus('Không xác thực được phiên. Kiểm tra token mới và TienLen server cổng 3001.')
  }
}

socketEvents.on('joined', () => {
  enterGameScreen()
})

window.addEventListener('beforeunload', () => {
  game.destroy(true)
})

void initSession()