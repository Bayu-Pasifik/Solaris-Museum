import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  type Group,
  type InstancedMesh,
  type Material,
} from 'three'
import expressUrl from '../assets/express/express.glb?url'
import { themeOf } from '../lib/elements'
import { carAt, LAYOUT, STYLES, type Style, type Train } from '../lib/express'
import { playClack } from '../lib/ambience'
import type { Roam } from '../lib/roam'
import { noise } from './painting'

/** Meters of land that pass in a second. */
const SPEED = 13
/** Meters between two knocks of the wheels on the joints of the rails. */
const KNOCK = 17

/** The lit mesh of a part, and the one that shines by itself. */
type Part = Mesh[]
type Parts = (name: string) => Part

const mod = (value: number, by: number) => ((value % by) + by) % by

/** The meshes of the train and the country, painted for the page. */
function useParts(): Parts {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(expressUrl, false, true)

  // The file has no normals; flat shading takes them from the faces.
  const paint = useMemo(
    () => Object.assign(new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), { flatShading: true }),
    [],
  )
  // What shines by itself needs no light.
  const glow = useMemo(() => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => glow.dispose(), [glow])

  return useMemo(() => {
    const mesh = (name: string, material: Material) => {
      const node = nodes[name]
      if (!(node instanceof Mesh)) return []
      const copy = node.clone()
      copy.material = material
      return [copy]
    }
    return (name: string) =>
      name.startsWith('rotor_')
        ? mesh(name, name === 'rotor_electro' || name === 'rotor_spectro' ? glow : paint)
        : [...mesh(`${name}_paint`, paint), ...mesh(`${name}_glow`, glow)]
  }, [nodes, paint, glow])
}

/** A part that stands still at the zero point of its group. */
function Solid({ part }: { part: Part }) {
  return (
    <>
      {part.map((mesh) => (
        <mesh key={mesh.name} geometry={mesh.geometry} material={mesh.material} raycast={() => null} />
      ))}
    </>
  )
}

/** x, y and z, and the turn of a copy that is not straight. */
type Place = [number, number, number, number?]

/** Moves one copy of a part, from the place it is given. */
type Move = (dummy: Object3D, time: number, index: number) => void

function CopiesOf({ mesh, places, move }: { mesh: Mesh; places: Place[]; move?: Move }) {
  const copies = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  const set = (time: number) => {
    const target = copies.current
    if (!target) return
    places.forEach(([x, y, z, turn = 0], index) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, turn, 0)
      move?.(dummy, time, index)
      dummy.updateMatrix()
      target.setMatrixAt(index, dummy.matrix)
    })
    target.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => set(0))
  useFrame(({ clock }) => {
    if (move && !window.SakugaFX?.calm) set(clock.elapsedTime)
  })

  return (
    <instancedMesh
      // A new number of copies needs a new buffer.
      key={places.length}
      ref={copies}
      args={[mesh.geometry, mesh.material as Material, places.length]}
      frustumCulled={false}
      raycast={() => null}
    />
  )
}

/** The same part at many places, in one draw for every mesh of it. */
function Copies({ part, places, move }: { part: Part; places: Place[]; move?: Move }) {
  if (places.length === 0) return null
  return (
    <>
      {part.map((mesh) => (
        <CopiesOf key={mesh.name} mesh={mesh} places={places} move={move} />
      ))}
    </>
  )
}

const turnWheel: Move = (dummy, time) => {
  dummy.rotation.x = -time * (SPEED / LAYOUT.wheel.radius) * 0.5
}

