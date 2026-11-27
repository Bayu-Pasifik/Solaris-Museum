import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { BackSide, MathUtils, type Group } from 'three'

const INK = '#1d1a4a'
const SHARDS = [0, 1, 2, 3, 4, 5]

type Props = {
  color: string
  /** Closed portals stand still and look faded. */
  open: boolean
  active: boolean
}

/** Cel shading plus an ink outline, to match the drawn effects of the page. */
function Gate({ color, open, active }: Props) {
  const body = useRef<Group>(null)
  const swirl = useRef<Group>(null)
  const orbit = useRef<Group>(null)
  const speed = useRef(1)
  const size = useRef({ value: 1, velocity: 0 })

  useFrame(({ clock, pointer }, delta) => {
    if (!open || !body.current || !swirl.current || !orbit.current) return
    const step = Math.min(delta, 0.033)
    const time = clock.elapsedTime

    // A spring, so the portal overshoots when it grows.
    const spring = size.current
    spring.velocity += (260 * ((active ? 1.16 : 1) - spring.value) - 12 * spring.velocity) * step
    spring.value += spring.velocity * step
    body.current.scale.setScalar(spring.value)

    body.current.rotation.y = Math.sin(time * 0.9) * 0.5 + pointer.x * 0.35
    body.current.rotation.x = -pointer.y * 0.3
    body.current.position.y = Math.sin(time * 1.6) * 0.05

    speed.current = MathUtils.damp(speed.current, active ? 5 : 1, 5, step)
    swirl.current.rotation.z -= step * speed.current * 1.4
    orbit.current.rotation.z += step * speed.current * 0.6
  })

  const main = open ? color : '#e4e2f2'
  const line = open ? INK : '#b9b6d6'

  return (
    <group ref={body} rotation={[0, open ? 0 : 0.45, 0]}>
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
        <meshBasicMaterial color={main} transparent opacity={open ? 0.35 : 0.5} />
      </mesh>
      <group ref={swirl}>
        {[0.46, 0.31, 0.16].map((radius, index) => (
          <mesh key={radius} rotation={[0, 0, index * 2.1]} position={[0, 0, -0.04 + index * 0.01]}>
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
                position={[Math.cos(angle) * 1.05, Math.sin(angle) * 1.05, index % 2 ? 0.25 : -0.2]}
                rotation={[angle, angle * 2, angle]}
                scale={index % 2 ? 0.1 : 0.07}
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
  )
}

export default function Portal(props: Props) {
  const still = !props.open || window.SakugaFX?.calm

  return (
    <Canvas
      flat
      frameloop={still ? 'demand' : 'always'}
      camera={{ position: [0, 0, 4.1], fov: 35 }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={1.6} />
      <directionalLight position={[-3, 4, 4]} intensity={2} />
      <Gate {...props} />
    </Canvas>
  )
}
