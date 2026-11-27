import { useEffect, useMemo } from 'react'
import { BackSide, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const INK = '#1d1a4a'
/** Color of the air. The fog fades everything far away into it. */
const SKY = '#e6e3fa'
const FLOOR = 60
const HEIGHT = 4.2

/** Pairs of pillars along both sides, and two more pairs against the back wall. */
const PILLARS: [number, number][] = [
  ...[0.4, -2.6, -5.6].flatMap((z): [number, number][] => [
    [-5.4, z],
    [5.4, z],
  ]),
  [-3.2, -7.2],
  [3.2, -7.2],
  [-1.7, -7.2],
  [1.7, -7.2],
]

/** Four tiles with a thin joint between them. */
function drawFloor() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const g = canvas.getContext('2d')!
  g.fillStyle = '#f4f3fc'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = '#d3cff2'
  g.fillRect(0, 0, 128, 128)
  g.fillRect(128, 128, 128, 128)
  g.strokeStyle = '#8580b0'
  g.lineWidth = 3
  for (const at of [0, 128, 256]) {
    g.strokeRect(at, -4, 0, 264)
    g.strokeRect(-4, at, 264, 0)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(FLOOR / 2.4, FLOOR / 2.4)
  texture.anisotropy = 8
  return texture
}

/** A block with the ink outline of the page: a slightly bigger copy, seen from inside. */
function Block({ y, size, color }: { y: number; size: [number, number, number]; color: string }) {
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <boxGeometry args={size} />
        <meshToonMaterial color={color} />
      </mesh>
      <mesh>
        <boxGeometry args={[size[0] + 0.06, size[1] + 0.06, size[2] + 0.06]} />
        <meshBasicMaterial color={INK} side={BackSide} />
      </mesh>
    </group>
  )
}

function Pillar({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Block y={0.14} size={[0.86, 0.28, 0.86]} color="#b8b3ff" />
      <mesh position={[0, HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.27, 0.32, HEIGHT, 12]} />
        <meshToonMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.3, 0.35, HEIGHT, 12]} />
        <meshBasicMaterial color={INK} side={BackSide} />
      </mesh>
      <Block y={HEIGHT} size={[0.84, 0.22, 0.84]} color="#b8b3ff" />
    </group>
  )
}

/** The room itself: sky color, tiled floor, carpet, back wall and pillars. */
export default function Museum({ carpet }: { carpet: string }) {
  const floor = useMemo(drawFloor, [])
  useEffect(() => () => floor.dispose(), [floor])

  return (
    <group>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 10, 24]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[FLOOR, FLOOR]} />
        <meshBasicMaterial map={floor} />
      </mesh>

      {/* Carpet: an ink strip with the colored one on top. */}
      <mesh position={[0, 0.004, 2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.72, 8]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh position={[0, 0.008, 2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.6, 8]} />
        <meshBasicMaterial color={carpet} />
      </mesh>

      <mesh position={[0, 5, -8.2]}>
        <planeGeometry args={[40, 10]} />
        <meshBasicMaterial color="#c9c4f4" />
      </mesh>
      {/* A round window on the wall, behind the middle portal. */}
      <mesh position={[0, 2.5, -8.15]}>
        <circleGeometry args={[2.3, 64]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {[2.3, 1.6].map((radius) => (
        <mesh key={radius} position={[0, 2.5, -8.1]}>
          <ringGeometry args={[radius - 0.09, radius, 64]} />
          <meshBasicMaterial color="#8f8df7" />
        </mesh>
      ))}

      {PILLARS.map(([x, z]) => (
        <Pillar key={`${x} ${z}`} x={x} z={z} />
      ))}
      {/* Beams that rest on the side pillars. */}
      {[-5.4, 5.4].map((x) => (
        <group key={x} position={[x, 0, -2.6]}>
          <Block y={HEIGHT + 0.3} size={[0.6, 0.34, 7.2]} color="#ffffff" />
        </group>
      ))}
    </group>
  )
}
