import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D, type InstancedMesh } from 'three'
import { playNote } from '../lib/ambience'
import type { Roam } from '../lib/roam'
import { angleAt, closestRoad, LAYOUT, lengthAt, roadPoint } from '../lib/spire'

const { road } = LAYOUT
/** The length of road that one key takes, and the width of the keys. */
const STEP = 0.92
const WIDTH = road.half * 2 - 0.5
const COUNT = Math.floor(lengthAt(road.end) / STEP)
/** The notes of the road: five to the octave, so any two of them sound well together. */
const SCALE = [0, 2, 4, 7, 9]
const LOWEST = 61
/** The places of an octave on a piano that have a black key after them. */
const BLACK = new Set([0, 1, 3, 4, 5])

/** The colors of the road from its foot to its top, as in the script of the model. */
const CRESCENDO = ['#45e0ff', '#6f8cff', '#a374ff', '#ff6fb5', '#ffd45a'].map((c) => new Color(c))

function crescendo(share: number, into: Color) {
  const at = Math.min(Math.max(share, 0), 1) * (CRESCENDO.length - 1)
  const index = Math.min(Math.floor(at), CRESCENDO.length - 2)
  return into.copy(CRESCENDO[index]).lerp(CRESCENDO[index + 1], at - index)
}

/** The note of a key: the road climbs three octaves, in small runs up and down. */
const noteOf = (index: number) => {
  const degree = Math.floor((index / COUNT) * 14) + [0, 1, 2, 4, 3, 2][index % 6]
  return LOWEST + 12 * Math.floor(degree / SCALE.length) + SCALE[degree % SCALE.length]
}

/** The keys of the road. The one under the walker sinks, shines and sings. */
export default function Keyboard({ roam }: { roam: RefObject<Roam> }) {
  const whites = useRef<InstancedMesh>(null)
  const blacks = useRef<InstancedMesh>(null)
  const { places, dark, rest, dummy, color, light } = useMemo(() => {
    const places = Array.from({ length: COUNT }, (_, index) => {
      const t = angleAt((index + 0.5) * STEP)
      const [x, y, z] = roadPoint(t)
      // The long side of a key points at the middle of the map.
      return { x, y, z, turn: -(Math.PI / 2 + t), t }
    })
    return {
      places,
      dark: places.map((_, index) => index).filter((index) => BLACK.has(index % 7)),
      rest: new Color('#4b3f8f'),
      dummy: new Object3D(),
      color: new Color(),
      light: new Color(),
    }
  }, [])
  /** How bright each key that still shines is, from 1 down to 0. */
  const lit = useRef(new Map<number, number>())
  const under = useRef(-1)

  const draw = (index: number, share: number) => {
    const mesh = whites.current
    if (!mesh) return
    const { x, y, z, turn, t } = places[index]
    dummy.position.set(x, y - 0.05 - share * 0.07, z)
    dummy.rotation.set(0, turn, 0)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    // Every other key is a little lighter, so the road is read as keys.
    color.copy(rest).multiplyScalar(index % 2 ? 0.86 : 1.08)
    color.lerp(crescendo(t / road.end, light), share)
    mesh.setColorAt(index, color)
  }

  const flush = () => {
    const mesh = whites.current
    if (!mesh) return
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  useLayoutEffect(() => {
    places.forEach((_, index) => draw(index, 0))
    flush()
    dark.forEach((index, at) => {
      const t = angleAt((index + 1) * STEP)
      // On the side of the road toward the middle, over the gap between two keys.
      const [x, y, z] = roadPoint(t, -WIDTH * 0.32)
      dummy.position.set(x, y + 0.006, z)
      dummy.rotation.set(0, -(Math.PI / 2 + t), 0)
      dummy.updateMatrix()
      blacks.current!.setMatrixAt(at, dummy.matrix)
    })
    blacks.current!.instanceMatrix.needsUpdate = true
  }, [places, dark, dummy])

  useFrame((_, delta) => {
    const { x, z } = roam.current
    const near = closestRoad(x, z)
    const index =
      near && near.off <= road.half && near.t >= 0 && near.t < road.end
        ? Math.floor(lengthAt(near.t) / STEP)
        : -1
    let changed = false
    if (index !== under.current) {
      // The first key after an arrival is silent, so a jump makes no sound.
      const walked = under.current >= 0 && Math.abs(index - under.current) < 4
      under.current = index
      if (index >= 0 && index < COUNT) {
        lit.current.set(index, 1)
        if (walked) playNote(noteOf(index))
        changed = true
      }
    }
    if (index >= 0 && index < COUNT) lit.current.set(index, 1)

    const fade = Math.min(delta, 0.05) * 0.8
    lit.current.forEach((share, key) => {
      const next = key === index ? 1 : share - fade
      draw(key, Math.max(next, 0))
      if (next <= 0) lit.current.delete(key)
      else lit.current.set(key, next)
      if (next !== 1) changed = true
    })
    if (changed) flush()
  })

  return (
    <>
      <instancedMesh
        ref={whites}
        args={[undefined, undefined, COUNT]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[WIDTH, 0.1, STEP - 0.14]} />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh
        ref={blacks}
        args={[undefined, undefined, dark.length]}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[WIDTH * 0.3, 0.02, STEP * 0.55]} />
        <meshBasicMaterial color="#140f33" />
      </instancedMesh>
    </>
  )
}
