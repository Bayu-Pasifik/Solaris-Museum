import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, Vector3 } from 'three'
import type { ElementTheme } from '../lib/elements'
import type { Story } from '../lib/stories'
import Bookshelves from './Bookshelves'
import Museum from './Museum'
import Podium from './Podium'
import StoryCard from './StoryCard'

export const LIBRARY_FOV = 40
const SLOPE = Math.tan(MathUtils.degToRad(LIBRARY_FOV / 2))
/** Cards on each side of the chosen one. */
const REACH = 4

/** Keeps the chosen card in view and follows the pointer a little. */
function CameraRig() {
  const goal = useRef(new Vector3())

  useFrame(({ camera, size, pointer }, delta) => {
    const calm = window.SakugaFX?.calm
    const aspect = size.width / size.height
    // Half the width that must fit on screen, at the depth of the chosen card.
    const half = aspect < 1.1 ? 1.45 : 3.4
    const distance = MathUtils.clamp(half / (SLOPE * aspect), 4.8, 9)
    const sway = calm ? 0 : 1
    goal.current.set(pointer.x * 0.35 * sway, 1.9 + pointer.y * 0.2 * sway, 0.5 + distance)
    camera.position.lerp(goal.current, calm ? 1 : 1 - Math.exp(-3 * Math.min(delta, 0.05)))
    camera.lookAt(0, 1.5, 0)
  })

  return null
}

type Props = {
  /** The stories of one category, in order. */
  stories: Story[]
  /** Index of the chosen story. */
  current: number
  theme: ElementTheme
  onSelect: (id: string) => void
  onHover: (over: boolean) => void
}

/** The archive room: a row of story panels that turns around the chosen one. */
export default function LibraryScene({ stories, current, theme, onSelect, onHover }: Props) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 5, 4]} intensity={1.8} />
      <Museum carpet={theme.accent} />
      <Bookshelves />

      <group position={[0, 0.13, 0.5]} scale={1.3}>
        <Podium theme={theme} />
      </group>

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

      <CameraRig />
    </>
  )
}
