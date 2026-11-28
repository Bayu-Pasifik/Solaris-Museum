import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, type Group } from 'three'
import Boxes, { type Box } from './Boxes'
import { noise, paintGlow, usePainting } from './painting'

/** Color of the night. */
const SKY = '#141038'
const GOLD = '#ffc85a'
const STONE = '#4c4396'
const CRYSTALS = ['#ff5fa8', '#4fb3ff', '#ffc21c', '#45d38a', '#b47aff']
const STARS = 700
const CENTER: [number, number, number] = [0, 4.6, -9]

/** The floor: a chart of the sky with rings, spokes and constellations. */
function paintChart(g: CanvasRenderingContext2D, size: number) {
  const middle = size / 2
  const circle = (radius: number) => {
    g.beginPath()
    g.arc(middle, middle, radius * middle, 0, Math.PI * 2)
  }
  g.fillStyle = '#2b2470'
  circle(1)
  g.fill()
  g.strokeStyle = '#6a5fc0'
  g.lineWidth = 3
  for (const radius of [0.96, 0.78, 0.6, 0.42, 0.24]) {
    circle(radius)
    g.stroke()
  }
  for (let spoke = 0; spoke < 24; spoke++) {
    const angle = (spoke / 24) * Math.PI * 2
    g.beginPath()
    g.moveTo(middle + Math.cos(angle) * middle * 0.24, middle + Math.sin(angle) * middle * 0.24)
    g.lineTo(middle + Math.cos(angle) * middle * 0.96, middle + Math.sin(angle) * middle * 0.96)
    g.stroke()
  }
  // Constellations: short chains of stars.
  g.strokeStyle = '#ffe9a8'
  g.fillStyle = '#fff6d0'
  g.lineWidth = 2
  for (let chain = 0; chain < 14; chain++) {
    const angle = (chain / 14) * Math.PI * 2
    const radius = middle * (0.32 + noise(chain + 5) * 0.55)
    let x = middle + Math.cos(angle) * radius
    let y = middle + Math.sin(angle) * radius
    const points = [[x, y]]
    for (let star = 0; star < 4; star++) {
      x += (noise(chain * 9 + star) - 0.5) * 120
      y += (noise(chain * 13 + star + 50) - 0.5) * 120
      points.push([x, y])
    }
    g.beginPath()
    for (const [px, py] of points) g.lineTo(px, py)
    g.stroke()
    for (const [px, py] of points) {
      g.beginPath()
      g.arc(px, py, 6, 0, Math.PI * 2)
      g.fill()
    }
  }
}

/**
 * The letters of the alphabet around a band. The canvas has the shape of the band, so the
 * letters keep their own shape.
 */
