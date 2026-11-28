import type { ElementTheme } from '../lib/elements'
import type { Story } from '../lib/stories'
import { border, fit, HEIGHT, INK, WIDTH, write } from './lettering'

/** The picture area: 16:9 inside a white margin. */
const FRAME = { x: 20, y: 20, w: 728, h: 410 }

/** The front of a story panel: the picture with the title below, or a colored cover. */
export function drawCover(
  g: CanvasRenderingContext2D,
  story: Story,
  theme: ElementTheme,
  picture?: HTMLImageElement,
) {
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, WIDTH, HEIGHT)

  const { x, y, w, h } = FRAME
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  const sky = g.createLinearGradient(x, y, x + w, y + h)
  sky.addColorStop(0, theme.deep)
  sky.addColorStop(1, theme.accent)
  g.fillStyle = sky
  g.fillRect(x, y, w, h)

  if (picture) {
    // Fill the frame and cut what sticks out.
    const scale = Math.max(w / picture.width, h / picture.height)
    const [pw, ph] = [picture.width * scale, picture.height * scale]
    g.drawImage(picture, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph)
  } else if (!story.picture) {
    g.strokeStyle = '#ffffff55'
    g.lineWidth = 10
    for (const radius of [110, 180, 260]) {
      g.beginPath()
      g.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2)
      g.stroke()
    }
    const style = { weight: 'italic 800', size: 64, smallest: 40, width: w - 100, most: 4 }
    const name = { ...fit(g, story.name, style), color: '#ffffff' }
    write(g, [name], x + w / 2, y + h / 2, style.width)
  }
  g.restore()

  g.strokeStyle = INK
  g.lineWidth = 6
  g.strokeRect(x, y, w, h)
  border(g)

  // A cover already shows the name, so only the chapter goes below it.
  const width = WIDTH - 60
  const heading = { weight: 'italic 800', size: 36, smallest: 28, width, most: 2 }
  const title = story.picture ? { ...fit(g, story.name, heading), color: INK } : undefined
  // A title on two lines leaves room for one line less.
  const most = title?.lines.length === 2 ? 2 : 3
  const small = { weight: '600', size: 26, smallest: 22, width, most }
  let chapter = fit(g, story.subtitle || story.group, small)
  // Some subtitles are whole paragraphs. The reader shows those; the panel names the group.
  if (!chapter.whole) chapter = fit(g, story.group, small)
  const below = [...(title ? [title] : []), { ...chapter, color: theme.deep }]
  // The middle of the white band between the picture and the lower border.
  write(g, below, WIDTH / 2, (y + h + HEIGHT) / 2, width)
}
