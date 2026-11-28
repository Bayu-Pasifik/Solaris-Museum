import type { Contact } from '../lib/chats'
import type { ElementTheme } from '../lib/elements'
import { border, fit, HEIGHT, INK, WIDTH, write } from './lettering'

/** The front of a contact panel: the face, the name and the first words of the chat. */
export function drawContact(
  g: CanvasRenderingContext2D,
  contact: Contact,
  theme: ElementTheme,
  picture?: HTMLImageElement,
) {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, WIDTH, HEIGHT)
  const sky = g.createLinearGradient(0, 0, WIDTH, 340)
  sky.addColorStop(0, theme.deep)
  sky.addColorStop(1, theme.accent)
  g.fillStyle = sky
  g.fillRect(0, 0, WIDTH, 250)
  g.fillStyle = INK
  g.fillRect(0, 250, WIDTH, 8)

  const [x, y, radius] = [WIDTH / 2, 210, 160]
  g.save()
  g.beginPath()
  g.arc(x, y, radius, 0, Math.PI * 2)
  g.fillStyle = theme.pale
  g.fill()
  g.clip()
  if (picture) {
    g.drawImage(picture, x - radius, y - radius, radius * 2, radius * 2)
  } else {
    const letter = { weight: '800', size: 150, smallest: 150, width: radius * 2, most: 1 }
    write(g, [{ ...fit(g, contact.name.charAt(0), letter), color: theme.deep }], x, y, radius * 2)
  }
  g.restore()
  g.strokeStyle = INK
  g.lineWidth = 8
  g.beginPath()
  g.arc(x, y, radius, 0, Math.PI * 2)
  g.stroke()

  const width = WIDTH - 80
  const heading = { weight: 'italic 800', size: 58, smallest: 38, width, most: 1 }
  const small = { weight: '600', size: 32, smallest: 28, width, most: 2 }
  const line = contact.preview || contact.description || 'Message unavailable'
  write(
    g,
    [
      { ...fit(g, contact.name, heading), color: INK },
      { ...fit(g, line.replace(/<\/?s>/g, ''), small), color: theme.deep },
    ],
    x,
    (y + radius + HEIGHT) / 2,
    width,
  )
  border(g)
}