function paintLetters(g: CanvasRenderingContext2D, width: number) {
  const { height } = g.canvas
  g.fillStyle = GOLD
  g.fillRect(0, 0, width, 5)
  g.fillRect(0, height - 5, width, 5)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const place = width / letters.length
  g.font = `italic 800 ${height * 0.7}px 'Avenir Next', 'Segoe UI', sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const [index, letter] of [...letters].entries()) {
    g.fillText(letter, (index + 0.5) * place, height / 2)
  }
}

/** The great rings around a glowing star, turning slowly. */
function Armillary({ accent }: { accent: string }) {
  const rings = useRef<Group>(null)
  const glow = usePainting(256, paintGlow)
  const letters = usePainting(4096, paintLetters, 92)

  useFrame((_, delta) => {
    if (window.SakugaFX?.calm) return
    rings.current?.children.forEach((ring, index) => {
      ring.rotation.y += delta * (0.12 + index * 0.07) * (index % 2 ? -1 : 1)
    })
  })

  return (
    <group position={CENTER}>
      <mesh>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshToonMaterial color={accent} emissive={accent} emissiveIntensity={0.35} />
      </mesh>
      <sprite scale={[7, 7, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <group ref={rings}>
        {[2, 2.7, 3.4].map((radius, index) => (
          <group key={radius} rotation={[0, index, 0]}>
            <mesh rotation={[0.5 + index * 0.55, 0, index * 0.4]}>
              <torusGeometry args={[radius, 0.07, 8, 96]} />
              <meshToonMaterial color={index === 1 ? '#b8b3ff' : GOLD} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[0.12, 0, 0]}>
          <cylinderGeometry args={[4.4, 4.4, 0.62, 96, 1, true]} />
          {/* Only the near side shows; the far side would read backwards. */}
          <meshBasicMaterial map={letters} transparent fog={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Crystals that float at the sides and turn. */
function Crystals() {
  const group = useRef<Group>(null)
  const homes = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        x: (index % 2 ? 1 : -1) * (3.2 + noise(index + 2) * 4.5),
        y: 1.6 + noise(index + 31) * 5,
        z: -6 + noise(index + 63) * 5,
        size: 0.14 + noise(index + 95) * 0.2,
      })),
    [],
  )

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    group.current?.children.forEach((crystal, index) => {
      crystal.position.y = homes[index].y + Math.sin(time * 0.8 + index) * 0.25
      crystal.rotation.set(0.3, time * 0.5 + index, 0)
    })
  })

  return (
    <group ref={group}>
      {homes.map((home, index) => (
        <mesh key={index} position={[home.x, home.y, home.z]} scale={[1, 1.7, 1]}>
          <octahedronGeometry args={[home.size]} />
          <meshToonMaterial
            color={CRYSTALS[index % CRYSTALS.length]}
            emissive={CRYSTALS[index % CRYSTALS.length]}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  )
}

/** Pillars with golden heads in a half circle, and a low wall between them. */
function pillars() {
  const boxes: Box[] = []
  for (let place = -5; place <= 5; place++) {
    const angle = (place * 21 * Math.PI) / 180
    const at = (radius: number, y: number): [number, number, number] => [
      Math.sin(angle) * radius,
      y,
      -1 - Math.cos(angle) * radius,
    ]
    // The middle stays open for the rings.
    if (Math.abs(place) > 1) {
      const height = 4 + Math.abs(place) * 0.8
      boxes.push({ position: at(10, height / 2), size: [0.7, height, 0.7], turn: -angle, color: STONE })
      for (const y of [0.2, height]) {
        boxes.push({ position: at(10, y), size: [1, 0.3, 1], turn: -angle, color: GOLD })
      }
    }
    boxes.push({ position: at(10.4, 0.55), size: [3.8, 1.1, 0.3], turn: -angle, color: '#372e84' })
    boxes.push({ position: at(10.35, 1.16), size: [3.8, 0.12, 0.46], turn: -angle, color: GOLD })
  }
  return boxes
}

/** The observatory: an open hall under the stars, with the great rings behind the panels. */
export default function Observatory({ accent }: { accent: string }) {
  const chart = usePainting(1024, paintChart)
  const walls = useMemo(pillars, [])
  const stars = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: STARS }, (_, index) => {
          const angle = noise(index + 1) * Math.PI * 2
          const up = noise(index + 900) * 0.9 + 0.02
          const flat = Math.sqrt(1 - up * up) * 40
          return [Math.cos(angle) * flat, up * 32, Math.sin(angle) * flat - 4]
        }).flat(),
      ),
    [],
  )

  return (
    <group>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 18, 40]} />

      <mesh position={[0, 0, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[13, 96]} />
        <meshBasicMaterial map={chart} />
      </mesh>
      <mesh position={[0, 0.01, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.55, 1.68, 64]} />
        <meshBasicMaterial color={accent} />
      </mesh>

      <points raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#fff6d0" size={0.16} fog={false} />
      </points>
      <Boxes boxes={walls} />
      <Armillary accent={accent} />
      <Crystals />
    </group>
  )
}
