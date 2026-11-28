import { CanvasTexture, SRGBColorSpace } from 'three'
import { assetUrl } from '../lib/characters'
import type { Hung } from '../lib/exhibits'

const INK = '#1d1a4a'
const MUTE = '#8580b0'
const FONT = "'Avenir Next', Nunito, 'Segoe UI', system-ui, sans-serif"
/** Canvas pixels per unit of the wall. */
const SHARP = 200
/** Room around the frame for the hard shadow, in canvas pixels. */
export const SHADOW = 18
export const MARGIN = SHADOW / SHARP

type Pen = CanvasRenderingContext2D
type Picture = HTMLImageElement | undefined

/** A picture that cannot be loaded leaves its place empty. */
function load(path?: string) {
  return new Promise<Picture>((resolve) => {
    if (!path) return resolve(undefined)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(undefined)
    image.src = assetUrl(path)
  })
}

function box(g: Pen, x: number, y: number, width: number, height: number, radius: number) {
  g.beginPath()
  g.roundRect(x, y, width, height, radius)
}

/** One line that is cut off with "…" when it is too long. */
function line(g: Pen, text: string, x: number, y: number, room: number) {
  let shown = text
  while (shown.length > 1 && g.measureText(shown).width > room) {
    shown = `${shown.slice(0, -2).trimEnd()}…`
  }
  g.fillText(shown, x, y)
}

/** At most two lines, broken between words. */
function twoLines(g: Pen, text: string, x: number, y: number, room: number, gap: number) {
  const words = text.split(' ')
  let first = words.shift() ?? ''
  while (words.length > 0 && g.measureText(`${first} ${words[0]}`).width <= room) {
    first = `${first} ${words.shift()}`
  }
  if (words.length === 0) return line(g, first, x, y + gap / 2, room)
  line(g, first, x, y, room)
  line(g, words.join(' '), x, y + gap, room)
}

/** The layers of a title plate, placed as in the page (see ".title-plate"). */
function plate(g: Pen, layers: Picture[], x: number, y: number, width: number, height: number) {
  const [background, left, right, avatar] = layers
  if (background) g.drawImage(background, x, y, width, height)
  const foot = (image: Picture, from: number, share: number, lift = 0) => {
    if (!image) return
    const w = width * share
    const h = (w * image.height) / image.width
    g.drawImage(image, x + width * from, y + height * (1 - lift) - h, w, h)
  }
  foot(left, 0, 0.36)
  foot(right, 0.59, 0.41)
  foot(avatar, 0.04, 0.3, 0.08)
}

/**
 * Paints one piece with its frame, so the wall needs only one plane for it. "edge" is the color
 * of the hard shadow behind the frame.
 */
export async function paint(item: Hung, edge: string) {
  const { piece } = item
  const sources =
    piece.kind === 'card'
      ? [piece.card.picture]
      : piece.kind === 'title'
        ? [piece.title.background, piece.title.left, piece.title.right, piece.title.avatar]
        : piece.kind === 'group'
          ? [piece.group.icon]
          : [piece.category.picture]
  const pictures = await Promise.all(sources.map(load))

  const width = Math.round(item.width * SHARP)
  const height = Math.round(item.height * SHARP)
  const canvas = document.createElement('canvas')
  canvas.width = width + SHADOW * 2
  canvas.height = height + SHADOW * 2
  const g = canvas.getContext('2d')!
  g.translate(SHADOW, SHADOW)

  const radius = 30
  box(g, 13, 15, width, height, radius)
  g.fillStyle = edge
  g.fill()
  box(g, 0, 0, width, height, radius)
  g.fillStyle = piece.kind === 'banner' ? INK : '#ffffff'
  g.fill()

  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.save()
  g.clip()
  if (piece.kind === 'card') {
    const tall = Math.round((width * 360) / 728)
    g.fillStyle = '#f4f3fc'
    g.fillRect(0, 0, width, tall)
    if (pictures[0]) g.drawImage(pictures[0], 0, 0, width, tall)
    g.fillStyle = INK
    g.fillRect(0, tall, width, 6)
    g.font = `italic 800 40px ${FONT}`
    line(g, piece.card.name, width / 2, (height + tall) / 2 + 3, width - 40)
  } else if (piece.kind === 'title') {
    const inner = width - 24
    const tall = (inner * 72) / 388
    box(g, 12, (height - tall) / 2, inner, tall, 14)
    g.fillStyle = INK
    g.fill()
    plate(g, pictures, 12, (height - tall) / 2, inner, tall)
    g.fillStyle = '#ffffff'
    g.font = `700 36px ${FONT}`
    g.shadowColor = '#000000'
    g.shadowBlur = 10
    line(g, piece.title.name, width / 2, height / 2, inner * 0.66)
  } else if (piece.kind === 'group') {
    const tile = width - 90
    box(g, 45, 32, tile, tile, 26)
    g.fillStyle = INK
    g.fill()
    if (pictures[0]) g.drawImage(pictures[0], 57, 44, tile - 24, tile - 24)
    g.fillStyle = INK
    g.font = `italic 800 38px ${FONT}`
    const top = tile + 32
    twoLines(g, piece.group.name, width / 2, top + 38, width - 36, 44)
    g.fillStyle = MUTE
    g.font = `600 28px ${FONT}`
    g.fillText(`${piece.group.achievements.length} achievement`, width / 2, height - 34)
  } else {
    const art = pictures[0]
    if (art) {
      // The art covers the frame; the sides that stick out are cut off.
      const scale = Math.max(width / art.width, height / art.height)
      const [w, h] = [art.width * scale, art.height * scale]
      g.drawImage(art, (width - w) / 2, (height - h) / 2, w, h)
    }
    g.fillStyle = INK
    g.fillRect(0, height - 90, width, 90)
    g.fillStyle = '#ffffff'
    g.font = `italic 800 42px ${FONT}`
    line(g, piece.category.name, width / 2, height - 45, width - 30)
  }
  g.restore()

  box(g, 0, 0, width, height, radius)
  g.strokeStyle = INK
  g.lineWidth = 9
  g.stroke()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
