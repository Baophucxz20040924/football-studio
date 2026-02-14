import { Card } from './Card'

export class Hand {
  constructor(scene, x, y, width) {
    this.scene = scene
    this.x = x
    this.y = y
    this.width = width
    this.cards = []
    this.onSelectionChanged = () => {}
  }

  setSelectionListener(listener) {
    this.onSelectionChanged = listener
  }

  setCards(cardDataList, interactable) {
    this.cards.forEach((card) => card.destroy())
    this.cards = cardDataList.map(
      (cardData) =>
        new Card(this.scene, this.x, this.y, cardData, {
          onToggle: () => this.onSelectionChanged(this.getSelectedIds()),
        }),
    )

    this.layout()
    this.setInteractable(interactable)
  }

  layout() {
    const count = this.cards.length
    if (count === 0) {
      return
    }

    const spacing = Math.min(74, this.width / Math.max(1, count - 1))
    const startX = this.x - ((count - 1) * spacing) / 2

    for (let index = 0; index < count; index += 1) {
      const card = this.cards[index]
      card.setPosition(startX + index * spacing, this.y)
      card.setDepth(100 + index)
    }
  }

  setInteractable(canInteract) {
    this.cards.forEach((card) => {
      if (canInteract) {
        card.enable()
      } else {
        card.disable()
      }
    })
  }

  getSelectedIds() {
    return this.cards.filter((card) => card.selected).map((card) => card.data.id)
  }

  clearSelection() {
    this.cards.forEach((card) => card.setSelected(false))
    this.onSelectionChanged(this.getSelectedIds())
  }

  shakeSelected() {
    const targets = this.cards.filter((card) => card.selected).map((card) => card.sprite)
    if (targets.length === 0) {
      return
    }

    this.scene.tweens.add({
      targets,
      x: '+=8',
      yoyo: true,
      repeat: 2,
      duration: 45,
      onComplete: () => {
        this.layout()
      },
    })
  }
}