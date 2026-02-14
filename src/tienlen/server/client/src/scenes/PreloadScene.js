import Phaser from 'phaser'

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene')
  }

  preload() {
    this.load.image('cards-image', 'assets/cards.png')
    this.load.image('card-back', 'assets/card_back.png')
    this.load.json('cards-meta', 'assets/cards.meta.json')
  }

  create() {
    const meta = this.cache.json.get('cards-meta') || { frameWidth: 250, frameHeight: 363 }
    const cardsImage = this.textures.get('cards-image').getSourceImage()

    if (!this.textures.exists('cards')) {
      this.textures.addSpriteSheet('cards', cardsImage, {
        frameWidth: meta.frameWidth,
        frameHeight: meta.frameHeight,
        endFrame: 51,
      })
    }

    this.scene.start('GameScene')
  }
}