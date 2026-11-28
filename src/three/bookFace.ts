import type { ElementTheme } from '../lib/elements'
import type { Story } from '../lib/stories'
import { fit, INK, write } from './lettering'

const TRIM = '#ffc85a'

export const SPINE = { width: 128, height: 384 }
export const COVER = { width: 384, height: 512 }

/** The back of a story book: the name from top to bottom, between two golden bands. */
export function drawSpine(g: CanvasRenderingContext2D, story: Story, theme: ElementTheme) {
  const { width, height } = SPINE
  g.fillStyle = theme.deep
  g.fillRect(0, 0, width, height)
  g.fillStyle = TRIM
  for (const y of [18, height - 30]) g.fillRect(0, y, width, 12)
  g.strokeStyle = INK
  g.lineWidth = 8
  g.strokeRect(0, 0, width, height)

  g.save()
  g.translate(width / 2, height / 2)
  g.rotate(Math.PI / 2)
  const style = { weight: 'italic 800', size: 40, smallest: 28, width: height - 90, most: 2 }
  write(g, [{ ...fit(g, story.name, style), color: '#ffffff' }], 0, 0, style.width)
  g.restore()
}

/** The front of a story book: the picture, or rings in the color of the category, and the name. */
export function drawBookCover(
  g: CanvasRenderingContext2D,
  story: Story,
  theme: ElementTheme,
  picture?: HTMLImageElement,
) {
  const { width, height } = COVER
  g.fillStyle = theme.deep
  g.fillRect(0, 0, width, height)

  const frame = { x: 30, y: 30, w: width - 60, h: 230 }
  g.save()
  g.beginPath()
  g.rect(frame.x, frame.y, frame.w, frame.h)
  g.clip()
  g.fillStyle = theme.accent
  g.fillRect(frame.x, frame.y, frame.w, frame.h)
  if (picture) {
    // Fill the frame and cut what sticks out.
    const scale = Math.max(frame.w / picture.width, frame.h / picture.height)
    const [w, h] = [picture.width * scale, picture.height * scale]
    g.drawImage(picture, frame.x + (frame.w - w) / 2, frame.y + (frame.h - h) / 2, w, h)
  } else {
    g.strokeStyle = '#ffffff66'
    g.lineWidth = 8
    for (const radius of [45, 90, 135]) {
      g.beginPath()
      g.arc(width / 2, frame.y + frame.h / 2, radius, 0, Math.PI * 2)
      g.stroke()
    }
  }
  g.restore()

  g.strokeStyle = TRIM
  g.lineWidth = 8
  g.strokeRect(frame.x, frame.y, frame.w, frame.h)
  g.strokeRect(14, 14, width - 28, height - 28)

  const inner = width - 80
  const title = { weight: 'italic 800', size: 44, smallest: 28, width: inner, most: 4 }
  const chapter = { weight: '600', size: 24, smallest: 20, width: inner, most: 2 }
  write(
    g,
    [
      { ...fit(g, story.name, title), color: '#ffffff' },
      { ...fit(g, story.group, chapter), color: theme.pale },
    ],
    width / 2,
    (frame.y + frame.h + height - 14) / 2,
    inner,
  )
}
