import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { Stage } from '../components/RingHall'
import type { ElementTheme } from '../lib/elements'
import type { Insets } from '../lib/insets'
import Panel, { type Item, type Painter } from './Panel'
import Podium from './Podium'

export const RING_FOV = 45
const SLOPE = Math.tan(MathUtils.degToRad(RING_FOV / 2))
/** Panels on each side of the chosen one. */
const REACH = 4

/**
 * Keeps the chosen panel in the free part of the screen, between the bars and beside the open
 * drawer, and follows the pointer a little.
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
    // Half the width and height that must fit, at the depth of the chosen panel.
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
    goal.current.set(pointer.x * 0.9 * sway, 2.5 + pointer.y * 0.45 * sway, 0.5 + distance)
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

type Props<T> = Stage & {
  /** The items of the open group, in order. */
  items: T[]
  /** Index of the chosen item. */
  current: number
  theme: ElementTheme
  paint: Painter<T>
  /** Name of the open group; a new group gets new panels instead of sliding the old ones. */
  group: string
}

/** The middle of every ring hall: the podium, the panels around it and the camera. */
export default function RingStage<T extends Item>({
  items,
  current,
  theme,
  paint,
  group,
  insets,
  onSelect,
  onHover,
}: Props<T>) {
  return (
    <>
      <group position={[0, 0.13, 0.5]} scale={1.3}>
        <Podium theme={theme} />
      </group>

      <group key={group}>
        {items.map((item, index) => {
          const offset = index - current
          return (
            Math.abs(offset) <= REACH && (
              <Panel
                key={item.id}
                item={item}
                theme={theme}
                paint={paint}
                offset={offset}
                onClick={() => onSelect(String(item.id))}
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
