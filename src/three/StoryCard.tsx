import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { assetUrl } from '../lib/characters'
import type { ElementTheme } from '../lib/elements'
import type { Story } from '../lib/stories'

const INK = '#1d1a4a'
const FONT = "'Avenir Next', Nunito, 'Segoe UI', system-ui, sans-serif"
const WIDTH = 768
const HEIGHT = 600
/** The picture area: 16:9 inside a white margin. */
const FRAME = { x: 20, y: 20, w: 728, h: 410 }
export const CARD = { width: 2.4, height: (2.4 * HEIGHT) / WIDTH }

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
function fit(g: CanvasRenderingContext2D, text: string, style: Style) {
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
function write(
  g: CanvasRenderingContext2D,
  blocks: (ReturnType<typeof fit> & { color: string })[],
  x: number,
  y: number,
  width: number,
) {
  const rows = blocks.flatMap((block) =>
    block.lines.map((text) => ({ ...block, text, height: block.size * 1.2 })),
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

/** The front of a card: the picture with the title below, or a colored cover with the name. */
function drawCover(
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
  g.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6)

  // A cover already shows the name, so only the chapter goes below it.
  const width = WIDTH - 60
  const heading = { weight: 'italic 800', size: 36, smallest: 28, width, most: 2 }
  const title = story.picture ? { ...fit(g, story.name, heading), color: INK } : undefined
  // A title on two lines leaves room for one line less.
  const most = title?.lines.length === 2 ? 2 : 3
  const small = { weight: '600', size: 26, smallest: 22, width, most }
  let chapter = fit(g, story.subtitle || story.group, small)
  // Some subtitles are whole paragraphs. The reader shows those; the card names the group.
  if (!chapter.whole) chapter = fit(g, story.group, small)
  const below = [...(title ? [title] : []), { ...chapter, color: theme.deep }]
  // The middle of the white band between the picture and the lower border.
  write(g, below, WIDTH / 2, (y + h + HEIGHT) / 2, width)
}

function useCover(story: Story, theme: ElementTheme) {
  const cover = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const g = canvas.getContext('2d')!
    drawCover(g, story, theme)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return { g, texture }
  }, [story, theme])

  // The picture is painted over the plain cover when it arrives. A missing one stays plain.
  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      drawCover(cover.g, story, theme, image)
      cover.texture.needsUpdate = true
    }
    if (story.picture) image.src = assetUrl(story.picture)
    return () => {
      image.onload = null
      cover.texture.dispose()
    }
  }, [cover, story, theme])

  return cover.texture
}

/** Where a card stands, counted in places from the middle one. */
function spot(offset: number) {
  const side = Math.sign(offset)
  const far = Math.abs(offset)
  return {
    x: side ? side * (1.75 + (far - 1) * 0.95) : 0,
    z: side ? -0.7 - far * 0.55 : 0.5,
    turn: -side * 0.62,
  }
}

type Props = {
  story: Story
  theme: ElementTheme
  offset: number
  onClick: () => void
  onHover: (over: boolean) => void
}

/** One story as a standing panel. It slides to its new place when the choice changes. */
export default function StoryCard({ story, theme, offset, onClick, onHover }: Props) {
  const texture = useCover(story, theme)
  const body = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)
  const current = offset === 0

  // A new card starts one place further out and slides in.
  const [start] = useState(() => spot(offset + Math.sign(offset)))
  useLayoutEffect(() => {
    body.current?.position.set(start.x, 0, start.z)
    body.current?.rotation.set(0, start.turn, 0)
  }, [start])

  useFrame(({ clock }, delta) => {
    const card = body.current
    if (!card) return
    const calm = window.SakugaFX?.calm
    const goal = spot(offset)
    const ease = calm ? 1 : 1 - Math.exp(-8 * Math.min(delta, 0.05))
    const lift = current ? (calm ? 0 : Math.sin(clock.elapsedTime * 1.4) * 0.04) : 0
    card.position.x += (goal.x - card.position.x) * ease
    card.position.z += (goal.z - card.position.z) * ease
    card.position.y += (lift + (hovered && !current ? 0.12 : 0) - card.position.y) * ease
    card.rotation.y += (goal.turn - card.rotation.y) * ease
  })

  const over = (value: boolean) => {
    setHovered(value)
    onHover(value && !current)
  }

  return (
    <group ref={body}>
      <group
        position={[0, 1.75, 0]}
        onPointerOver={(event) => {
          event.stopPropagation()
          over(true)
        }}
        onPointerOut={() => over(false)}
        onClick={(event) => {
          event.stopPropagation()
          if (!current) onClick()
        }}
      >
        <mesh>
          <boxGeometry args={[CARD.width + 0.05, CARD.height + 0.05, 0.1]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <mesh position={[0, 0, 0.052]}>
          <planeGeometry args={[CARD.width, CARD.height]} />
          <meshBasicMaterial map={texture} />
        </mesh>
        {/* The hard drop shadow of the page, as a slab behind the card. */}
        <mesh position={[0.1, -0.11, -0.09]}>
          <boxGeometry args={[CARD.width, CARD.height, 0.04]} />
          <meshBasicMaterial color={theme.accent} />
        </mesh>
      </group>
    </group>
  )
}
