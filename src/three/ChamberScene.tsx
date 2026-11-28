import { Suspense, useLayoutEffect, useMemo, useRef, type ComponentProps } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import {
  AdditiveBlending,
  DoubleSide,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import { assetUrl } from '../lib/characters'
import type { ElementTheme } from '../lib/elements'
import ElementParticles from './ElementParticles'
import MonsterStand from './MonsterStand'
import { noise, paintGlow, usePainting } from './painting'

/** Color of the floor and of the dark around it. */
const NIGHT = '#0d0b24'
const BARS = 96
const RADIUS = 11
/** Where the emblems of the Sonata sets float, behind the monster. */
const SPOTS: [number, number, number][] = [
  [-4.6, 3.1, -4.5],
  [4.6, 3.1, -4.5],
  [-6.4, 1.4, -2],
  [6.4, 1.4, -2],
  [-2.6, 5, -7],
  [2.6, 5, -7],
]

/** The wall of sound: a ring of bars that rise and fall like an equalizer. */
function Wave({ color }: { color: string }) {
  const mesh = useRef<InstancedMesh>(null)
  const place = useMemo(() => new Object3D(), [])

  const move = (time: number) => {
    const target = mesh.current
    if (!target) return
    for (let index = 0; index < BARS; index++) {
      const angle = (index / BARS) * Math.PI * 2
      // Two waves that run against each other, and a height of its own for every bar.
      const swell =
        Math.abs(Math.sin(angle * 6 + time * 1.6)) * Math.abs(Math.sin(angle * 3 - time * 0.9))
      const tall = 0.2 + swell * (0.8 + noise(index + 3))
      place.position.set(Math.sin(angle) * RADIUS, tall / 2, Math.cos(angle) * RADIUS)
      place.rotation.set(0, angle, 0)
      place.scale.set(0.28, tall, 0.12)
      place.updateMatrix()
      target.setMatrixAt(index, place.matrix)
    }
    target.instanceMatrix.needsUpdate = true
  }

  useLayoutEffect(() => move(0))
  useFrame(({ clock }) => {
    if (!window.SakugaFX?.calm) move(clock.elapsedTime)
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, BARS]}
      frustumCulled={false}
      raycast={() => null}
    >
      <boxGeometry />
      <meshBasicMaterial color={color} />
    </instancedMesh>
  )
}

/** Rings that leave the middle of the floor, one after the other. */
function Pulses({ color }: { color: string }) {
  const rings = useRef<Group>(null)

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0.1 : clock.elapsedTime * 0.22
    rings.current?.children.forEach((child, index) => {
      const ring = child as Mesh
      const age = (time + index / 4) % 1
      ring.scale.setScalar(1.8 + age * (RADIUS - 2.4))
      ;(ring.material as MeshBasicMaterial).opacity = (1 - age) * 0.7
    })
  })

  return (
    <group ref={rings} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[0, 1, 2, 3].map((ring) => (
        <mesh key={ring} raycast={() => null}>
          <ringGeometry args={[0.97, 1, 96]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/** The emblem of one Sonata set in a turning six-sided frame. */
function Emblem({ icon, index, color }: { icon: string; index: number; color: string }) {
  const texture = useTexture(assetUrl(icon), (loaded) => {
    loaded.colorSpace = SRGBColorSpace
  })
  const glow = usePainting(128, paintGlow)
  const body = useRef<Group>(null)
  const frame = useRef<Group>(null)
  const [x, y, z] = SPOTS[index]
  // On a tall screen the emblems move inwards and up, so they stay in sight.
  const narrow = useThree((state) => Math.min(state.size.width / state.size.height, 1))
  const across = x * narrow
  const up = y + (1 - narrow) * 1.2

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    body.current?.position.set(across, up + Math.sin(time * 0.8 + index * 2) * 0.18, z)
    if (frame.current) frame.current.rotation.z = time * (index % 2 ? 0.25 : -0.25)
  })

  return (
    <group ref={body} position={[across, up, z]} scale={0.5 + narrow / 2}>
      <sprite scale={[3.4, 3.4, 1]} raycast={() => null}>
        <spriteMaterial
          map={glow}
          color={color}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </sprite>
      <sprite scale={[1.15, 1.15, 1]} raycast={() => null}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
      <group ref={frame}>
        {[0.92, 1.1].map((radius) => (
          <mesh key={radius} raycast={() => null}>
            <ringGeometry args={[radius - 0.04, radius, 6]} />
            <meshBasicMaterial color={color} side={DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

type Props = ComponentProps<typeof MonsterStand> & {
  element: string
  theme: ElementTheme
  /** Paths inside public/ of the emblems of the Sonata sets of the echo. */
  emblems: string[]
}

/** The resonance chamber: the echo in the middle of the rings of its own sound. */
export default function ChamberScene({ element, theme, emblems, ...stand }: Props) {
  const glow = usePainting(256, paintGlow)
  const stars = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: 420 }, (_, index) => {
          const angle = noise(index + 7) * Math.PI * 2
          const far = 20 + noise(index + 700) * 14
          return [Math.sin(angle) * far, noise(index + 1400) * 22 - 1, Math.cos(angle) * far]
        }).flat(),
      ),
    [],
  )

  return (
    <>
      <color attach="background" args={[NIGHT]} />
      <fog attach="fog" args={[NIGHT, 18, 46]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[-5, 11, 7]} intensity={1.7} />

      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[RADIUS + 1.5, 96]} />
        <meshBasicMaterial color="#1a1645" />
      </mesh>
      {/* The light on the floor, under the monster. */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial
          map={glow}
          color={theme.accent}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {[1.6, 3.4, RADIUS - 0.6].map((radius) => (
        <mesh
          key={radius}
          position={[0, 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[radius - 0.07, radius, 96]} />
          <meshBasicMaterial color={theme.accent} />
        </mesh>
      ))}
      <Pulses color={theme.pale} />
      <Wave color={theme.accent} />

      <points raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color={theme.pale} size={0.16} fog={false} />
      </points>
      <group scale={2.6}>
        <ElementParticles key={element} element={element} theme={theme} />
      </group>

      {emblems.slice(0, SPOTS.length).map((icon, index) => (
        // Its own boundary, so the room does not wait for a picture.
        <Suspense key={icon} fallback={null}>
          <Emblem icon={icon} index={index} color={theme.accent} />
        </Suspense>
      ))}

      <MonsterStand {...stand} />
    </>
  )
}
