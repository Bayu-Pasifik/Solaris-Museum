import { CanvasTexture, SRGBColorSpace } from 'three'
import type { ElementTheme } from '../lib/elements'
import { LAYOUT, type Entry, type Spread } from '../lib/popup'

const { wide, deep } = LAYOUT

/** Pixels of the print for one meter of the book. */
const SCALE = 72
const WIDTH = wide * 2 * SCALE
const HEIGHT = deep * 2 * SCALE
const SERIF = "Georgia, 'Times New Roman', serif"
const TEXT = '#4a3b2e'
const FAINT = '#a8926c'

/** Pixels across for "x" meters from the spine, and down for "z" meters toward the front. */
const across = (x: number) => (x + wide) * SCALE
const down = (z: number) => (z + deep) * SCALE

/** Writes a text in lines no wider than "width", and returns where the next line would go. */
function paragraph(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  most: number,
) {
  const words = text.split(/\s+/)
  let line = ''
  let rows = 0
  for (const word of words) {
    const longer = line ? `${line} ${word}` : word
    if (line && g.measureText(longer).width > width) {
      rows += 1
      if (rows === most) {
        g.fillText(`${line}…`, x, y, width)
        return y + height
      }
      g.fillText(line, x, y, width)
      y += height
      line = word
    } else line = longer
  }
  g.fillText(line, x, y, width)
  return y + height
}

/** The print of one spread: both pages as the dictionary would show them. */
export function printSpread(
  list: Entry[],
  spread: Spread,
  number: number,
  total: number,
  theme: ElementTheme,
) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const g = canvas.getContext('2d')!

  g.fillStyle = '#f4e8c8'
  g.fillRect(0, 0, WIDTH, HEIGHT)
  // The paper gets darker where it runs into the spine, and a little toward the edges.
  const shade = g.createLinearGradient(across(-wide), 0, across(wide), 0)
  for (const [at, color] of [
    [0, '#8a6a3a30'],
    [0.07, '#8a6a3a00'],
    [0.42, '#8a6a3a00'],
    [0.5, '#5a3f22a0'],
    [0.58, '#8a6a3a00'],
    [0.93, '#8a6a3a00'],
    [1, '#8a6a3a30'],
  ] as const) {
    shade.addColorStop(at, color)
  }
  g.fillStyle = shade
  g.fillRect(0, 0, WIDTH, HEIGHT)
  // Specks in the paper, the same on every spread.
  g.fillStyle = '#8a6a3a2a'
  for (let k = 0; k < 2600; k++) {
    g.fillRect((k * 733.7) % WIDTH, (k * k * 97.13) % HEIGHT, 3, 3)
  }

  for (const side of [-1, 1]) {
    const left = across(side < 0 ? -13.2 : 0.8)
    const width = 12.4 * SCALE
    const top = down(-5.4)
    const foot = down(10.3)

    g.strokeStyle = theme.accent
    g.lineWidth = 6
    g.strokeRect(left, top, width, foot - top)
    g.lineWidth = 2
    g.strokeRect(left + 12, top + 12, width - 24, foot - top - 24)

    // The big letter behind the words.
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = theme.accent
    g.globalAlpha = 0.13
    g.font = `700 700px ${SERIF}`
    g.fillText(spread.letter, left + width / 2, down(3.2))
    g.globalAlpha = 1

    // The page number, and the first or last word of the page.
    const own = side < 0 ? 0 : 4
    const here = list.slice(spread.first, spread.first + spread.count).slice(own, own + 4)
    g.textBaseline = 'alphabetic'
    g.fillStyle = FAINT
    g.font = `italic 400 34px ${SERIF}`
    g.textAlign = side < 0 ? 'left' : 'right'
    const outer = side < 0 ? left + 30 : left + width - 30
    g.fillText(`${number * 2 + (side < 0 ? 1 : 2)} / ${total * 2}`, outer, foot - 30)
    g.textAlign = side < 0 ? 'right' : 'left'
    const inner = side < 0 ? left + width - 30 : left + 30
    const guide = here[side < 0 ? 0 : here.length - 1]
    if (guide) g.fillText(guide.name, inner, foot - 30, width * 0.6)

    // The terms of the page, in two columns of two.
    g.textAlign = 'left'
    here.forEach(({ term }, index) => {
      const column = width / 2 - 60
      const x = left + 40 + (index % 2) * (width / 2)
      let y = down(index < 2 ? -0.9 : 4.5)
      g.fillStyle = theme.deep
      g.font = `700 40px ${SERIF}`
      y = paragraph(g, term.name, x, y, column, 46, 2)
      g.fillStyle = TEXT
      g.font = `400 28px ${SERIF}`
      // The strikethrough marks of the game cannot be drawn, so only their words stay.
      // The lower terms leave room for the page number below them.
      paragraph(g, term.text.replace(/<\/?s>/g, ''), x, y + 4, column, 35, index < 2 ? 8 : 6)
    })
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 16
  return texture
}
