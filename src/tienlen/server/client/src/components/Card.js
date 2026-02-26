export class Card {
  constructor(scene, x, y, cardData, opts = {}) {
    this.scene = scene
    this.data = cardData
    this.baseY = y
    this.selected = false
    this.disabled = false
    this.onToggle = opts.onToggle || (() => {})

    this.sprite = scene.add
      .sprite(x, y, 'cards', cardData.frame)
      .setScale(opts.scale || 1)
      .setInteractive({ useHandCursor: true })

    this.sprite.on('pointerdown', () => {
      if (this.disabled) {
        return
      }
      this.toggle()
      this.onToggle(this)
    })
  }

  setPosition(x, y) {
    this.baseY = y
    this.sprite.setPosition(x, this.selected ? y - 28 : y)
  }

  setDepth(depth) {
    this.sprite.setDepth(depth)
  }

  setSelected(selected) {
    this.selected = selected
    this.sprite.y = selected ? this.baseY - 28 : this.baseY
  }

  toggle() {
    this.setSelected(!this.selected)
  }

  disable() {
    this.disabled = true
    this.sprite.disableInteractive()
    this.sprite.setAlpha(1)
  }

  enable() {
    this.disabled = false
    this.sprite.setInteractive({ useHandCursor: true })
    this.sprite.setAlpha(1)
  }

  destroy() {
    this.sprite.destroy()
  }
}