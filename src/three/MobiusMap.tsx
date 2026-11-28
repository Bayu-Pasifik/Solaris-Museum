import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  BoxGeometry,
  Color,
  DoubleSide,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Quaternion,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three'
import mobiusUrl from '../assets/gallery/mobius.glb?url'
import {
  ahead,
  colorsOf,
  LAYOUT,
  LENGTH,
  placeAt,
  SHRINK,
  type Salon,
  type Show,
} from '../lib/mobius'

type Spin = { at: number[]; axis: number[]; speed: number }
type Float = { at: number[]; rise: number; speed: number }

const SPINS = LAYOUT.spins as Record<string, Spin>
const FLOATS = LAYOUT.floats as Record<string, Float>

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

/** A thing in the sky that turns about its own middle. */
function Spinner({ spin, mesh }: { spin: Spin; mesh: Mesh }) {
  const turning = useRef<Group>(null)
  const axis = useMemo(() => new Vector3(...(spin.axis as [number, number, number])).normalize(), [spin])
  const turn = useMemo(() => new Quaternion(), [])

  useFrame(({ clock }) => {
    if (!turning.current || window.SakugaFX?.calm) return
    turning.current.quaternion.copy(turn.setFromAxisAngle(axis, clock.elapsedTime * spin.speed))
  })

  return (
    <group position={spin.at as [number, number, number]}>
      <group ref={turning}>
        <Part mesh={mesh} />
      </group>
    </group>
  )
}

/** A thing in the sky that drifts up and down. */
function Drifter({ float, mesh }: { float: Float; mesh: Mesh }) {
  const body = useRef<Group>(null)
  const [x, y, z] = float.at
  useFrame(({ clock }) => {
    if (!body.current || window.SakugaFX?.calm) return
    body.current.position.y = y + Math.sin(clock.elapsedTime * float.speed + x) * float.rise
  })
  return (
    <group ref={body} position={[x, y, z]}>
      <Part mesh={mesh} />
    </group>
  )
}

/** Copies of one mesh at many places, each with its own color if "colors" are given. */
function Copies({ mesh, places, colors }: { mesh: Mesh; places: Matrix4[]; colors?: string[] }) {
  const copies = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const target = copies.current!
    const color = new Color()
    places.forEach((place, index) => {
      target.setMatrixAt(index, place)
      if (colors) target.setColorAt(index, color.set(colors[index]))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  }, [places, colors])

  return (
    <instancedMesh
      // A new number of copies needs a new buffer.
      key={places.length}
      ref={copies}
      args={[mesh.geometry, mesh.material as MeshBasicMaterial, places.length]}
      frustumCulled={false}
      raycast={() => null}
    />
  )
}

/** The board behind every picture, in the pale color of its collection: what is seen from afar. */
function Boards({ salon, items }: { salon: Salon; items: Show[] }) {
  const board = useMemo(
    () => new Mesh(new BoxGeometry(1, 1, 0.05), new MeshBasicMaterial()),
    [],
  )
  useEffect(
    () => () => {
      board.geometry.dispose()
      board.material.dispose()
    },
    [board],
  )
  const places = useMemo(
    () =>
      salon.stands.map(({ s, x, turn, width, height, middle }) =>
        placeAt(s, x, 0, turn)
          .multiply(new Matrix4().makeTranslation(0, middle, 0.09))
          .scale(new Vector3(width * SHRINK - 0.08, height * SHRINK - 0.08, 1)),
      ),
    [salon],
  )
  const colors = useMemo(() => items.map((item) => colorsOf(item).pale), [items])
  return <Copies mesh={board} places={places} colors={colors} />
}

const PORTERS = 24
/** Meters that a porter walks in a second, and the turns of its legs in the same time. */
const PACE = 0.9
const STRIDE = 5
/** Where a porter walks, and where it steps aside for the posts of an arch. */
const LANE = 5.75
const ASIDE = 4.85

