import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, Object3D, SRGBColorSpace, type InstancedMesh } from 'three'
import type { ElementTheme } from '../lib/elements'

const COUNT = 46
/** Height of the column that the particles move in. */
const HEIGHT = 2.1
const SIZE = 128

type Seed = { angle: number; radius: number; y: number; speed: number; size: number; phase: number }

type Pose = { angle: number; radius: number; y: number; roll: number; scale: number }

/** A number from 0 to 1 that stays inside the column. */
const wrap = (value: number) => ((value % 1) + 1) % 1
/** Shrinks a particle to nothing at both ends of its path, so it never pops in or out. */
const fade = (progress: number) => Math.min(1, Math.sin(progress * Math.PI) * 1.8)

/** How each element moves. `t` is the time in seconds. */
const motions: Record<string, (s: Seed, t: number) => Pose> = {
  // Embers rise and sway.
  Fusion: (s, t) => {
    const p = wrap(s.y + t * 0.2 * s.speed)
    const sway = Math.sin(t * 3 + s.phase)
    return {
      angle: s.angle + sway * 0.08,
      radius: s.radius,
      y: p * HEIGHT,
      roll: sway * 0.35,
      scale: fade(p) * (1 - p * 0.5),
    }
  },
  // Ice falls slowly and turns.
  Glacio: (s, t) => {
    const p = wrap(s.y - t * 0.09 * s.speed)
    return {
      angle: s.angle + t * 0.08,
      radius: s.radius,
      y: p * HEIGHT,
      roll: s.phase + t * 0.7 * (s.speed - 1),
      scale: fade(p),
    }
  },
  // Wind streaks circle the character.
  Aero: (s, t) => {
    const p = wrap(s.angle / (Math.PI * 2) + t * 0.22 * s.speed)
    return {
      angle: p * Math.PI * 2,
      radius: s.radius,
      y: s.y * HEIGHT + Math.sin(t * 1.6 + s.phase) * 0.08,
      roll: Math.sin(t * 1.6 + s.phase + 1.5) * 0.25,
      scale: 1.5,
    }
  },
  // Sparks jump to a new place a few times a second.
  Electro: (s, t) => {
    const frame = t * 3 * s.speed + s.phase
    const step = Math.floor(frame)
    const jump = wrap(Math.sin(step * 12.9898 + s.phase) * 43758.5453)
    return {
      angle: s.angle + jump * 2,
      radius: s.radius,
      y: wrap(s.y + jump) * HEIGHT,
      roll: (jump - 0.5) * 2.4,
      scale: frame - step < 0.55 ? 1.2 : 0,
    }
  },
  // Motes of light drift up and twinkle.
  Spectro: (s, t) => {
    const p = wrap(s.y + t * 0.06 * s.speed)
    return {
      angle: s.angle + t * 0.1,
      radius: s.radius,
      y: p * HEIGHT,
      roll: 0,
      scale: fade(p) * (0.35 + Math.abs(Math.sin(t * 2.2 * s.speed + s.phase))),
    }
  },
  // Dark shards are pulled around, against the usual direction.
  Havoc: (s, t) => {
    const p = wrap(s.y + t * 0.08 * s.speed)
    return {
      angle: s.angle - t * 0.45 * s.speed,
      radius: s.radius * (1.1 - p * 0.35),
      y: p * HEIGHT,
      roll: s.phase - t * 1.2,
      scale: fade(p),
    }
  },
}

type Point = [number, number]

