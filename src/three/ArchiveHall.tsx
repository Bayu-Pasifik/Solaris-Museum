import { useMemo } from 'react'
import { AdditiveBlending, BackSide } from 'three'
import Boxes, { type Box } from './Boxes'
import { noise, paintGlow, usePainting } from './painting'

/** Color of the air. The fog fades everything far away into it. */
const SKY = '#2c2766'
const INK = '#1d1a4a'
const WOOD = '#4a3f93'
const BACK = '#241f58'
const TRIM = '#ffc85a'
const BOOKS = ['#8f8df7', '#ff5fa8', '#4fb3ff', '#ffc21c', '#45d38a', '#b47aff', '#f4f3fc']

/** The middle of the round hall, and the distance from it to the bookcases. */
const CENTER = -1
const RADIUS = 10.5
/** Bookcases on each side of the window, and the angle between two of them. */
const SIDE = 4
const STEP = (24 * Math.PI) / 180
const WIDTH = 3.9
/** Floor height of the two levels, and the height of one shelf. */
const LEVELS = [0, 5]
const SHELF = 0.95
const ROWS = 4

/**
 * A place on the wall of the hall. The angle is 0 at the back; "along" goes sideways along the
 * wall and "out" comes from the wall toward the middle.
 */
function onWall(angle: number, along: number, y: number, out: number): [number, number, number] {
  const reach = RADIUS - out
  return [
    Math.sin(angle) * reach + Math.cos(angle) * along,
    y,
    CENTER - Math.cos(angle) * reach + Math.sin(angle) * along,
  ]
}

/** Every box of the walls: bookcases, books, pillars and the balcony between the levels. */
function build() {
  const boxes: Box[] = []
  let seed = 1
  const next = () => noise(seed++)
  const add = (
    angle: number,
    [along, y, out]: [number, number, number],
    size: [number, number, number],
    color: string,
  ) => boxes.push({ position: onWall(angle, along, y, out), size, turn: -angle, color })

  for (let bay = -SIDE; bay <= SIDE; bay++) {
    const angle = bay * STEP
    for (const floor of LEVELS) {
      // The middle bay holds the window instead of books.
      if (bay === 0) continue
      add(angle, [0, floor + 2.15, -0.1], [WIDTH, 4.3, 0.1], BACK)
      for (let row = 0; row <= ROWS; row++) {
        add(angle, [0, floor + 0.25 + row * SHELF, 0.25], [WIDTH + 0.16, 0.09, 0.62], WOOD)
      }
      for (const along of [-WIDTH / 2, 0, WIDTH / 2]) {
        add(angle, [along, floor + 2.15, 0.27], [0.12, 4.3, 0.64], WOOD)
      }
      for (let row = 0; row < ROWS; row++) {
        const board = floor + 0.295 + row * SHELF
        let x = -WIDTH / 2 + 0.09
        while (x < WIDTH / 2 - 0.26) {
          const w = 0.08 + next() * 0.11
          const h = 0.46 + next() * 0.32
          const color = BOOKS[Math.floor(next() * BOOKS.length)]
          // The upright in the middle is not a place for a book.
          if (x < 0.07 && x + w > -0.07) {
            x = 0.08
            continue
          }
          add(angle, [x + w / 2, board + h / 2, 0.22], [w, h, 0.4], color)
          // Now and then a gap, as if a book is taken out.
          x += w + (next() < 0.08 ? 0.22 : 0.016)
        }
      }
      add(angle, [0, floor + 4.42, 0.3], [WIDTH + 0.3, 0.22, 0.74], TRIM)
    }
    // The balcony: a floor, its edge, and a railing with posts.
    add(angle, [0, 4.78, 0.7], [4.2, 0.22, 1.5], WOOD)
    add(angle, [0, 4.78, 1.47], [4.2, 0.1, 0.06], TRIM)
    add(angle, [0, 5.62, 1.38], [4.2, 0.09, 0.1], TRIM)
    for (let post = -4; post <= 4; post++) {
      add(angle, [post * 0.48, 5.24, 1.38], [0.07, 0.72, 0.07], TRIM)
    }
  }

  // A pillar between every two bays.
  for (let edge = -SIDE - 1; edge <= SIDE; edge++) {
    const angle = (edge + 0.5) * STEP
    add(angle, [0, 4.8, 0.45], [0.42, 9.6, 0.5], '#6a5fc0')
    for (const y of [0.18, 4.5, 9.45]) {
      add(angle, [0, y, 0.48], [0.62, 0.28, 0.66], TRIM)
    }
  }
  return boxes
}

/** A round floor of rings and rays, like a compass of inlaid stone. */
function paintFloor(g: CanvasRenderingContext2D, size: number) {
  const middle = size / 2
  const disc = (radius: number, color: string) => {
    g.fillStyle = color
    g.beginPath()
    g.arc(middle, middle, radius * middle, 0, Math.PI * 2)
    g.fill()
  }
  disc(1, '#b8b3ff')
  const wedges = 36
  for (let wedge = 0; wedge < wedges; wedge++) {
    g.fillStyle = wedge % 2 ? '#8a82d8' : '#a39cec'
    g.beginPath()
    g.moveTo(middle, middle)
    g.arc(
      middle,
      middle,
      middle * 0.96,
      (wedge / wedges) * Math.PI * 2,
      ((wedge + 1) / wedges) * Math.PI * 2,
    )
    g.fill()
  }
  for (const [radius, color] of [
    [0.62, INK],
    [0.605, '#f4f3fc'],
    [0.46, TRIM],
    [0.445, '#d9d5f6'],
    [0.24, INK],
    [0.226, '#8f8df7'],
  ] as const) {
    disc(radius, color)
  }
  g.fillStyle = '#f4f3fc'
  g.beginPath()
  for (let tip = 0; tip < 16; tip++) {
    const radius = middle * (tip % 2 ? 0.08 : tip % 4 ? 0.14 : 0.215)
    const angle = (tip / 16) * Math.PI * 2
    g.lineTo(middle + Math.cos(angle) * radius, middle + Math.sin(angle) * radius)
  }
  g.fill()
}

