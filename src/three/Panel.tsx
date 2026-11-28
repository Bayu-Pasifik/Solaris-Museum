import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { assetUrl } from '../lib/characters'
import type { ElementTheme } from '../lib/elements'
import { HEIGHT, INK, WIDTH } from './lettering'

const SIZE = { width: 2.4, height: (2.4 * HEIGHT) / WIDTH }

/** Paints the face of a panel. The picture is missing until it arrives. */
export type Painter<T> = (
  g: CanvasRenderingContext2D,
  item: T,
  theme: ElementTheme,
  picture?: HTMLImageElement,
) => void

/** What every item of a ring has; "picture" is a path inside public/. */
export type Item = { id: string | number; picture?: string }

function useFace<T extends Item>(item: T, theme: ElementTheme, paint: Painter<T>) {
  const face = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const g = canvas.getContext('2d')!
    paint(g, item, theme)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    return { g, texture }
  }, [item, theme, paint])

  // The picture is painted over the plain face when it arrives. A missing one stays plain.
  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      paint(face.g, item, theme, image)
      face.texture.needsUpdate = true
    }
    if (item.picture) image.src = assetUrl(item.picture)
    return () => {
      image.onload = null
      face.texture.dispose()
    }
  }, [face, item, theme, paint])

  return face.texture
}

/** Where a panel stands, counted in places from the middle one. */
function spot(offset: number) {
  const side = Math.sign(offset)
  const far = Math.abs(offset)
  return {
    x: side ? side * (1.75 + (far - 1) * 0.95) : 0,
    z: side ? -0.7 - far * 0.55 : 0.5,
    turn: -side * 0.62,
  }
}

type Props<T> = {
  item: T
  theme: ElementTheme
  paint: Painter<T>
  offset: number
  onClick: () => void
  onHover: (over: boolean) => void
}

/** One standing panel. It slides to its new place when the choice changes. */
export default function Panel<T extends Item>({
  item,
  theme,
  paint,
  offset,
  onClick,
  onHover,
}: Props<T>) {
  const texture = useFace(item, theme, paint)
  const body = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)
  const current = offset === 0

  // A new panel starts one place further out and slides in.
  const [start] = useState(() => spot(offset + Math.sign(offset)))
  useLayoutEffect(() => {
    body.current?.position.set(start.x, 0, start.z)
    body.current?.rotation.set(0, start.turn, 0)
  }, [start])

  useFrame(({ clock }, delta) => {
    const panel = body.current
    if (!panel) return
    const calm = window.SakugaFX?.calm
    const goal = spot(offset)
    const ease = calm ? 1 : 1 - Math.exp(-8 * Math.min(delta, 0.05))
    const lift = current ? (calm ? 0 : Math.sin(clock.elapsedTime * 1.4) * 0.04) : 0
    panel.position.x += (goal.x - panel.position.x) * ease
    panel.position.z += (goal.z - panel.position.z) * ease
    panel.position.y += (lift + (hovered && !current ? 0.12 : 0) - panel.position.y) * ease
    panel.rotation.y += (goal.turn - panel.rotation.y) * ease
  })

  const over = (value: boolean) => {
    setHovered(value)
    onHover(value)
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
          // A swipe to the next panel also ends in a click.
          if (event.delta <= 6) onClick()
        }}
      >
        <mesh>
          <boxGeometry args={[SIZE.width + 0.05, SIZE.height + 0.05, 0.1]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <mesh position={[0, 0, 0.052]}>
          <planeGeometry args={[SIZE.width, SIZE.height]} />
          <meshBasicMaterial map={texture} />
        </mesh>
        {/* The hard drop shadow of the page, as a slab behind the panel. */}
        <mesh position={[0.1, -0.11, -0.09]}>
          <boxGeometry args={[SIZE.width, SIZE.height, 0.04]} />
          <meshBasicMaterial color={theme.accent} />
        </mesh>
      </group>
    </group>
  )
}