function polygon(g: CanvasRenderingContext2D, points: Point[]) {
  g.beginPath()
  points.forEach(([x, y], index) => (index ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
}

/** One closed outline per element, drawn around the center of a SIZE x SIZE canvas. */
const shapes: Record<string, (g: CanvasRenderingContext2D) => void> = {
  Fusion: (g) => {
    g.beginPath()
    g.moveTo(68, 8)
    g.bezierCurveTo(70, 40, 106, 56, 100, 86)
    g.bezierCurveTo(96, 128, 32, 128, 28, 86)
    g.bezierCurveTo(26, 66, 42, 56, 46, 40)
    g.bezierCurveTo(54, 52, 56, 56, 60, 60)
    g.bezierCurveTo(68, 44, 70, 28, 68, 8)
  },
  Glacio: (g) =>
    polygon(g, [
      [64, 6],
      [92, 40],
      [84, 96],
      [64, 122],
      [44, 96],
      [36, 40],
    ]),
  Aero: (g) => {
    g.beginPath()
    g.moveTo(6, 76)
    g.quadraticCurveTo(64, 18, 122, 56)
    g.quadraticCurveTo(66, 48, 6, 76)
  },
  Electro: (g) =>
    polygon(g, [
      [76, 6],
      [34, 70],
      [60, 70],
      [46, 122],
      [96, 52],
      [68, 52],
    ]),
  Spectro: (g) => {
    g.beginPath()
    g.moveTo(64, 4)
    g.quadraticCurveTo(70, 58, 124, 64)
    g.quadraticCurveTo(70, 70, 64, 124)
    g.quadraticCurveTo(58, 70, 4, 64)
    g.quadraticCurveTo(58, 58, 64, 4)
  },
  Havoc: (g) =>
    polygon(g, [
      [64, 6],
      [82, 52],
      [116, 78],
      [70, 82],
      [44, 120],
      [40, 70],
      [14, 40],
      [52, 46],
    ]),
}

/** Draws a shape in the outlined anime style: colored fill, light core and a white edge. */
function drawTexture(element: string, theme: ElementTheme) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const g = canvas.getContext('2d')!
  const shape = shapes[element] ?? shapes.Spectro
  // Havoc is dark inside with a bright edge, the others are the reverse.
  const dark = element === 'Havoc'

  g.lineJoin = 'round'
  shape(g)
  g.strokeStyle = dark ? theme.accent : '#ffffff'
  g.lineWidth = 9
  g.stroke()
  g.fillStyle = dark ? theme.deep : theme.accent
  g.fill()
  g.save()
  g.translate(SIZE / 2, SIZE / 2)
  g.scale(0.5, 0.5)
  g.translate(-SIZE / 2, -SIZE / 2 + 10)
  shape(g)
  g.fillStyle = dark ? '#12031a' : theme.pale
  g.fill()
  g.restore()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export default function ElementParticles({
  element,
  theme,
}: {
  element: string
  theme: ElementTheme
}) {
  const mesh = useRef<InstancedMesh>(null)
  const texture = useMemo(() => drawTexture(element, theme), [element, theme])
  useEffect(() => () => texture.dispose(), [texture])

  const { seeds, dummy } = useMemo(
    () => ({
      dummy: new Object3D(),
      // Golden-angle steps spread the particles evenly; the rest is random.
      seeds: Array.from({ length: COUNT }, (_, index): Seed => ({
        angle: (index * 2.39996) % (Math.PI * 2),
        radius: 0.58 + Math.random() * 0.75,
        y: Math.random(),
        speed: 0.6 + Math.random() * 0.9,
        size: 0.055 + Math.random() ** 2 * 0.095,
        phase: Math.random() * Math.PI * 2,
      })),
    }),
    [],
  )

  useFrame(({ camera, clock }) => {
    if (!mesh.current) return
    const move = motions[element] ?? motions.Spectro
    // With reduced motion the particles stay where they start.
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    seeds.forEach((seed, index) => {
      const pose = move(seed, time)
      dummy.position.set(Math.cos(pose.angle) * pose.radius, pose.y, Math.sin(pose.angle) * pose.radius)
      // Face the camera, then roll around the view direction.
      dummy.quaternion.copy(camera.quaternion)
      dummy.rotateZ(pose.roll)
      dummy.scale.setScalar(seed.size * pose.scale)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(index, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent alphaTest={0.05} depthWrite={false} />
    </instancedMesh>
  )
}
