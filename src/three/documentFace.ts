import type { Shelved } from '../lib/documents'
import type { ElementTheme } from '../lib/elements'
import { border, fit, HEIGHT, INK, WIDTH, write } from './lettering'

/** The picture area inside the white margin. */
const FRAME = { x: 20, y: 20, w: 728, h: 430 }
const PAPER = '#fff8e6'

/**
 * The front of a document panel: the picture with the title below it, or a sheet of paper with
 * the title and the start of the text.
 */
export function drawDocument(
  g: CanvasRenderingContext2D,
  document: Shelved,
  theme: ElementTheme,
  picture?: HTMLImageElement,
) {
  g.fillStyle = document.picture ? '#ffffff' : PAPER
  g.fillRect(0, 0, WIDTH, HEIGHT)
  const width = WIDTH - 90

  if (document.picture) {
    const { x, y, w, h } = FRAME
    const sky = g.createLinearGradient(x, y, x + w, y + h)
    sky.addColorStop(0, theme.deep)
    sky.addColorStop(1, theme.accent)
    g.fillStyle = sky
    g.fillRect(x, y, w, h)
    if (picture) {
      // The whole picture shows; many have torn edges or a frame of their own.
      const scale = Math.min(w / picture.width, h / picture.height)
      const [pw, ph] = [picture.width * scale, picture.height * scale]
      g.drawImage(picture, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph)
    }
    g.strokeStyle = INK
    g.lineWidth = 6
    g.strokeRect(x, y, w, h)
    const heading = { weight: 'italic 800', size: 44, smallest: 30, width, most: 2 }
    const title = { ...fit(g, document.title, heading), color: INK }
    write(g, [title], WIDTH / 2, (y + h + HEIGHT) / 2, width)
  } else {
    const head = 180
    g.fillStyle = theme.deep
    g.fillRect(0, 0, WIDTH, head)
    g.fillStyle = theme.accent
    g.fillRect(0, head, WIDTH, 14)
    const heading = { weight: 'italic 800', size: 56, smallest: 34, width, most: 2 }
    const title = { ...fit(g, document.title, heading), color: '#ffffff' }
    write(g, [title], WIDTH / 2, head / 2, width)
    // The strikethrough marks of the game cannot be drawn, so only their words stay.
    const text = document.text.replace(/<\/?s>/g, '')
    const body = { weight: '600', size: 36, smallest: 30, width, most: 8 }
    write(g, [{ ...fit(g, text, body), color: INK }], WIDTH / 2, (head + HEIGHT) / 2, width)
  }
  border(g)
}
