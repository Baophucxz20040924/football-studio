import Phaser from 'phaser'
import { Hand } from '../components/Hand'
import { Table } from '../components/Table'
import { socketEvents } from '../socket/events'

const comboLabelMap = {
  single: 'Đơn',
  pair: 'Đôi',
  triple: 'Sám',
  fourOfKind: 'Tứ quý',
  straight: 'Sảnh',
  straightFlush: 'Sảnh',
  consecutivePairs: 'Đôi thông',
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
    this.playersBySeat = {}
    this.mySeat = 0
    this.currentTurn = -1
    this.tableState = { cards: [], combo: '' }
    this.selectedCardIds = []
    this.canStart = false
    this.started = false
    this.betUnit = 0
    this.waitingTexts = {}
    this.nameTexts = {}
    this.countTexts = {}
    this.turnRings = {}
    this.backStacks = {}
  }

  create() {
    this.drawTable()
    this.createSeatUI()
    this.createControls()

    this.hand = new Hand(this, this.scale.width / 2, this.scale.height - 118, this.scale.width - 200)
    this.hand.setSelectionListener((ids) => {
      this.selectedCardIds = ids
      this.refreshControlState()
    })
    this.table = new Table(this, this.scale.width / 2, this.scale.height / 2 - 24)

    this.bindSocketEvents()
    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
    })
    this.layoutResponsiveUI()
    window.tienLenHud?.setStatus('Nhập mã phòng để join hoặc chọn mức cược để tạo phòng.')
  }

  drawTable() {
    const { width, height } = this.scale
    if (this.textures.exists('table')) {
      this.add.image(width / 2, height / 2, 'table').setDisplaySize(width, height)
      return
    }

    this.add.rectangle(width / 2, height / 2, width, height, 0x0f5132)
  }

  createSeatUI() {
    this.roomCodeText = this.add
      .text(16, 14, 'Phòng: ----', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.28)',
        padding: { x: 10, y: 6 },
      })
      .setDepth(1000)

    this.betText = this.add
      .text(16, 56, 'Cược: --/lá', {
        fontSize: '18px',
        color: '#fff8b3',
        backgroundColor: 'rgba(0,0,0,0.22)',
        padding: { x: 10, y: 5 },
      })
      .setDepth(1000)

    this.balanceText = this.add
      .text(this.scale.width - 16, 14, 'Số dư: --', {
        fontSize: '18px',
        color: '#b3ffcf',
        backgroundColor: 'rgba(0,0,0,0.22)',
        padding: { x: 10, y: 5 },
      })
      .setDepth(1000)
      .setOrigin(1, 0)

    this.moneyEventText = this.add
      .text(16, 88, '', {
        fontSize: '16px',
        color: '#b3ffcf',
        wordWrap: { width: 520 },
      })
      .setDepth(1000)

    const anchors = {
      0: { x: this.scale.width / 2, y: this.scale.height - 272 },
      1: { x: 120, y: this.scale.height / 2 },
      2: { x: this.scale.width / 2, y: 56 },
      3: { x: this.scale.width - 120, y: this.scale.height / 2 },
    }

    Object.entries(anchors).forEach(([seat, point]) => {
      const seatNum = Number(seat)
      this.turnRings[seatNum] = this.add.circle(point.x, point.y, 44, 0xffffff, 0.1).setVisible(false)
      this.nameTexts[seatNum] = this.add
        .text(point.x, point.y - 14, 'Waiting...', { fontSize: '20px', color: '#ffffff' })
        .setOrigin(0.5)

      this.countTexts[seatNum] = this.add
        .text(point.x, point.y + 14, '', { fontSize: '16px', color: '#ffe082' })
        .setOrigin(0.5)

      this.waitingTexts[seatNum] = this.nameTexts[seatNum]
      this.backStacks[seatNum] = []
    })

    this.infoText = this.add.text(this.scale.width / 2, this.scale.height / 2 + 128, '', {
      fontSize: '18px',
      color: '#ffffff',
    })
    this.infoText.setOrigin(0.5)
  }

  createControls() {
    this.playBtn = this.createButton(0, 0, 'Đánh', () => {
      if (this.selectedCardIds.length > 0) {
        socketEvents.playCards(this.selectedCardIds)
      }
    })

    this.passBtn = this.createButton(0, 0, 'Pass', () => {
      socketEvents.pass()
    })

    this.startBtn = this.createButton(0, 0, 'Start', () => {
      socketEvents.startGame()
    })

    this.layoutControlButtons()
  }

  createButton(x, y, label, onClick, options = {}) {
    const width = options.width || 128
    const height = options.height || 46
    const fontSize = options.fontSize || '22px'

    const bg = this.add.rectangle(x, y, width, height, 0x1b1f23).setStrokeStyle(2, 0xffffff)
    const text = this.add
      .text(x, y, label, { fontSize, fontStyle: '700', color: '#ffffff' })
      .setOrigin(0.5)
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerdown', onClick)
    return { bg, text, enabled: true }
  }

  setButtonEnabled(button, enabled) {
    button.enabled = enabled
    button.bg.setAlpha(enabled ? 1 : 0.45)
    if (enabled) {
      button.bg.setInteractive({ useHandCursor: true })
    } else {
      button.bg.disableInteractive()
    }
  }

  getViewportInsets() {
    const gameWidth = this.scale.width
    const gameHeight = this.scale.height
    const parentWidth = this.scale.parentSize?.width || gameWidth
    const parentHeight = this.scale.parentSize?.height || gameHeight
    const scaleX = this.scale.displayScale?.x || 1
    const scaleY = this.scale.displayScale?.y || 1

    const visibleWorldWidth = Math.min(gameWidth, parentWidth / scaleX)
    const visibleWorldHeight = Math.min(gameHeight, parentHeight / scaleY)

    const horizontalInset = Math.max(0, (gameWidth - visibleWorldWidth) / 2)
    const verticalInset = Math.max(0, (gameHeight - visibleWorldHeight) / 2)

    return {
      left: horizontalInset,
      right: horizontalInset,
      top: verticalInset,
      bottom: verticalInset,
    }
  }

  layoutControlButtons() {
    if (!this.playBtn || !this.passBtn || !this.startBtn) {
      return
    }

    const insets = this.getViewportInsets()
    const safeWidth = this.scale.width - insets.left - insets.right
    const isCompactScreen = safeWidth <= 900
    const buttonWidth = isCompactScreen ? 148 : 128
    const buttonHeight = isCompactScreen ? 56 : 46
    const buttonFontSize = isCompactScreen ? '26px' : '22px'
    const gap = isCompactScreen ? 14 : 12
    const x = this.scale.width - insets.right - (buttonWidth / 2 + 18)
    const bottomPadding = isCompactScreen ? 22 : 18
    const firstY =
      this.scale.height -
      insets.bottom -
      bottomPadding -
      (buttonHeight * 2 + gap * 2) -
      buttonHeight / 2

    const applyButtonLayout = (button, y) => {
      button.bg.setSize(buttonWidth, buttonHeight)
      button.bg.setPosition(x, y)
      button.text.setPosition(x, y)
      button.text.setFontSize(buttonFontSize)
    }

    applyButtonLayout(this.playBtn, firstY)
    applyButtonLayout(this.passBtn, firstY + buttonHeight + gap)
    applyButtonLayout(this.startBtn, firstY + (buttonHeight + gap) * 2)
  }

  layoutResponsiveUI() {
    const insets = this.getViewportInsets()
    const topY = insets.top + 14

    if (this.roomCodeText) {
      this.roomCodeText.setPosition(insets.left + 16, topY)
    }

    if (this.betText) {
      this.betText.setPosition(insets.left + 16, topY + 42)
    }

    if (this.balanceText) {
      this.balanceText.setPosition(this.scale.width - insets.right - 16, topY)
    }

    if (this.moneyEventText) {
      this.moneyEventText.setPosition(insets.left + 16, topY + 74)
      this.moneyEventText.setWordWrapWidth(
        Math.max(240, this.scale.width - insets.left - insets.right - 32),
      )
    }

    const seatPoints = {
      0: { x: this.scale.width / 2, y: this.scale.height - insets.bottom - 272 },
      1: { x: insets.left + 120, y: this.scale.height / 2 },
      2: { x: this.scale.width / 2, y: insets.top + 56 },
      3: { x: this.scale.width - insets.right - 120, y: this.scale.height / 2 },
    }

    Object.entries(seatPoints).forEach(([seat, point]) => {
      const seatNum = Number(seat)
      if (this.turnRings[seatNum]) {
        this.turnRings[seatNum].setPosition(point.x, point.y)
      }
      if (this.nameTexts[seatNum]) {
        this.nameTexts[seatNum].setPosition(point.x, point.y - 14)
      }
      if (this.countTexts[seatNum]) {
        this.countTexts[seatNum].setPosition(point.x, point.y + 14)
      }
    })

    if (this.infoText) {
      const infoY = Math.min(this.scale.height - insets.bottom - 90, this.scale.height / 2 + 128)
      this.infoText.setPosition(this.scale.width / 2, infoY)
    }

    if (this.table?.group) {
      this.table.group.setPosition(this.scale.width / 2, this.scale.height / 2 - 24)
    }

    if (this.table?.comboText) {
      this.table.comboText.setPosition(this.scale.width / 2, this.scale.height / 2 + 68)
    }

    if (this.hand) {
      this.hand.x = this.scale.width / 2
      this.hand.y = this.scale.height - insets.bottom - 118
      this.hand.width = Math.max(480, this.scale.width - insets.left - insets.right - 220)
      this.hand.layout()
    }

    this.layoutControlButtons()
    this.refreshSeatUI()
  }

  handleResize() {
    this.layoutResponsiveUI()
  }

  bindSocketEvents() {
    socketEvents.on('joined', (payload) => {
      this.roomCodeText.setText(`Phòng: ${payload.roomId || '----'}`)
      window.tienLenHud?.setStatus(`Đã vào phòng ${payload.roomId || ''}`)
    })

    socketEvents.on('player_joined', ({ seat, name }) => {
      window.tienLenHud?.setStatus(`${name} vào ghế ${seat}`)
    })

    socketEvents.on('player_left', ({ seat }) => {
      window.tienLenHud?.setStatus(`Ghế ${seat} đã trống`)
    })

    socketEvents.on('game_start', () => {
      this.started = true
      this.table.clear()
      window.tienLenHud?.setStatus('Ván mới bắt đầu')
    })

    socketEvents.on('deal', ({ count }) => {
      this.playDealAnimation(count)
    })

    socketEvents.on('play_success', ({ table, nextTurn, handsCount }) => {
      this.table.setTableCards(table.cards || [], table.combo || '')
      this.tableState = { cards: table.cards || [], combo: table.combo || '', player: table.player }
      this.currentTurn = nextTurn
      if (handsCount) {
        Object.entries(handsCount).forEach(([seat, count]) => {
          if (this.countTexts[seat]) {
            this.countTexts[seat].setText(`${count} lá`)
          }
        })
      }
      this.hand.clearSelection()
      this.refreshSeatUI()
      this.refreshControlState()
    })

    socketEvents.on('play_error', ({ message }) => {
      window.tienLenHud?.setStatus(message || 'Đánh bài thất bại')
      this.hand.shakeSelected()
      this.hand.clearSelection()
      this.refreshControlState()
    })

    socketEvents.on('player_pass', ({ player, nextTurn }) => {
      this.currentTurn = nextTurn
      this.infoText.setText(`Ghế ${player} đã PASS`)
      this.refreshSeatUI()
      this.refreshControlState()
    })

    socketEvents.on('round_reset', ({ starter }) => {
      this.table.clear()
      this.tableState = { cards: [], combo: '', player: -1 }
      this.currentTurn = starter
      this.infoText.setText('Reset vòng - người thắng lượt mở bài mới')
      this.refreshSeatUI()
      this.refreshControlState()
    })

    socketEvents.on('player_out', ({ player }) => {
      this.infoText.setText(`Ghế ${player} đã hết bài`)
    })

    socketEvents.on('game_over', ({ ranking }) => {
      this.started = false
      this.infoText.setText(`Game over: ${ranking.join(' > ')}`)
      this.setButtonEnabled(this.playBtn, false)
      this.setButtonEnabled(this.passBtn, false)
      this.setButtonEnabled(this.startBtn, true)
    })

    socketEvents.on('sync_state', (state) => {
      this.applySyncState(state)
    })
  }

  applySyncState(state) {
    if (state.roomId) {
      this.roomCodeText.setText(`Phòng: ${state.roomId}`)
    }

    if (state.betUnit) {
      this.betUnit = state.betUnit
      this.betText.setText(`Cược: ${state.betUnit}/lá`)
    }

    const latestMoneyEvent = (state.moneyEvents || [])[state.moneyEvents.length - 1]
    this.moneyEventText.setText(latestMoneyEvent ? `Tiền: ${latestMoneyEvent}` : '')

    this.mySeat = state.mySeat >= 0 ? state.mySeat : this.mySeat
    this.playersBySeat = {}
    ;(state.players || []).forEach((player) => {
      this.playersBySeat[player.seat] = player
    })

    const myPlayer = this.playersBySeat[this.mySeat]
    const myBalance = myPlayer?.money ?? 0
    this.balanceText.setText(`Số dư: ${myBalance}`)

    this.currentTurn = Number.isInteger(state.currentTurn) ? state.currentTurn : -1
    this.tableState = state.table || { cards: [], combo: '' }
    this.canStart = !!state.canStart
    this.started = !!state.started

    const myCards = state.hands?.[this.mySeat] || []
    this.hand.setCards(myCards, this.started && this.currentTurn === this.mySeat)

    this.table.setTableCards(this.tableState.cards || [], comboLabelMap[this.tableState.combo] || this.tableState.combo)
    this.infoText.setText(state.info || '')
    this.refreshSeatUI(state.handsCount || {})
    this.refreshControlState()
  }

  refreshSeatUI(handsCount = {}) {
    for (let seat = 0; seat < 4; seat += 1) {
      const player = this.playersBySeat[seat]
      if (!player) {
        this.nameTexts[seat].setText('Waiting...')
        this.countTexts[seat].setText('')
        this.turnRings[seat].setVisible(false)
        this.clearBackStack(seat)
        continue
      }

      this.nameTexts[seat].setText(player.name)
      const count = handsCount[seat] ?? player.cardCount ?? 0
      this.countTexts[seat].setText(`${count} lá`)
      this.turnRings[seat].setVisible(this.currentTurn === seat)

      if (seat !== this.mySeat) {
        this.renderBackStack(seat, count)
      } else {
        this.clearBackStack(seat)
      }
    }
  }

  renderBackStack(seat, count) {
    this.clearBackStack(seat)
    const anchor = this.nameTexts[seat]
    const maxShown = Math.min(count, 10)
    const sprites = []

    for (let i = 0; i < maxShown; i += 1) {
      const sprite = this.add
        .image(anchor.x + i * 4 - maxShown * 2, anchor.y + 48 + i * 0.8, 'card-back')
        .setScale(0.26)
        .setAlpha(0.95)
      sprites.push(sprite)
    }

    this.backStacks[seat] = sprites
  }

  clearBackStack(seat) {
    ;(this.backStacks[seat] || []).forEach((sprite) => sprite.destroy())
    this.backStacks[seat] = []
  }

  playDealAnimation(count = 13) {
    const deck = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, 32, 44, 0x111111)
    const targets = [
      { x: this.scale.width / 2, y: this.scale.height - 80 },
      { x: 120, y: this.scale.height / 2 + 30 },
      { x: this.scale.width / 2, y: 70 },
      { x: this.scale.width - 120, y: this.scale.height / 2 + 30 },
    ]

    let delay = 0
    for (let i = 0; i < count; i += 1) {
      for (let seat = 0; seat < 4; seat += 1) {
        this.tweens.add({
          targets: deck,
          x: targets[seat].x,
          y: targets[seat].y,
          duration: 80,
          delay,
          yoyo: true,
        })
        delay += 16
      }
    }

    this.time.delayedCall(delay + 120, () => deck.destroy())
  }

  refreshControlState() {
    const myTurn = this.started && this.currentTurn === this.mySeat
    const hasSelection = this.selectedCardIds.length > 0
    const hasTable = (this.tableState.cards || []).length > 0
    const iAmCurrentTableOwner = this.tableState.player === this.mySeat

    this.hand.setInteractable(myTurn)
    this.setButtonEnabled(this.playBtn, myTurn && hasSelection)
    this.setButtonEnabled(this.passBtn, myTurn && hasTable && !iAmCurrentTableOwner)
    this.setButtonEnabled(this.startBtn, !this.started && this.canStart)
  }
}