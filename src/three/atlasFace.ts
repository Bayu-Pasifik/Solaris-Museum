import type { Land } from '../lib/atlas'
import { colorsOf } from '../lib/atlas'
import { fit, INK, write } from './lettering'

export const CARD = { width: 768, height: 512 }

/** The picture of an area as it stands on its easel, with the name along the lower edge. */
export function drawCard(g: CanvasRenderingContext2D, land: Land, picture?: HTMLImageElement) {
  const { width, height } = CARD
  const { deep, accent, pale } = colorsOf(land)
  const foot = 108
  g.fillStyle = '#fff8e6'
  g.fillRect(0, 0, width, height)

  const [x, y, w, h] = [18, 18, width - 36, height - foot - 24]
  const sky = g.createLinearGradient(x, y, x + w, y + h)
  sky.addColorStop(0, deep)
  sky.addColorStop(1, accent)
  g.fillStyle = sky
  g.fillRect(x, y, w, h)
  if (picture) {
    // The picture fills the frame, and loses what does not fit.
    const scale = Math.max(w / picture.width, h / picture.height)
    const [sw, sh] = [w / scale, h / scale]
    g.drawImage(picture, (picture.width - sw) / 2, (picture.height - sh) / 2, sw, sh, x, y, w, h)
  }
  g.strokeStyle = INK
  g.lineWidth = 6
  g.strokeRect(x, y, w, h)

  const heading = { weight: 'italic 800', size: 52, smallest: 30, width: width - 80, most: 2 }
  write(g, [{ ...fit(g, land.name, heading), color: INK }], width / 2, height - foot / 2, width - 80)

  g.strokeStyle = pale
  g.lineWidth = 8
  g.strokeRect(8, 8, width - 16, height - 16)
  g.strokeStyle = INK
  g.lineWidth = 6
  g.strokeRect(3, 3, width - 6, height - 6)
}
