import { useEffect, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { MathUtils, type CanvasTexture, type Group } from 'three'
import type { Hung } from '../lib/exhibits'
import { MARGIN, paint } from './pieceArt'

/** A drag that moves the wall also ends in a click. Pointer moves above this are drags. */
export const DRAG = 8

type Props = {
  item: Hung
  /** Radius of the wall that the piece hangs on. */
  radius: number
  edge: string
  picked: boolean
  hovered: boolean
  /** Seconds before the piece appears. */
  delay: number
  onHover?: (over: boolean) => void
  onPick?: () => void
}

/** One framed piece on the curved wall. It grows when pointed at and steps out when picked. */
export default function Frame({
  item,
  radius,
  edge,
  picked,
  hovered,
  delay,
  onHover,
  onPick,
}: Props) {
  const [texture, setTexture] = useState<CanvasTexture>()
  const body = useRef<Group>(null)
  const shown = useRef({ wait: delay, size: window.SakugaFX?.calm ? 1 : 0.3, velocity: 0 })

  useEffect(() => {
    let gone = false
    void paint(item, edge).then((result) => {
      if (gone) result.dispose()
      else setTexture(result)
    })
    return () => {
      gone = true
    }
    // The picture depends on what the piece is and how big it is, not on where it hangs.
  }, [item.piece.key, item.width, item.height, edge])

  // The old picture is freed only when the new one has taken its place.
  useEffect(() => () => texture?.dispose(), [texture])

  useFrame((_, delta) => {
    const group = body.current
    if (!group || !texture) return
    const step = Math.min(delta, 0.033)
    const calm = Boolean(window.SakugaFX?.calm)
    const spring = shown.current
    if (spring.wait > 0 && !calm) {
      spring.wait -= step
      group.visible = false
      return
    }
    group.visible = true
    const target = picked ? 1.12 : hovered ? 1.07 : 1
    if (calm) {
      spring.size = target
    } else {
      // A spring, so the piece overshoots when it grows.
      spring.velocity += (240 * (target - spring.size) - 17 * spring.velocity) * step
      spring.size += spring.velocity * step
    }
    group.scale.setScalar(spring.size)
    const out = picked ? 0.8 : hovered ? 0.35 : 0
    group.position.z = calm ? out : MathUtils.damp(group.position.z, out, 10, step)
  })

  const angle = item.x / radius

  return (
    // The wall is a cylinder around the middle of the hall, and every piece faces that middle.
    <group
      position={[Math.sin(angle) * radius, item.y, -Math.cos(angle) * radius]}
      rotation={[0, -angle, 0]}
    >
      <group ref={body} visible={false}>
        {texture && (
          <mesh
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              onHover?.(true)
            }}
            onPointerOut={() => onHover?.(false)}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              if (event.delta <= DRAG) onPick?.()
            }}
          >
            <planeGeometry args={[item.width + MARGIN * 2, item.height + MARGIN * 2]} />
            <meshBasicMaterial map={texture} transparent alphaTest={0.02} />
          </mesh>
        )}
      </group>
    </group>
  )
}