/** Small mannequins that carry paintings along both rims, behind the easels. */
function Porters({ body, canvas, legs, salon }: { body: Mesh; canvas: Mesh; legs: Mesh[]; salon: Salon }) {
  const parts = useRef<(InstancedMesh | null)[]>([])
  const meshes = [body, canvas, ...legs]
  const work = useMemo(
    () => ({ place: new Matrix4(), step: new Matrix4(), out: new Matrix4() }),
    [],
  )

  // Every picture has the color of a collection.
  useLayoutEffect(() => {
    const target = parts.current[1]!
    const color = new Color()
    for (let index = 0; index < PORTERS; index++) {
      const gate = salon.gates[index % salon.gates.length]
      if (gate) target.setColorAt(index, color.set(colorsOf(gate).accent))
    }
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  }, [salon])

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    for (let index = 0; index < PORTERS; index++) {
      // One rim goes forward, the other one back.
      const side = index % 2 ? 1 : -1
      const s = (index / PORTERS) * LENGTH + side * time * PACE + Math.sin(index * 7) * 5
      const post = Math.min(...salon.gates.map((gate) => Math.abs(ahead(s, gate.s))))
      const lane = MathUtils.lerp(ASIDE, LANE, MathUtils.smoothstep(post, 0.9, 3))
      const phase = time * STRIDE + index
      work.place.copy(
        placeAt(s, side * lane, Math.abs(Math.cos(phase)) * 0.05, side > 0 ? Math.PI : 0),
      )
      meshes.forEach((_, part) => {
        work.out.copy(work.place)
        // The two legs swing against each other, about the hips.
        if (part > 1) {
          const swing = Math.sin(phase) * (part === 2 ? 0.45 : -0.45)
          work.out
            .multiply(work.step.makeTranslation(0, LAYOUT.hip, 0))
            .multiply(work.step.makeRotationX(swing))
            .multiply(work.step.makeTranslation(0, -LAYOUT.hip, 0))
        }
        parts.current[part]?.setMatrixAt(index, work.out)
      })
    }
    for (const part of parts.current) if (part) part.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {meshes.map((mesh, part) => (
        <instancedMesh
          key={mesh.name}
          ref={(copies) => {
            parts.current[part] = copies
          }}
          args={[mesh.geometry, mesh.material as MeshBasicMaterial, PORTERS]}
          frustumCulled={false}
          raycast={() => null}
        />
      ))}
    </>
  )
}

/** The ribbon, the things around it and the easels, as scripts/build-mobius.py models them. */
export default function MobiusMap({ salon, items }: { salon: Salon; items: Show[] }) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(mobiusUrl, false, true)

  const materials = useMemo(() => {
    const basic = { vertexColors: true, side: DoubleSide }
    return {
      // The file has no normals; flat shading takes them from the faces.
      lit: Object.assign(new MeshToonMaterial(basic), { flatShading: true }),
      // What shines by itself needs no light.
      glow: new MeshBasicMaterial(basic),
      // The sky is beyond the air.
      sky: new MeshBasicMaterial({ ...basic, fog: false }),
    }
  }, [])
  useEffect(() => () => Object.values(materials).forEach((item) => item.dispose()), [materials])

  const parts = useMemo(() => {
    const found = Object.values(nodes)
      .filter((node): node is Mesh => node instanceof Mesh)
      .map((node) => {
        const mesh = node.clone()
        const { name } = node
        // The impossible triangle only works when its shades are not changed by a light.
        const bright = /^mb_glow_|_light$|_glow$|penrose/.test(name)
        mesh.material =
          name === 'mb_sky_dome' ? materials.sky : bright ? materials.glow : materials.lit
        return mesh
      })
    return new Map(found.map((mesh) => [mesh.name, mesh]))
  }, [nodes, materials])

  const easels = useMemo(
    () => salon.stands.map(({ s, x, turn }) => placeAt(s, x, 0, turn)),
    [salon],
  )
  const easelColors = useMemo(() => items.map((item) => colorsOf(item).accent), [items])
  const arches = useMemo(() => salon.gates.map(({ s }) => placeAt(s)), [salon])
  const archColors = useMemo(() => salon.gates.map((gate) => colorsOf(gate).accent), [salon])

  const repeated = /^mb_(easel|gate|porter)_/
  const [body, canvas, legA, legB] = [
    'mb_porter_body',
    'mb_porter_canvas_glow',
    'mb_porter_leg_a',
    'mb_porter_leg_b',
  ].map((name) => parts.get(name))

  return (
    <>
      {[...parts.values()]
        .filter(({ name }) => !repeated.test(name))
        .map((mesh) => {
          const { name } = mesh
          const spin = SPINS[name]
          if (spin) return <Spinner key={name} spin={spin} mesh={mesh} />
          const float = FLOATS[name]
          if (float) return <Drifter key={name} float={float} mesh={mesh} />
          return <Part key={name} mesh={mesh} />
        })}
      {(['mb_easel_paint', 'mb_easel_glow'] as const).map((name) => {
        const mesh = parts.get(name)
        return (
          mesh && (
            <Copies
              key={name}
              mesh={mesh}
              places={easels}
              colors={name === 'mb_easel_glow' ? easelColors : undefined}
            />
          )
        )
      })}
      {(['mb_gate_paint', 'mb_gate_glow'] as const).map((name) => {
        const mesh = parts.get(name)
        return (
          mesh && (
            <Copies
              key={name}
              mesh={mesh}
              places={arches}
              colors={name === 'mb_gate_glow' ? archColors : undefined}
            />
          )
        )
      })}
      <Boards salon={salon} items={items} />
      {body && canvas && legA && legB && (
        <Porters body={body} canvas={canvas} legs={[legA, legB]} salon={salon} />
      )}
    </>
  )
}

useGLTF.preload(mobiusUrl, false, true)
