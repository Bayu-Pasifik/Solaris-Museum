import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { ElementTheme } from '../lib/elements'
import type { Insets } from '../lib/insets'
import type { Story } from '../lib/stories'
import ArchiveHall from './ArchiveHall'
import Drift from './Drift'
import Podium from './Podium'
import StoryCard from './StoryCard'

export const LIBRARY_FOV = 45
const SLOPE = Math.tan(MathUtils.degToRad(LIBRARY_FOV / 2))
/** Cards on each side of the chosen one. */
const REACH = 4

/**
 * Keeps the chosen card in the free part of the screen, between the bars and beside the open
 * reader, and follows the pointer a little.
 */
function CameraRig({ insets }: { insets: Insets }) {
  const goal = useRef(new Vector3())
  const slide = useRef<{ x: number; y: number }>(null)

  useFrame(({ camera, size, pointer }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const calm = window.SakugaFX?.calm
    const aspect = size.width / size.height
    const free = {
      width: Math.max((size.width - insets.right) / size.width, 0.2),
      height: Math.max((size.height - insets.top - insets.bottom) / size.height, 0.2),
    }
    // Half the width and height that must fit, at the depth of the chosen card.
    const wide = aspect * free.width > 1.1
    const distance = MathUtils.clamp(
      Math.max(
        (wide ? 3.5 : 1.45) / (SLOPE * aspect * free.width),
        1.75 / (SLOPE * free.height),
      ),
      5,
      13,
    )
    const sway = calm ? 0 : 1
    goal.current.set(
      pointer.x * 0.9 * sway,
      2.5 + pointer.y * 0.45 * sway,
      0.5 + distance,
    )
    const ease = calm ? 1 : 1 - Math.exp(-3 * Math.min(delta, 0.05))
    camera.position.lerp(goal.current, ease)
    camera.lookAt(0, 1.75, 0)

    // The picture slides to the middle of the free part.
    const x = insets.right / 2
    const y = (insets.bottom - insets.top) / 2
    const at = (slide.current ??= { x, y })
    at.x += (x - at.x) * ease
    at.y += (y - at.y) * ease
    camera.setViewOffset(size.width, size.height, at.x, at.y, size.width, size.height)
  })

  return null
}

type Props = {
  /** The stories of one category, in order. */
  stories: Story[]
  /** Index of the chosen story. */
  current: number
  theme: ElementTheme
  insets: Insets
  /** A click on a card: another story is chosen, and the chosen one is opened. */
  onSelect: (id: string) => void
  onHover: (over: boolean) => void
}

/** The archive room: a library hall with a ring of story panels around the chosen one. */
export default function LibraryScene({
  stories,
  current,
  theme,
  insets,
  onSelect,
  onHover,
}: Props) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-3, 6, 5]} intensity={1.6} />
      <pointLight position={[0, 5, -5]} intensity={30} color="#ffd9a0" />
      <ArchiveHall accent={theme.accent} />
      <Drift />

      <group position={[0, 0.13, 0.5]} scale={1.3}>
        <Podium theme={theme} />
      </group>

      {/* A new category gets new panels instead of sliding the old ones. */}
      <group key={stories[0]?.category}>
        {stories.map((story, index) => {
          const offset = index - current
          return (
            Math.abs(offset) <= REACH && (
              <StoryCard
                key={story.id}
                story={story}
                theme={theme}
                offset={offset}
                onClick={() => onSelect(story.id)}
                onHover={onHover}
              />
            )
          )
        })}
      </group>

      <CameraRig insets={insets} />
    </>
  )
}
