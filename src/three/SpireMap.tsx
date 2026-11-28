import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
} from 'three'
import spireUrl from '../assets/echo/spire.glb?url'
import { themeOf } from '../lib/elements'
import { LAYOUT, type Stand, type Voice } from '../lib/spire'

type Spin = {
  at: number[]
  /** "y", or the line that a swinging part turns about. */
  axis: string | number[]
  speed: number
  /** For a part that swings to and fro: how far, in radians. */
  swing?: number
}

const SPINS = LAYOUT.spins as Record<string, Spin>

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

/** A part of the map that turns or swings around its own middle. */
function Spinner({ spin, mesh }: { spin: Spin; mesh: Mesh }) {
  const turning = useRef<Group>(null)
  const axis = useMemo(
    () => (Array.isArray(spin.axis) ? new Vector3(...(spin.axis as [number, number, number])) : new Vector3(0, 1, 0)),
    [spin],
  )
  const turn = useMemo(() => new Quaternion(), [])

  useFrame(({ clock }) => {
    if (!turning.current || window.SakugaFX?.calm) return
    const angle = spin.swing
      ? Math.sin(clock.elapsedTime * spin.speed) * spin.swing
      : clock.elapsedTime * spin.speed
    turning.current.quaternion.copy(turn.setFromAxisAngle(axis, angle))
  })

  return (
    <group position={spin.at as [number, number, number]}>
      <group ref={turning}>
        <Part mesh={mesh} />
      </group>
    </group>
  )
}

/** The bars of the sea below: every group stretches to the beat a little after the one before. */
function Pulse({ mesh, beat }: { mesh: Mesh; beat: number }) {
  const bars = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!bars.current || window.SakugaFX?.calm) return
    const wave = Math.sin(clock.elapsedTime * 2.4 - beat * 1.05)
    bars.current.scale.y = 0.55 + 0.75 * wave * wave
  })
  return (
    <group ref={bars} position={[0, LAYOUT.abyss, 0]}>
      <Part mesh={mesh} />
    </group>
  )
}

/** The stand of every echo, in one draw for its body and one for its light. */
function Stands({
  mesh,
  stands,
  voices,
}: {
  mesh: Mesh
  stands: Stand[]
  voices?: Voice[]
}) {
  const copies = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const target = copies.current!
    const dummy = new Object3D()
    const color = new Color()
    stands.forEach((stand, index) => {
      dummy.position.set(...stand.position)
      dummy.rotation.set(0, stand.turn, 0)
      dummy.updateMatrix()
      target.setMatrixAt(index, dummy.matrix)
      // The light of a stand has the color of the element of its echo.
      if (voices) target.setColorAt(index, color.set(themeOf(voices[index].record.element).accent))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  }, [stands, voices])

  return (
    <instancedMesh
      // A new number of stands needs a new buffer.
      key={stands.length}
      ref={copies}
      args={[mesh.geometry as BufferGeometry, mesh.material as MeshBasicMaterial, stands.length]}
      frustumCulled={false}
      raycast={() => null}
    />
  )
}

/** The road, the instruments around it and the stands, as scripts/build-spire.py models them. */
export default function SpireMap({ stands, voices }: { stands: Stand[]; voices: Voice[] }) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(spireUrl, false, true)

  // The file has no normals; flat shading takes them from the faces.
  const paint = useMemo(
    () => Object.assign(new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), { flatShading: true }),
    [],
  )
  // What shines by itself needs no light.
  const glow = useMemo(() => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => glow.dispose(), [glow])

  const parts = useMemo(
    () =>
      Object.values(nodes)
        .filter((node): node is Mesh => node instanceof Mesh)
        .map((node) => {
          const mesh = node.clone()
          const lit = node.name.startsWith('isle_') || node.name === 'stand_paint'
          mesh.material = lit ? paint : glow
          return mesh
        }),
    [nodes, paint, glow],
  )

  return (
    <>
      {parts.map((mesh) => {
        const { name } = mesh
        if (name === 'stand_paint') return <Stands key={name} mesh={mesh} stands={stands} />
        if (name === 'stand_glow') {
          return <Stands key={name} mesh={mesh} stands={stands} voices={voices} />
        }
        if (name.startsWith('pulse_')) {
          return <Pulse key={name} mesh={mesh} beat={Number(name.slice(6))} />
        }
        const spin = SPINS[name]
        return spin ? <Spinner key={name} spin={spin} mesh={mesh} /> : <Part key={name} mesh={mesh} />
      })}
    </>
  )
}

useGLTF.preload(spireUrl, false, true)
