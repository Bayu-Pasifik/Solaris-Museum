import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, RepeatWrapping, type Group, type MeshBasicMaterial, type Mesh } from 'three'
import Boxes, { type Box } from './Boxes'
import { noise, paintGlow, usePainting } from './painting'

/** Color of the night air. */
const SKY = '#241d5c'
const TRIM = '#ffc85a'
const BUBBLES = ['#8f8df7', '#ff5fa8', '#4fb3ff', '#45d38a']
const MAST: [number, number, number] = [0, 0, -13]

/** Square tiles with a thin joint. */
function paintTiles(g: CanvasRenderingContext2D, size: number) {
  g.fillStyle = '#5a50aa'
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#6c62bd'
  g.fillRect(0, 0, size / 2, size / 2)
  g.fillRect(size / 2, size / 2, size / 2, size / 2)
  g.strokeStyle = '#2c2570'
  g.lineWidth = 4
  for (const at of [0, size / 2, size]) {
    g.strokeRect(at, -4, 0, size + 8)
    g.strokeRect(-4, at, size + 8, 0)
  }
}

/** A speech bubble with three dots. */
const paintBubble = (color: string) => (g: CanvasRenderingContext2D, size: number) => {
  const unit = size / 128
  g.fillStyle = color
  g.strokeStyle = '#ffffff'
  g.lineWidth = 6 * unit
  g.beginPath()
  g.roundRect(10 * unit, 24 * unit, 108 * unit, 70 * unit, 30 * unit)
  g.fill()
  g.stroke()
  g.beginPath()
  g.moveTo(34 * unit, 92 * unit)
  g.lineTo(26 * unit, 114 * unit)
  g.lineTo(58 * unit, 94 * unit)
  g.fill()
  g.fillStyle = '#ffffff'
  for (const x of [40, 64, 88]) {
    g.beginPath()
    g.arc(x * unit, 59 * unit, 8 * unit, 0, Math.PI * 2)
    g.fill()
  }
}

/** One bubble that rises from the roof, again and again. */
function Bubble({ index }: { index: number }) {
  const paint = useMemo(() => paintBubble(BUBBLES[index % BUBBLES.length]), [index])
  const texture = usePainting(128, paint)
  const body = useRef<Group>(null)
  const x = (index % 2 ? 1 : -1) * (3 + noise(index + 4) * 4.5)
  const z = -6 + noise(index + 44) * 4.5
  const size = 0.55 + noise(index + 84) * 0.45

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    const rise = (noise(index + 124) + time * (0.03 + noise(index + 164) * 0.03)) % 1
    body.current?.position.set(x + Math.sin(time * 0.6 + index) * 0.25, 0.4 + rise * 7, z)
    // It grows out of nothing and fades away at the top.
    body.current?.scale.setScalar(Math.min(rise * 6, (1 - rise) * 4, 1))
  })

  return (
    <group ref={body}>
      <sprite scale={[size, size, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

/** The radio mast behind the roof, which sends out rings. */
function Mast({ accent }: { accent: string }) {
  const rings = useRef<Group>(null)
  const glow = usePainting(128, paintGlow)

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0.2 : clock.elapsedTime * 0.35
    rings.current?.children.forEach((child, index) => {
      const ring = child as Mesh
      const age = (time + index / 3) % 1
      ring.scale.setScalar(0.4 + age * 4.5)
      ;(ring.material as MeshBasicMaterial).opacity = 1 - age
    })
  })

  return (
    <group position={MAST}>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.05, 0.7, 6.4, 4, 5, true]} />
        <meshBasicMaterial color={TRIM} wireframe />
      </mesh>
      <mesh position={[0, 6.5, 0]}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshBasicMaterial color="#fff2b8" />
      </mesh>
      <sprite position={[0, 6.5, 0]} scale={[2.6, 2.6, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <group ref={rings} position={[0, 6.5, 0]}>
        {[0, 1, 2].map((ring) => (
          <mesh key={ring}>
            <ringGeometry args={[0.95, 1, 64]} />
            <meshBasicMaterial color={accent} transparent depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Towers of the city with their lit windows, in two rows behind the roof. */
function city() {
  const towers: Box[] = []
  const windows: Box[] = []
  let seed = 1
  const next = () => noise(seed++)
  for (const [depth, color] of [
    [-19, '#3a3188'],
    [-27, '#312a74'],
  ] as const) {
    for (let x = -30; x < 30; ) {
      const width = 1.8 + next() * 2.2
      // Low in the middle, so the mast and the moon stay in sight.
      const height = (Math.abs(x) < 6 ? 2.5 : 4) + next() * (depth < -20 ? 9 : 6)
      const z = depth - next() * 2
      towers.push({ position: [x + width / 2, height / 2 - 2, z], size: [width, height, 1.5], color })
      for (let column = 0.35; column < width - 0.3; column += 0.5) {
        for (let y = -0.6; y < height - 2.5; y += 0.6) {
          if (next() < 0.65) continue
          windows.push({
            position: [x + column + 0.05, y, z + 0.76],
            size: [0.22, 0.3, 0.02],
            color: next() < 0.75 ? '#ffd36b' : '#8ff0ff',
          })
        }
      }
      x += width + 0.3 + next() * 0.8
    }
  }
  return { towers, windows }
}

/** The railing at the edge of the roof. */
function railing() {
  const boxes: Box[] = [
    { position: [0, 1.15, -9], size: [24, 0.12, 0.16], color: TRIM },
    { position: [0, 0.6, -9], size: [24, 0.06, 0.08], color: '#b8b3ff' },
    { position: [0, 0.14, -9], size: [24, 0.28, 0.4], color: '#2c2570' },
  ]
  for (let x = -12; x <= 12; x += 1.2) {
    boxes.push({ position: [x, 0.6, -9], size: [0.1, 1.1, 0.1], color: '#b8b3ff' })
  }
  return boxes
}

/** A roof above the city at night, where the messages come in. */
export default function Rooftop({ accent }: { accent: string }) {
  const tiles = usePainting(256, paintTiles)
  tiles.wrapS = tiles.wrapT = RepeatWrapping
  tiles.repeat.set(10, 5.5)
  const glow = usePainting(256, paintGlow)
  const { towers, windows } = useMemo(city, [])
  const rail = useMemo(railing, [])
  const stars = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: 260 }, (_, index) => [
          (noise(index + 1) - 0.5) * 70,
          5 + noise(index + 500) * 22,
          -32,
        ]).flat(),
      ),
    [],
  )

  return (
    <group>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 16, 48]} />

      <mesh position={[0, 0, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 22]} />
        <meshBasicMaterial map={tiles} />
      </mesh>
      <mesh position={[0, 0.01, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.55, 1.68, 64]} />
        <meshBasicMaterial color={accent} />
      </mesh>

      <points raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#fff6d0" size={0.18} fog={false} />
      </points>
      <group position={[5.2, 7.2, -18]}>
        <mesh>
          <circleGeometry args={[0.95, 48]} />
          <meshBasicMaterial color="#fff2c8" fog={false} />
        </mesh>
        <sprite scale={[6, 6, 1]}>
          <spriteMaterial
            map={glow}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            fog={false}
          />
        </sprite>
      </group>

      <Boxes boxes={towers} />
      <Boxes boxes={windows} lit />
      <Boxes boxes={rail} />
      <Mast accent={accent} />
      {Array.from({ length: 14 }, (_, index) => (
        <Bubble key={index} index={index} />
      ))}
    </group>
  )
}
