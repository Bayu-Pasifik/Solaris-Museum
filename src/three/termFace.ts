import type { ElementTheme } from '../lib/elements'
import type { Term } from '../lib/glossary'
import { border, fit, HEIGHT, INK, WIDTH, write } from './lettering'

/** The front of a term panel: the name on a colored head and the start of its explanation. */
export function drawTerm(g: CanvasRenderingContext2D, term: Term, theme: ElementTheme) {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, WIDTH, HEIGHT)

  const head = 220
  const sky = g.createLinearGradient(0, 0, WIDTH, head)
  sky.addColorStop(0, theme.deep)
  sky.addColorStop(1, theme.accent)
  g.fillStyle = sky
  g.fillRect(0, 0, WIDTH, head)
  g.strokeStyle = '#ffffff44'
  g.lineWidth = 8
  for (const radius of [70, 130, 200]) {
    g.beginPath()
    g.arc(WIDTH - 90, 40, radius, 0, Math.PI * 2)
    g.stroke()
  }
  g.fillStyle = INK
  g.fillRect(0, head, WIDTH, 8)

  const width = WIDTH - 90
  const heading = { weight: 'italic 800', size: 68, smallest: 40, width, most: 2 }
  write(g, [{ ...fit(g, term.name, heading), color: '#ffffff' }], WIDTH / 2, head / 2, width)
  // The strikethrough marks of the game cannot be drawn, so only their words stay.
  const text = term.text.replace(/<\/?s>/g, '')
  const body = { weight: '600', size: 38, smallest: 30, width, most: 8 }
  write(g, [{ ...fit(g, text, body), color: INK }], WIDTH / 2, (head + HEIGHT) / 2, width)
  border(g)
}
