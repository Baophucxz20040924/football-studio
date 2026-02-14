import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const rootDir = path.resolve(process.cwd(), '..', '..')
const cardsDir = path.join(rootDir, 'Cards (large)')
const outDir = path.join(process.cwd(), 'public', 'assets')
const cardsOut = path.join(outDir, 'cards.png')
const backOut = path.join(outDir, 'card_back.png')
const metaOut = path.join(outDir, 'cards.meta.json')
const FRAME_WIDTH = 140
const FRAME_HEIGHT = 204

const rankOrder = ['A', '02', '03', '04', '05', '06', '07', '08', '09', '10', 'J', 'Q', 'K']

const suitOrder = [
  { key: 'spades', label: 'S' },
  { key: 'hearts', label: 'H' },
  { key: 'diamonds', label: 'D' },
  { key: 'clubs', label: 'C' },
]

const getCardFile = (suit, rank) => path.join(cardsDir, `card_${suit}_${rank}.png`)

const normalizeRankForSpec = (rank) => {
  if (rank === 'A') return 'A'
  if (rank === 'J') return 'J'
  if (rank === 'Q') return 'Q'
  if (rank === 'K') return 'K'
  return String(Number(rank))
}

const prepareCardBuffer = async (filePath) => {
  return sharp(filePath)
    .trim()
    .resize(FRAME_WIDTH, FRAME_HEIGHT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()
}

const main = async () => {
  await fs.mkdir(outDir, { recursive: true })

  const frameWidth = FRAME_WIDTH
  const frameHeight = FRAME_HEIGHT

  const rows = suitOrder.length
  const cols = rankOrder.length

  const composites = []
  let frameIndex = 0

  for (let row = 0; row < rows; row += 1) {
    const suit = suitOrder[row]
    for (let col = 0; col < cols; col += 1) {
      const rank = rankOrder[col]
      const filePath = getCardFile(suit.key, rank)
      const input = await prepareCardBuffer(filePath)
      composites.push({
        input,
        left: col * frameWidth,
        top: row * frameHeight,
      })

      const humanRank = normalizeRankForSpec(rank)
      console.log(`frame ${frameIndex}: ${suit.label}${humanRank}`)
      frameIndex += 1
    }
  }

  await sharp({
    create: {
      width: frameWidth * cols,
      height: frameHeight * rows,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(cardsOut)

  const cardBackBuffer = await prepareCardBuffer(path.join(cardsDir, 'card_back.png'))
  await sharp(cardBackBuffer).png().toFile(backOut)
  await fs.writeFile(metaOut, JSON.stringify({ frameWidth, frameHeight, rows, cols, totalFrames: 52 }, null, 2))
  console.log('Đã tạo assets/cards.png và assets/card_back.png')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})