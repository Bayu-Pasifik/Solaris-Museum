import { useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BackSide, MathUtils, type Group } from 'three'
import type { Room } from '../lib/rooms'
import Sign from './Sign'

const INK = '#1d1a4a'
const SHARDS = [0, 1, 2, 3, 4, 5]
/** Outer radius of the ring, which is also the height of its middle above the step. */
const RADIUS = 0.83
const SCALE = 1.25
/** Height of the step under the portal. */
const STEP = 0.2
/** Height of the middle of a portal above the floor. */
export const PORTAL_CENTER = STEP + RADIUS * SCALE

type Props = {
  room: Room
  position: [number, number, number]
  /** Size of the whole gate, step and name board included. */
  scale: number
  /** Rotation around the vertical axis, so side portals face the visitor. */
  turn: number
  active: boolean
  onHover: (over: boolean) => void
  onClick: (event: ThreeEvent<MouseEvent>) => void
}

/** A gate standing on a round step. Closed ones stand still and look faded. */
export default function Portal({
  room,
  position,
  scale,
  turn,
  active,
  onHover,
  onClick,
}: Props) {
  const open = Boolean(room.path)
  const body = useRef<Group>(null)
  const swirl = useRef<Group>(null)
  const orbit = useRef<Group>(null)
  const speed = useRef(1)
  const size = useRef({ value: 1, velocity: 0 })

  useFrame((_, delta) => {
    if (!open || window.SakugaFX?.calm) return
    if (!body.current || !swirl.current || !orbit.current) return
    const step = Math.min(delta, 0.033)

    // A spring, so the portal overshoots when it grows.
    const spring = size.current
    spring.velocity += (260 * ((active ? 1.1 : 1) - spring.value) - 12 * spring.velocity) * step
    spring.value += spring.velocity * step
    body.current.scale.setScalar(spring.value * SCALE)

    speed.current = MathUtils.damp(speed.current, active ? 5 : 1, 5, step)
    swirl.current.rotation.z -= step * speed.current * 1.4
    orbit.current.rotation.z += step * speed.current * 0.6
  })

  const main = open ? room.color : '#dedbf0'
  const line = open ? INK : '#8580b0'

  return (
    <group position={position} rotation={[0, turn, 0]} scale={scale}>
      <mesh position={[0, STEP / 2, 0]}>
        <cylinderGeometry args={[1.05, 1.15, STEP, 48]} />
        <meshToonMaterial color={open ? '#ffffff' : '#e4e2f2'} />
      </mesh>
      <mesh position={[0, STEP + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.86, 0.98, 48]} />
        <meshBasicMaterial color={open ? room.color : '#b8b3ff'} />
      </mesh>

      {/* Scaled from the step upwards, so a growing portal never sinks into it. */}
      <group
        ref={body}
        position={[0, STEP, 0]}
        scale={SCALE}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(true)
        }}
        onPointerOut={() => onHover(false)}
        onClick={onClick}
      >
        <group position={[0, RADIUS, 0]}>
          <mesh>
            <torusGeometry args={[0.7, 0.13, 24, 72]} />
            <meshToonMaterial color={main} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.7, 0.165, 24, 72]} />
            <meshBasicMaterial color={line} side={BackSide} />
          </mesh>

          <mesh position={[0, 0, -0.06]}>
            <circleGeometry args={[0.62, 64]} />
            <meshBasicMaterial color={main} transparent opacity={open ? 0.4 : 0.6} />
          </mesh>
          <group ref={swirl}>
            {[0.46, 0.31, 0.16].map((radius, index) => (
              <mesh
                key={radius}
                rotation={[0, 0, index * 2.1]}
                position={[0, 0, -0.04 + index * 0.01]}
              >
                <ringGeometry args={[radius - 0.045, radius, 48, 1, 0, Math.PI * 1.35]} />
                <meshBasicMaterial color={open ? '#ffffff' : '#f4f3fc'} />
              </mesh>
            ))}
          </group>

          <group ref={orbit}>
            {open &&
              SHARDS.map((index) => {
                const angle = (index / SHARDS.length) * Math.PI * 2
                return (
                  <group
                    key={index}
                    position={[
                      Math.cos(angle) * 0.97,
                      Math.sin(angle) * 0.97,
                      index % 2 ? 0.25 : -0.2,
                    ]}
                    rotation={[angle, angle * 2, angle]}
                    scale={index % 2 ? 0.08 : 0.055}
                  >
                    <mesh scale={[0.7, 1.3, 0.7]}>
                      <octahedronGeometry />
                      <meshToonMaterial color="#b8b3ff" />
                    </mesh>
                    <mesh scale={[0.95, 1.65, 0.95]}>
                      <octahedronGeometry />
                      <meshBasicMaterial color={INK} side={BackSide} />
                    </mesh>
                  </group>
                )
              })}
          </group>
        </group>
      </group>

      <Sign
        title={room.name}
        note={open ? undefined : 'Coming soon'}
        shadow={open ? room.color : '#b8b3ff'}
        ink={open ? INK : '#8580b0'}
        position={[0, STEP + RADIUS * 2 * SCALE + 0.55, 0]}
      />
    </group>
  )
}