/** The carriages, the bridges between them, both decks, the engine and all the wheels. */
function Cars({ train, part }: { train: Train; part: Parts }) {
  const { module, tail, engine, wheel, spins } = LAYOUT
  const ring = useRef<Group>(null)

  const places = useMemo(() => {
    const pieces = (style: Style) =>
      train.cars
        .filter((car) => car.style === style)
        .flatMap((car) =>
          Array.from({ length: car.pieces }, (_, at): Place => [0, 0, car.back - at * module]),
        )
    const bogies: Place[] = [
      [0, 0, tail / 2],
      ...train.cars.flatMap((car): Place[] => [
        [0, 0, car.back - 1.9],
        [0, 0, car.back - car.length + 1.9],
      ]),
      ...engine.bogies.map((z): Place => [0, 0, train.engine + z]),
    ]
    return {
      styles: STYLES.map((style) => ({ style, pieces: pieces(style) })),
      joints: train.cars.map((car): Place => [0, 0, car.back - car.length]),
      bogies,
      wheels: bogies.flatMap(([, , z]) => wheel.axles.map((at): Place => [0, wheel.y, z + at])),
    }
  }, [train])

  useFrame(({ clock }) => {
    if (ring.current && !window.SakugaFX?.calm) ring.current.rotation.z = clock.elapsedTime * 0.5
  })

  return (
    <>
      {places.styles.map(({ style, pieces }) => {
        const spin = spins[style]
        return (
          <group key={style}>
            <Copies part={part(`car_${style}`)} places={pieces} />
            <Copies
              part={part(`rotor_${style}`)}
              places={pieces.map(([x, y, z]): Place => [x, y + spin.at[1], z + spin.at[2]])}
              move={(dummy, time, index) => {
                dummy.rotation.y = time * spin.speed + index * 0.7
              }}
            />
            <Copies
              part={part(`berth_${style}`)}
              // Each one is turned like the Resonator who stands there.
              places={train.stands
                .filter((stand) => stand.car.style === style)
                .map(({ position: [x, y, z], turn }): Place => [x, y, z, turn])}
            />
          </group>
        )
      })}
      <Copies part={part('joint')} places={places.joints} />
      <Copies part={part('bogie')} places={places.bogies} />
      <Copies part={part('wheel')} places={places.wheels} move={turnWheel} />
      <Solid part={part('tail')} />
      <group position={[0, 0, train.nose]}>
        <Solid part={part('nose')} />
      </group>
      <group position={[0, 0, train.engine]}>
        <Solid part={part('loco')} />
        <group position={engine.ring as [number, number, number]}>
          <group ref={ring}>
            <Solid part={part('ring')} />
          </group>
        </group>
      </group>
    </>
  )
}

const PUFFS = 22

