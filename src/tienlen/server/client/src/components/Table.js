export class Table {
  constructor(scene, x, y) {
    this.scene = scene
    this.x = x
    this.y = y
    this.group = scene.add.container(x, y)
    this.cards = []
    this.comboText = scene
      .add.text(x, y + 92, '', {
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
  }

  clear() {
    this.cards.forEach((sprite) => sprite.destroy())
    this.cards = []
    this.comboText.setText('')
  }

  setTableCards(cards, comboLabel) {
    this.clear()

    const spacing = 72
    const startX = -((cards.length - 1) * spacing) / 2

    cards.forEach((card, index) => {
      const sprite = this.scene.add.sprite(startX + index * spacing, 0, 'cards', card.frame).setScale(1)
      this.group.add(sprite)
      this.cards.push(sprite)
    })

    this.comboText.setText(comboLabel || '')
  }
}