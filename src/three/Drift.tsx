import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Points } from 'three'

const COLORS = ['#ff5fa8', '#4fb3ff', '#ffc21c', '#45d38a', '#b47aff']
const BOOKS = 16
const MOTES = 220

/** A number from 0 to 1 that is always the same for the same seed. */
const noise = (seed: number) => Math.abs((Math.sin(seed * 91.7) * 24634.6345) % 1)

/** One open book: two covers with their pages, bent at the spine. */
function OpenBook({ color }: { color: string }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} rotation={[0, 0, side * 0.35]}>
          <mesh position={[side * 0.19, 0, 0]}>
            <boxGeometry args={[0.38, 0.04, 0.5]} />
            <meshToonMaterial color={color} />
          </mesh>
          <mesh position={[side * 0.18, 0.035, 0]}>
            <boxGeometry args={[0.33, 0.035, 0.44]} />
            <meshBasicMaterial color="#fffaf0" />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Open books that float around the hall, and motes of light in the air. */
export default function Drift() {
  const books = useRef<Group>(null)
  const motes = useRef<Points>(null)

  // The books keep to the sides and the top, so they do not cover the story cards.
  const homes = useMemo(
    () =>
      Array.from({ length: BOOKS }, (_, index) => {
        const side = index % 2 ? 1 : -1
        return {
          x: side * (3 + noise(index + 1) * 4),
          y: 2.4 + noise(index + 40) * 4.2,
          z: -6.5 + noise(index + 80) * 5.5,
          turn: noise(index + 120) * 6,
        }
      }),
    [],
  )
  const dust = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: MOTES * 3 }, (_, index) => {
          const value = noise(index + 7)
          return index % 3 === 1 ? value * 8 : (value - 0.5) * 16 - (index % 3 === 2 ? 2 : 0)
        }),
      ),
    [],
  )

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    books.current?.children.forEach((book, index) => {
      const home = homes[index]
      book.position.y = home.y + Math.sin(time * 0.7 + home.turn) * 0.22
      book.rotation.set(0.35, home.turn + time * 0.15, Math.sin(time * 0.5 + index) * 0.18)
    })
    if (motes.current) motes.current.position.y = Math.sin(time * 0.2) * 0.3
  })

  return (
    <>
      <group ref={books}>
        {homes.map((home, index) => (
          <group key={index} position={[home.x, home.y, home.z]}>
            <OpenBook color={COLORS[index % COLORS.length]} />
          </group>
        ))}
      </group>
      <points ref={motes} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffe9a8" size={0.045} transparent opacity={0.8} />
      </points>
    </>
  )
}
