/** Text helpers for the canvases that become the faces of the panels. */

export const INK = '#1d1a4a'
const FONT = "'Avenir Next', Nunito, 'Segoe UI', system-ui, sans-serif"
export const WIDTH = 768
export const HEIGHT = 600

/** Breaks a text into lines that fit the width. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  for (const word of text.split(/\s+/)) {
    const longer = lines.length ? `${lines[lines.length - 1]} ${word}` : word
    if (lines.length && g.measureText(longer).width <= width) lines[lines.length - 1] = longer
    else lines.push(word)
  }
  return lines
}

type Style = { weight: string; size: number; smallest: number; width: number; most: number }

/**
 * Picks the largest font at which the whole text fits the width and the number of lines.
 * A text that is still too long at the smallest size is cut, and "whole" is then false.
 */
export function fit(g: CanvasRenderingContext2D, text: string, style: Style) {
  const { weight, smallest, width, most } = style
  for (let size = style.size; ; size -= 2) {
    g.font = `${weight} ${size}px ${FONT}`
    const lines = wrap(g, text, width)
    const fits = lines.length <= most && lines.every((line) => g.measureText(line).width <= width)
    if (fits) return { lines, size, font: g.font, whole: true }
    if (size <= smallest) return { lines: lines.slice(0, most), size, font: g.font, whole: false }
  }
}

/** Draws the fitted blocks under each other, centered on a point. */
export function write(
  g: CanvasRenderingContext2D,
  blocks: (ReturnType<typeof fit> & { color: string })[],
  x: number,
  y: number,
  width: number,
) {
  const rows = blocks.flatMap((block) =>
    block.lines.map((text, at) => ({
      ...block,
      // A cut text ends with dots.
      text: !block.whole && at === block.lines.length - 1 ? `${text}…` : text,
      height: block.size * 1.2,
    })),
  )
  let top = y - rows.reduce((sum, row) => sum + row.height, 0) / 2
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const row of rows) {
    g.font = row.font
    g.fillStyle = row.color
    // The width only squeezes a single word that is wider than the card.
    g.fillText(row.text, x, top + row.height / 2, width)
    top += row.height
  }
}

/** The ink border around a whole face. */
export function border(g: CanvasRenderingContext2D) {
  g.strokeStyle = INK
  g.lineWidth = 6
  g.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6)
}