/** The breath of the engine, which blows back over the roofs. */
function Smoke({ train }: { train: Train }) {
  const puffs = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const [x, y, z] = LAYOUT.engine.chimney

  useFrame(({ clock }) => {
    if (!puffs.current) return
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime * 0.28
    for (let index = 0; index < PUFFS; index++) {
      const age = (time + index / PUFFS) % 1
      dummy.position.set(
        x + Math.sin(index * 2.4 + age * 5) * age * 3,
        y + 0.4 + Math.sqrt(age) * 7,
        train.engine + z + age * 46,
      )
      dummy.rotation.set(index, age * 3 + index, 0)
      // Grows as it leaves the chimney, and melts away at the end.
      dummy.scale.setScalar((0.35 + age * 2.1) * (1 - age ** 4))
      dummy.updateMatrix()
      puffs.current.setMatrixAt(index, dummy.matrix)
    }
    puffs.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={puffs}
      args={[undefined, undefined, PUFFS]}
      frustumCulled={false}
      raycast={() => null}
    >
      <icosahedronGeometry />
      <meshToonMaterial color="#f4efff" transparent opacity={0.75} />
    </instancedMesh>
  )
}

/** How many lengths of land and of rails are drawn, and how far ahead of the visitor. */
const LANDS = { count: 14, ahead: 330 }
const TRACKS = { count: 17, ahead: 360 }
/** How deep a length of land sinks into the haze while it turns into another country. */
const SINK = 34
const GATE_EVERY = 230

type Slot = { style: Style; rise: number }

/**
 * Everything outside the windows. It all comes toward the end of the train, around the visitor.
 * The land is that of the carriage the visitor is in: after a new carriage is entered, the land
 * sinks away and rises as the new country, the nearest first.
 */
function Country({ train, roam, part }: { train: Train; roam: RefObject<Roam>; part: Parts }) {
  const travel = useRef(0)
  const knocked = useRef(0)
  const lands = useRef<Group>(null)
  const tracks = useRef<Group>(null)
  const gate = useRef<Group>(null)
  const whale = useRef<Group>(null)
  const flukes = useRef<Group>(null)
  const moon = useRef<Group>(null)
  const slots = useRef<Slot[]>([])
  const wanted = useRef<{ style: Style; since: number }>({ style: 'glacio', since: 0 })

  const country = useMemo(() => new Map(STYLES.map((style) => [style, part(`land_${style}`)])), [part])
  // The light of the gates takes the color of the country.
  const gateParts = useMemo(() => {
    const [paint, glow] = part('gate')
    const light = new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide })
    const copy = glow.clone()
    copy.material = light
    return { meshes: [paint, copy], light }
  }, [part])
  useEffect(() => () => gateParts.light.dispose(), [gateParts])
  // The moon is too far for the haze.
  const moonPart = useMemo(() => {
    const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: false })
    return part('moon').map((mesh) => {
      const copy = mesh.clone()
      copy.material = material
      return copy
    })
  }, [part])
  const tint = useMemo(() => new Color(), [])

  useFrame(({ clock }, delta) => {
    const step = Math.min(delta, 0.05)
    const calm = window.SakugaFX?.calm
    const time = calm ? 0 : clock.elapsedTime
    const { x, z } = roam.current
    if (!calm) travel.current += SPEED * step
    if (travel.current - knocked.current > KNOCK) {
      knocked.current = travel.current
      playClack()
    }

    const car = carAt(train, z)
    const style = car?.style ?? 'glacio'
    const first = slots.current.length === 0
    if (wanted.current.style !== style) wanted.current = { style, since: clock.elapsedTime }

    lands.current?.children.forEach((child, index) => {
      const span = LANDS.count * LAYOUT.chunk
      const offset = mod(index * LAYOUT.chunk + travel.current - z, span) - LANDS.ahead
      const slot = (slots.current[index] ??= { style, rise: 1 })
      const behind = clock.elapsedTime - wanted.current.since
      const changing = slot.style !== wanted.current.style && behind > Math.abs(offset) / 260
      if (calm) slot.style = wanted.current.style
      else if (changing) {
        slot.rise -= step * 2.2
        if (slot.rise <= 0) Object.assign(slot, { style: wanted.current.style, rise: 0 })
      } else slot.rise = Math.min(slot.rise + step * 1.6, 1)

      child.position.set(0, -SINK * (1 - slot.rise) ** 2, z + offset)
      if (first || child.userData.style !== slot.style) {
        child.userData.style = slot.style
        child.children.forEach((mesh, at) => {
          const source = country.get(slot.style)![at]
          if (source) (mesh as Mesh).geometry = source.geometry
        })
      }
    })

    tracks.current?.children.forEach((child, index) => {
      const span = TRACKS.count * LAYOUT.chunk
      child.position.z = z + mod(index * LAYOUT.chunk + travel.current - z, span) - TRACKS.ahead
    })

    if (gate.current) {
      gate.current.position.z = z + mod(travel.current - z, GATE_EVERY) - GATE_EVERY + 35
    }
    gateParts.light.color.lerp(tint.set(themeOf(car?.element ?? '').accent), 1 - Math.exp(-3 * step))

    // The whale of the sky swims beside the train, now ahead of it and now behind.
    whale.current?.position.set(
      -44 + Math.sin(time * 0.11) * 8,
      13 + Math.sin(time * 0.37) * 2.5,
      z - 36 + Math.sin(time * 0.07) * 48,
    )
    whale.current?.rotation.set(Math.sin(time * 0.37) * -0.06, Math.cos(time * 0.07) * 0.08, 0)
    if (flukes.current) flukes.current.rotation.x = Math.sin(time * 1.3) * 0.28
    moon.current?.position.set(x + 96, 66, z - 235)
    if (moon.current) moon.current.rotation.y = Math.sin(time * 0.05) * 0.3
  })

  return (
    <>
      <group ref={lands}>
        {Array.from({ length: LANDS.count }, (_, index) => (
          // Every other length is mirrored, so the country does not repeat itself so plainly.
          <group key={index} scale={[index % 2 ? -1 : 1, 1, 1]}>
            {country.get('glacio')!.map((mesh) => (
              <mesh
                key={mesh.name}
                geometry={mesh.geometry}
                material={mesh.material}
                frustumCulled={false}
                raycast={() => null}
              />
            ))}
          </group>
        ))}
      </group>
      <group ref={tracks}>
        {Array.from({ length: TRACKS.count }, (_, index) => (
          <group key={index}>
            <Solid part={part('track')} />
          </group>
        ))}
      </group>
      <group ref={gate}>
        <Solid part={gateParts.meshes} />
      </group>
      <group ref={whale} scale={1.15}>
        <Solid part={part('whale')} />
        <group ref={flukes} position={LAYOUT.whaletail as [number, number, number]}>
          <Solid part={part('whaletail')} />
        </group>
      </group>
      <group ref={moon}>
        <Solid part={moonPart} />
      </group>
    </>
  )
}

const STARS = new Float32Array(
  Array.from({ length: 600 }, (_, index) => {
    const angle = noise(index + 31) * Math.PI * 2
    const far = 170 + noise(index + 1300) * 80
    return [Math.sin(angle) * far, 12 + noise(index + 2600) * 170, Math.cos(angle) * far]
  }).flat(),
)

/** Stars that stay around the visitor. */
function Stars({ roam }: { roam: RefObject<Roam> }) {
  const stars = useRef<Group>(null)
  useFrame(() => stars.current?.position.set(roam.current.x, 0, roam.current.z))
  return (
    <group ref={stars}>
      <points raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[STARS, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#fff6dd" size={0.75} fog={false} />
      </points>
    </group>
  )
}

/** The train and the country it crosses, as scripts/build-express.py models them. */
export default function ExpressMap({ train, roam }: { train: Train; roam: RefObject<Roam> }) {
  const part = useParts()
  return (
    <>
      <Cars train={train} part={part} />
      <Smoke train={train} />
      <Country train={train} roam={roam} part={part} />
      <Stars roam={roam} />
    </>
  )
}

useGLTF.preload(expressUrl, false, true)
