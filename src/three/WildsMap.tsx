import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { DoubleSide, Mesh, MeshBasicMaterial, MeshToonMaterial, type Group } from 'three'
import wildsUrl from '../assets/bestiary/wilds.glb?url'
import { SPINS } from '../lib/wilds'

type Spin = (typeof SPINS)[keyof typeof SPINS]

/** A part of the map that turns around its own middle. */
function Spinner({ spin, mesh }: { spin: Spin; mesh: Mesh }) {
  const turning = useRef<Group>(null)
  useFrame((_, delta) => {
    if (!turning.current || window.SakugaFX?.calm) return
    turning.current.rotation[spin.axis as 'y' | 'z'] += Math.min(delta, 0.05) * spin.speed
  })
  return (
    <group position={spin.at as [number, number, number]} rotation={[0, spin.turn, 0]}>
      <group ref={turning}>
        <Part mesh={mesh} />
      </group>
    </group>
  )
}

/** One mesh of the map, with the place that the file gives it. */
function Part({ mesh }: { mesh: Mesh }) {
  return (
    <mesh
      geometry={mesh.geometry}
      material={mesh.material}
      position={mesh.position}
      quaternion={mesh.quaternion}
      scale={mesh.scale}
      raycast={() => null}
    />
  )
}

/** The ground and everything that grows on it, as scripts/build-wilds.py models it. */
export default function WildsMap() {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(wildsUrl, false, true)

  const paint = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  // What shines by itself needs no light.
  const glow = useMemo(() => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => glow.dispose(), [glow])

  const parts = useMemo(
    () =>
      Object.values(nodes)
        .filter((node): node is Mesh => node instanceof Mesh)
        .map((node) => {
          const lit = node.name.startsWith('isle_') || LIT_SPINS.has(node.name)
          const mesh = node.clone()
          mesh.material = lit ? paint : glow
          return mesh
        }),
    [nodes, paint, glow],
  )

  return (
    <>
      {parts.map((mesh) => {
        const spin = (SPINS as Record<string, Spin>)[mesh.name]
        return spin ? (
          <Spinner key={mesh.name} spin={spin} mesh={mesh} />
        ) : (
          <Part key={mesh.name} mesh={mesh} />
        )
      })}
    </>
  )
}

/** The turning parts that are things, not lights. */
const LIT_SPINS = new Set(['spin_aero', 'spin_fusion', 'spin_havoc', 'spin_physical'])

useGLTF.preload(wildsUrl, false, true)
