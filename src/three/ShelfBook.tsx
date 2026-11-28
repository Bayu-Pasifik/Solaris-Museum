import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, MathUtils, SRGBColorSpace, type Group } from 'three'
import { assetUrl } from '../lib/characters'
import type { ElementTheme } from '../lib/elements'
import type { Place } from '../lib/shelves'
import type { Story } from '../lib/stories'
import { COVER, drawBookCover, drawSpine, SPINE } from './bookFace'
import { INK } from './lettering'

/** Height of the board that the story books stand on. */
export const BOARD = 0.98
/** Depth into the shelf, height and thickness of a story book. */
const DEPTH = 0.54
const HEIGHT = 0.72
const THICK = 0.3
/** How far a chosen book comes out of the shelf. */
const PULL = 0.72

type Painter = (
  g: CanvasRenderingContext2D,
  story: Story,
  theme: ElementTheme,
  picture?: HTMLImageElement,
) => void

function useCanvas(
  story: Story,
  theme: ElementTheme,
  size: { width: number; height: number },
  paint: Painter,
) {
  const face = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const g = canvas.getContext('2d')!
    paint(g, story, theme)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return { g, texture }
  }, [story, theme, size, paint])
  useEffect(() => () => face.texture.dispose(), [face])
  return face
}

/** The front cover, which is only painted for a book that is out of the shelf. */
function Cover({ story, theme }: { story: Story; theme: ElementTheme }) {
  const face = useCanvas(story, theme, COVER, drawBookCover)

  // The picture is painted over the plain cover when it arrives. A missing one stays plain.
  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      drawBookCover(face.g, story, theme, image)
      face.texture.needsUpdate = true
    }
    if (story.picture) image.src = assetUrl(story.picture)
    return () => {
      image.onload = null
    }
  }, [face, story, theme])

  return (
    <mesh position={[0, 0, THICK / 2 + 0.002]} raycast={() => null}>
      <planeGeometry args={[DEPTH, HEIGHT]} />
      <meshBasicMaterial map={face.texture} />
    </mesh>
  )
}

type Props = {
  story: Story
  theme: ElementTheme
  place: Place
  /** True while the visitor looks at it; it then comes out and shows its cover. */
  out: boolean
  onPick: () => void
}

/** The book of a story in its place on a wall of the aisle. */
export default function ShelfBook({ story, theme, place, out, onPick }: Props) {
  const spine = useCanvas(story, theme, SPINE, drawSpine)
  const body = useRef<Group>(null)
  const { side, x, z } = place
  const pulled = useRef(0)

  useFrame((_, delta) => {
    if (!body.current) return
    const goal = out ? 1 : 0
    pulled.current = window.SakugaFX?.calm
      ? goal
      : MathUtils.damp(pulled.current, goal, 9, Math.min(delta, 0.05))
    const at = pulled.current
    body.current.position.x = x - side * PULL * at
    // The cover turns to the aisle.
    body.current.rotation.y = (-side * at * Math.PI) / 2
    body.current.position.y = BOARD + HEIGHT / 2 + 0.06 * at
  })

  return (
    <group ref={body} position={[x, BOARD + HEIGHT / 2, z]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          // A drag that looks around also ends in a click.
          if (event.delta <= 6) onPick()
        }}
      >
        <boxGeometry args={[DEPTH - 0.01, HEIGHT - 0.01, THICK - 0.01]} />
        <meshBasicMaterial color={out ? theme.accent : INK} />
      </mesh>
      <mesh
        position={[(-side * DEPTH) / 2, 0, 0]}
        rotation={[0, (-side * Math.PI) / 2, 0]}
        raycast={() => null}
      >
        <planeGeometry args={[THICK, HEIGHT]} />
        <meshBasicMaterial map={spine.texture} />
      </mesh>
      {out && <Cover story={story} theme={theme} />}
    </group>
  )
}