/** The evening sky behind the window, with stars. */
function paintSky(g: CanvasRenderingContext2D, size: number) {
  const sky = g.createLinearGradient(0, 0, 0, size)
  sky.addColorStop(0, '#5b4fd0')
  sky.addColorStop(0.6, '#ff8fc4')
  sky.addColorStop(1, '#ffd9a0')
  g.fillStyle = sky
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#ffffff'
  for (let star = 0; star < 90; star++) {
    g.beginPath()
    g.arc(noise(star + 3) * size, noise(star + 211) * size * 0.6, 1 + noise(star + 97) * 2, 0, 7)
    g.fill()
  }
}

/** The tall arched window in the middle of the back wall. */
function Window() {
  const sky = usePainting(512, paintSky)
  const z = CENTER - RADIUS

  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 4.8, -0.2]}>
        <planeGeometry args={[4.4, 9.6]} />
        <meshBasicMaterial color={BACK} />
      </mesh>
      <mesh position={[0, 5.2, -0.1]}>
        <planeGeometry args={[3, 6]} />
        <meshBasicMaterial map={sky} fog={false} />
      </mesh>
      <mesh position={[0, 8.2, -0.09]}>
        <circleGeometry args={[1.5, 48, 0, Math.PI]} />
        <meshBasicMaterial color="#5b4fd0" fog={false} />
      </mesh>
      <mesh position={[0, 8.2, 0]}>
        <torusGeometry args={[1.55, 0.12, 8, 48, Math.PI]} />
        <meshToonMaterial color={TRIM} />
      </mesh>
      {[-1.55, 0, 1.55].map((x) => (
        <mesh key={x} position={[x, 5.2, 0]}>
          <boxGeometry args={[x ? 0.2 : 0.07, 6.1, 0.12]} />
          <meshToonMaterial color={TRIM} />
        </mesh>
      ))}
      {[2.2, 4.2, 6.2, 8.2].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[3.1, 0.08, 0.1]} />
          <meshToonMaterial color={TRIM} />
        </mesh>
      ))}
    </group>
  )
}

/** Hanging lanterns: where each one is. */
const LANTERNS: [number, number, number][] = [
  [-4.3, 4.2, -2.4],
  [4.3, 4.2, -2.4],
  [-2.6, 6.1, -6.4],
  [2.6, 6.1, -6.4],
  [-7, 3.4, 0.4],
  [7, 3.4, 0.4],
]

export function Lantern({ position }: { position: [number, number, number] }) {
  const glow = usePainting(128, paintGlow)

  return (
    <group position={position}>
      <mesh position={[0, 3.3, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 6, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.24, 20, 14]} />
        <meshBasicMaterial color="#fff2b8" />
      </mesh>
      {[0.28, -0.28].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.13, 0.17, 0.09, 12]} />
          <meshToonMaterial color={TRIM} />
        </mesh>
      ))}
      <sprite scale={[2.1, 2.1, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
    </group>
  )
}

/** A reading table with a lamp and a stack of books. */
function Desk({ x, z, turn }: { x: number; z: number; turn: number }) {
  const glow = usePainting(128, paintGlow)

  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[2, 0.12, 1]} />
        <meshToonMaterial color={WOOD} />
      </mesh>
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[2.06, 0.18, 1.06]} />
        <meshBasicMaterial color={INK} side={BackSide} />
      </mesh>
      {[-0.85, 0.85].map((leg) => (
        <mesh key={leg} position={[leg, 0.4, 0]}>
          <boxGeometry args={[0.12, 0.8, 0.8]} />
          <meshToonMaterial color={WOOD} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((book) => (
        <mesh key={book} position={[-0.5, 0.97 + book * 0.1, 0]} rotation={[0, book * 0.35, 0]}>
          <boxGeometry args={[0.55 - book * 0.04, 0.09, 0.4]} />
          <meshToonMaterial color={BOOKS[book]} />
        </mesh>
      ))}
      <group position={[0.55, 0.92, 0]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.03, 0.05, 0.5, 8]} />
          <meshToonMaterial color={TRIM} />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.13, 0.3, 0.24, 16, 1, true]} />
          <meshBasicMaterial color="#45d38a" side={2} />
        </mesh>
        <sprite position={[0, 0.45, 0]} scale={[1.4, 1.4, 1]}>
          <spriteMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      </group>
    </group>
  )
}

/** The two levels of bookcases, the balcony and the pillars. */
function Walls() {
  const boxes = useMemo(build, [])
  return <Boxes boxes={boxes} />
}

/** The library: a round hall with two levels of bookcases around a floor of inlaid stone. */
export default function ArchiveHall({ accent }: { accent: string }) {
  const floor = usePainting(1024, paintFloor)

  return (
    <group>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 17, 36]} />

      <mesh position={[0, 0, CENTER]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[16, 96]} />
        <meshBasicMaterial map={floor} />
      </mesh>
      {/* A ring in the color of the open category, around the place of the chosen story. */}
      <mesh position={[0, 0.01, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.55, 1.68, 64]} />
        <meshBasicMaterial color={accent} />
      </mesh>

      <Walls />
      <Window />
      {LANTERNS.map((position) => (
        <Lantern key={position.join(' ')} position={position} />
      ))}
      <Desk x={-5.6} z={-3.6} turn={0.55} />
      <Desk x={5.6} z={-3.6} turn={-0.55} />
    </group>
  )
}
