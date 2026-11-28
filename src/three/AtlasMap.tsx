import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
  type InstancedMesh,
  type PointsMaterial,
} from 'three'
import orreryUrl from '../assets/map/orrery.glb?url'
import {
  colorsOf,
  GROUND,
  LAYOUT,
  MODELS,
  planetOf,
  standing,
  type Land,
  type Planet,
  type Site,
} from '../lib/atlas'
import { assetUrl } from '../lib/characters'
import { regionColors, type Region } from '../lib/map'
import { CARD, drawCard } from './atlasFace'
import Sign from './Sign'

export type Parts = Map<string, Mesh>

const PIVOTS = LAYOUT.pivots as unknown as Record<string, [number, number, number]>
const noRaycast = () => null
const calm = () => Boolean(window.SakugaFX?.calm)
const UP = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)

/** The way to the sun, in the axes of the planet, so a walk to the far side ends in the night. */
export const SUN = new Vector3(0.14, 0.62, -0.77).normalize()

/** The same numbers at every visit, from 0 to 1. */
function dice(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A point anywhere on a ball, all places equally likely. */
function anywhere(roll: () => number) {
  const y = roll() * 2 - 1
  const angle = roll() * Math.PI * 2
  const ring = Math.sqrt(1 - y * y)
  return new Vector3(ring * Math.cos(angle), y, ring * Math.sin(angle))
}

/** The meshes of the file, each with the material that the end of its name asks for. */
export function useAtlasParts(): Parts {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(orreryUrl, false, true)

  const materials = useMemo(() => {
    const painted = { vertexColors: true, side: DoubleSide, fog: false }
    return {
      lit: new MeshLambertMaterial({ ...painted, flatShading: true }),
      glow: new MeshBasicMaterial(painted),
      beam: new MeshBasicMaterial({
        ...painted,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    }
  }, [])
  useEffect(() => () => Object.values(materials).forEach((item) => item.dispose()), [materials])

  return useMemo(() => {
    const found = Object.values(nodes)
      .filter((node): node is Mesh => node instanceof Mesh)
      .map((node) => {
        const mesh = node.clone()
        const end = node.name.slice(node.name.lastIndexOf('_') + 1)
        mesh.material =
          end === 'glow' ? materials.glow : end === 'beam' ? materials.beam : materials.lit
        mesh.updateMatrix()
        return mesh
      })
    return new Map(found.map((mesh) => [mesh.name, mesh]))
  }, [nodes, materials])
}

/** One mesh of the file, with the place that the file gives it. */
export function Part({ mesh, solid = false }: { mesh?: Mesh; solid?: boolean }) {
  if (!mesh) return null
  return (
    <mesh
      geometry={mesh.geometry}
      material={mesh.material}
      position={mesh.position}
      quaternion={mesh.quaternion}
      scale={mesh.scale}
      // Only what is solid stops a click from reaching what is behind it.
      {...(solid ? {} : { raycast: noRaycast })}
    />
  )
}

const both = (parts: Parts, name: string) => (
  <>
    <Part mesh={parts.get(`${name}_paint`)} />
    <Part mesh={parts.get(`${name}_glow`)} />
  </>
)

/** Turns a thing about its upright line, so it faces the eyes. */
function Billboard({
  position,
  scale,
  children,
}: {
  position: [number, number, number]
  scale: number
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  const eye = useMemo(() => new Vector3(), [])
  useFrame(({ camera }) => {
    const thing = group.current
    if (!thing?.parent) return
    thing.parent.worldToLocal(eye.copy(camera.position)).sub(thing.position)
    thing.rotation.y = Math.atan2(eye.x, eye.z)
  })
  return (
    <group ref={group} position={position} scale={scale}>
      {children}
    </group>
  )
}

/** A name that faces the eyes from every side, and hangs below its planet on the screen. */
function Caption({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  const work = useMemo(() => ({ turn: new Quaternion(), down: new Vector3() }), [])
  useFrame(({ camera }) => {
    const thing = group.current
    if (!thing?.parent) return
    thing.parent.getWorldQuaternion(work.turn).invert()
    thing.position.copy(work.down.set(0, -5.8, 0).applyQuaternion(camera.quaternion))
    thing.position.applyQuaternion(work.turn)
    thing.quaternion.copy(work.turn).multiply(camera.quaternion)
  })
  return (
    <group ref={group} scale={4.2}>
      {children}
    </group>
  )
}

/** The part of a landmark that moves, and moves more for a visitor. */
function Moving({ parts, kind, level, seed }: { parts: Parts; kind: string; level: RefObject<number>; seed: number }) {
  const group = useRef<Group>(null)
  const angle = useRef(seed)
  const model = MODELS[kind]
  const [x, y, z] = model.pivot

  useFrame(({ clock }, delta) => {
    const thing = group.current
    if (!thing) return
    const step = Math.min(delta, 0.05)
    const woken = level.current
    const still = calm()
    const time = still ? 0 : clock.elapsedTime + seed
    const wave = Math.sin(time * 1.3)
    if (!still) angle.current += step * (0.25 + woken * 1.3)
    switch (model.motion) {
      case 'spin':
        thing.rotation.y = angle.current
        break
      case 'wheel':
        thing.rotation.z = angle.current * 1.4
        break
      case 'tumble':
        thing.rotation.set(angle.current * 0.6, angle.current, 0)
        break
      case 'flag':
        thing.rotation.y = Math.sin(time * 3) * (0.12 + woken * 0.2)
        break
      case 'rock':
        thing.rotation.z = wave * (0.04 + woken * 0.09)
        break
      case 'sway':
        thing.rotation.z = Math.sin(time * 1.6) * (0.07 + woken * 0.3)
        break
      case 'bob':
        thing.position.y = y + wave * 0.14 + woken * 0.45
        thing.rotation.y = Math.sin(time * 0.4) * 0.25
        break
      case 'rise':
        // It stays in its hole until somebody comes.
        thing.position.y = y - 1.1 + woken * 1.7 + wave * 0.1 * woken
        thing.rotation.y = Math.sin(time * 0.8) * 0.5 * woken
        break
      case 'pulse':
        thing.scale.setScalar(1 + Math.sin(time * 2.6) * 0.08 + woken * 0.3)
        break
    }
  })

  return (
    <group ref={group} position={[x, y, z]}>
      <Part mesh={parts.get(`or_site_${kind}_move`)} />
    </group>
  )
}

/** The picture of an area on its easel. */
function Picture({ land }: { land: Land }) {
  const [texture, setTexture] = useState<CanvasTexture>()
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CARD.width
    canvas.height = CARD.height
    const g = canvas.getContext('2d')!
    drawCard(g, land)
    const face = new CanvasTexture(canvas)
    face.colorSpace = SRGBColorSpace
    face.anisotropy = 8
    setTexture(face)

    const image = new Image()
    image.onload = () => {
      drawCard(g, land, image)
      face.needsUpdate = true
    }
    if (land.area.picture) image.src = assetUrl(land.area.picture)
    return () => {
      image.onload = null
      face.dispose()
    }
  }, [land.id])

  if (!texture) return null
  return (
    <mesh position={[0, 1.84, 0.06]}>
      <planeGeometry args={[2.55, 1.7]} />
      <meshBasicMaterial map={texture} fog={false} />
    </mesh>
  )
}

/** The flag of a surveyed area, which rises out of the ground. */
function Flag({ parts }: { parts: Parts }) {
  const whole = useRef<Group>(null)
  const cloth = useRef<Group>(null)
  const [x, y, z] = PIVOTS.or_flag_move
  useFrame(({ clock }, delta) => {
    if (!whole.current || !cloth.current) return
    const still = calm()
    const next = still ? 1 : MathUtils.damp(whole.current.scale.y, 1, 4, Math.min(delta, 0.05))
    whole.current.scale.setScalar(next)
    cloth.current.rotation.y = still ? 0 : Math.sin(clock.elapsedTime * 3.2) * 0.35
  })
  return (
    <group ref={whole} scale={0.02}>
      <Part mesh={parts.get('or_flag_paint')} />
      <group ref={cloth} position={[x, y, z]}>
        <Part mesh={parts.get('or_flag_move')} />
      </group>
    </group>
  )
}

const at = ({ up }: { up: Vector3 }, radius: number) =>
  up.clone().multiplyScalar(radius)

type SiteProps = {
  parts: Parts
  land: Land
  site: Site
  radius: number
  awake: boolean
  drawn: boolean
  surveyed: boolean
  index: number
  onPick: () => void
}

/** One area on its planet: its landmark, its name, its picture and its flag. */
export function AreaSite({ parts, land, site, radius, awake, drawn, surveyed, index, onPick }: SiteProps) {
  const model = MODELS[site.kind]
  const body = useRef<Group>(null)
  const level = useRef(0)
  const theme = colorsOf(land)
  const { reports } = land.area

  useFrame((_, delta) => {
    level.current = calm()
      ? Number(awake)
      : MathUtils.damp(level.current, Number(awake), 3, Math.min(delta, 0.05))
    // A small hop of joy when somebody arrives.
    body.current?.scale.setScalar(1 + Math.sin(level.current * Math.PI) * 0.07 + level.current * 0.02)
  })

  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    // A drag that looks around also ends in a click.
    if (event.delta <= 6) onPick()
  }

  return (
    <>
      <group position={at(site, radius)} quaternion={site.frame}>
        <group ref={body} onClick={pick}>
          <Part mesh={parts.get(`or_site_${site.kind}_paint`)} solid />
          <Part mesh={parts.get(`or_site_${site.kind}_glow`)} />
          <Moving parts={parts} kind={site.kind} level={level} seed={index * 1.7} />
        </group>
        <Billboard position={[0, Math.max(model.high + 1, 5.2), 0]} scale={2}>
          <Sign
            solid
            title={land.name}
            note={surveyed ? 'Surveyed ✓' : `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`}
            shadow={surveyed ? '#ffd45a' : theme.accent}
            position={[0, 0, 0]}
          />
        </Billboard>
      </group>

      <group position={at(site.easel, radius)} quaternion={site.easel.frame} onClick={pick}>
        <Part mesh={parts.get('or_easel_paint')} />
        {drawn && <Picture land={land} />}
      </group>

      {surveyed && (
        <group position={at(site.flag, radius)} quaternion={site.flag.frame}>
          <Flag parts={parts} />
        </group>
      )}
    </>
  )
}

type Spread = { matrix: Matrix4 }

/** Many copies of one shape. */
function Many({ geometry, material, spread }: { geometry: BufferGeometry; material: Mesh['material']; spread: Spread[] }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const copies = mesh.current
    if (!copies) return
    spread.forEach(({ matrix }, index) => copies.setMatrixAt(index, matrix))
    copies.instanceMatrix.needsUpdate = true
  }, [spread])
  return (
    <instancedMesh
      key={spread.length}
      ref={mesh}
      args={[geometry, undefined, spread.length]}
      material={material}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}

/** The small things that grow and lie all over a planet, away from the landmarks. */
function Bits({ parts, region, planet }: { parts: Parts; region: number; planet: Planet }) {
  const kinds = useMemo(() => {
    const roll = dice(region * 97 + 5)
    const { radius, sites, exit } = planet
    const taken = [
      ...sites.map((site) => ({ up: site.up, away: GROUND + 0.5 })),
      ...sites.map((site) => ({ up: site.easel.up, away: 1.7 })),
      { up: UP, away: 3.4 },
      { up: exit.up, away: 2 },
    ]
    return [0, 1, 2].map((kind) => {
      const mesh = parts.get(`or_bit_${planetOf(region)}_${kind}_paint`)
      const spread: Spread[] = []
      const wanted = Math.round(radius * radius * [0.5, 0.22, 0.2][kind])
      for (let tries = 0; tries < wanted * 3 && spread.length < wanted && mesh; tries++) {
        const up = anywhere(roll)
        if (taken.some((place) => up.angleTo(place.up) * radius < place.away)) continue
        const spin = new Quaternion().setFromAxisAngle(UP, roll() * Math.PI * 2)
        const turn = new Quaternion().setFromUnitVectors(UP, up).multiply(spin)
        const size = 0.6 + roll() * 0.8
        const matrix = new Matrix4()
          .compose(up.multiplyScalar(radius - 0.03), turn, new Vector3(size, size, size))
          .multiply(mesh.matrix)
        spread.push({ matrix })
      }
      return { mesh, spread }
    })
  }, [parts, region, planet])

  return (
    <>
      {kinds.map(
        ({ mesh, spread }, index) =>
          mesh && (
            <Many
              key={`${region}-${index}`}
              geometry={mesh.geometry}
              material={mesh.material}
              spread={spread}
            />
          ),
      )}
    </>
  )
}

/** Lays a flat thing on the ground at "up". */
const onGround = (up: Vector3, radius: number, size: number, turn?: Quaternion) =>
  new Matrix4().compose(
    up.clone().multiplyScalar(radius),
    turn ?? new Quaternion().setFromUnitVectors(UP, up),
    ONE.clone().multiplyScalar(size),
  )

/** The dotted route from the place of arrival through all areas, golden where it was walked. */
function Route({ planet, flags }: { planet: Planet; flags: boolean[] }) {
  const mesh = useRef<InstancedMesh>(null)
  const dot = useMemo(() => new CircleGeometry(0.17, 8).rotateX(-Math.PI / 2), [])
  useEffect(() => () => dot.dispose(), [dot])
  const dots = useMemo(() => {
    const { radius, sites } = planet
    return sites.flatMap((site, leg) => {
      const from = leg ? sites[leg - 1].up : UP
      const angle = from.angleTo(site.up)
      const axis = new Vector3().crossVectors(from, site.up).normalize()
      const count = Math.floor((angle * radius) / 1.15)
      return Array.from({ length: count }, (_, index) => {
        const up = from.clone().applyAxisAngle(axis, (angle * (index + 0.5)) / count)
        return { leg, up }
      }).filter(
        ({ up }) =>
          up.angleTo(UP) * radius > 2.8 &&
          sites.every((other) => up.angleTo(other.up) * radius > GROUND + 0.3),
      )
    })
  }, [planet])

  useLayoutEffect(() => {
    const copies = mesh.current
    if (!copies) return
    const plain = new Color('#ffffff')
    const walked = new Color('#ffc42e')
    dots.forEach(({ leg, up }, index) => {
      copies.setMatrixAt(index, onGround(up, planet.radius + 0.05, flags[leg] ? 1.25 : 1))
      copies.setColorAt(index, flags[leg] ? walked : plain)
    })
    copies.instanceMatrix.needsUpdate = true
    if (copies.instanceColor) copies.instanceColor.needsUpdate = true
  }, [dots, flags.join()])

  return (
    <instancedMesh
      key={dots.length}
      ref={mesh}
      args={[dot, undefined, dots.length]}
      frustumCulled={false}
      raycast={noRaycast}
    >
      <meshBasicMaterial transparent opacity={0.85} depthWrite={false} fog={false} />
    </instancedMesh>
  )
}

/** How many drops of ink a walk leaves behind. */
const DROPS = 260

/** The line that the walker draws onto the map, in ink that is laid drop after drop. */
export type Ink = { drop: (up: Vector3) => void }

export function Trail({ ink, radius, color }: { ink: RefObject<Ink | null>; radius: number; color: string }) {
  const mesh = useRef<InstancedMesh>(null)
  const dot = useMemo(() => new CircleGeometry(0.11, 7).rotateX(-Math.PI / 2), [])
  useEffect(() => () => dot.dispose(), [dot])

  useLayoutEffect(() => {
    const copies = mesh.current
    if (!copies) return
    // A drop that has not fallen has no size.
    const none = new Matrix4().makeScale(0, 0, 0)
    for (let index = 0; index < DROPS; index++) copies.setMatrixAt(index, none)
    copies.instanceMatrix.needsUpdate = true
    let next = 0
    let last: Vector3 | undefined
    ink.current = {
      drop: (up) => {
        if (last && last.angleTo(up) * radius < 0.7) return
        last = up.clone()
        copies.setMatrixAt(next, onGround(up, radius + 0.07, 1))
        copies.instanceMatrix.needsUpdate = true
        next = (next + 1) % DROPS
      },
    }
  }, [radius])

  return (
    <instancedMesh ref={mesh} args={[dot, undefined, DROPS]} frustumCulled={false} raycast={noRaycast}>
      <meshBasicMaterial color={color} fog={false} />
    </instancedMesh>
  )
}

/** The ground of one planet and everything that lies on it. */
export function Ground({ parts, region, planet, flags }: { parts: Parts; region: number; planet: Planet; flags: boolean[] }) {
  const name = `or_planet_${planetOf(region)}`
  return (
    <>
      <group scale={planet.radius}>{both(parts, name)}</group>
      <Bits parts={parts} region={region} planet={planet} />
      <Route planet={planet} flags={flags} />
      {/* The compass rose of the place of arrival. */}
      <group position={[0, planet.radius, 0]}>{both(parts, 'or_rose')}</group>
    </>
  )
}

/** Where the other planets hang, as seen from the place of arrival. */
const PLACES = [
  new Vector3(-0.42, 0.5, -0.76),
  new Vector3(0.47, 0.48, -0.74),
  new Vector3(0.66, 0.5, 0.56),
  new Vector3(-0.8, -0.45, 0.4),
].map((place) => place.normalize())

function Neighbor({ parts, region, place, index, onTravel }: { parts: Parts; region: Region; place: Vector3; index: number; onTravel: () => void }) {
  const globe = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const [over, setOver] = useState(false)
  const turn = useMemo(() => new Quaternion().setFromUnitVectors(UP, place), [place])
  const theme = regionColors(region.id)

  useFrame(({ clock }, delta) => {
    if (!globe.current || !ring.current) return
    const step = Math.min(delta, 0.05)
    const size = over ? 4 : 3.3
    globe.current.scale.setScalar(MathUtils.damp(globe.current.scale.x, size, 8, step))
    if (calm()) return
    globe.current.rotation.y = clock.elapsedTime * 0.12 + index
    ring.current.rotation.y = clock.elapsedTime * 0.3
  })

  return (
    // Its own upright line points away from the planet underfoot.
    <group position={place.clone().multiplyScalar(48)} quaternion={turn}>
      <group
        ref={globe}
        scale={3.3}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setOver(true)
        }}
        onPointerOut={() => setOver(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          if (event.delta <= 6) onTravel()
        }}
      >
        <Part mesh={parts.get(`or_planet_${planetOf(region.id)}_paint`)} solid />
        <Part mesh={parts.get(`or_planet_${planetOf(region.id)}_glow`)} />
      </group>
      <group rotation={[0.4, 0, 0.25]}>
        <group ref={ring} scale={4.8}>
          {both(parts, 'or_hoop')}
        </group>
      </group>
      <Caption>
        <Sign
          solid
          title={region.name}
          note={`${region.areas.length} areas · click to travel`}
          shadow={theme.accent}
          position={[0, 0, 0]}
        />
      </Caption>
    </group>
  )
}

/** The brass hoops of the armillary sphere: their size, their tilt and how fast they turn. */
const HOOPS = [
  { size: 55, tilt: [0.45, 0, 0.2], speed: 0.012 },
  { size: 61, tilt: [-0.9, 0, 0.55], speed: -0.009 },
  { size: 68, tilt: [1.35, 0, -0.35], speed: 0.006 },
] as const

/** What hangs far away and turns with the planet: stars, hoops, the sun and the other planets. */
export function Heavens({
  parts,
  others,
  night,
  onTravel,
}: {
  parts: Parts
  others: Region[]
  night: RefObject<number>
  onTravel: (region: Region) => void
}) {
  const hoops = useRef<(Group | null)[]>([])
  const rays = useRef<Group>(null)
  const stars = useRef<PointsMaterial>(null)
  const field = useMemo(() => {
    const roll = dice(11)
    const geometry = new BufferGeometry()
    const points = Array.from({ length: 1400 }, () =>
      anywhere(roll).multiplyScalar(120 + roll() * 60),
    )
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(points.flatMap((point) => point.toArray()), 3),
    )
    return geometry
  }, [])
  useEffect(() => () => field.dispose(), [field])
  const toPlanet = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), SUN.clone().negate()),
    [],
  )

  useFrame(({ clock }) => {
    if (stars.current) stars.current.opacity = 0.12 + night.current * 0.88
    if (calm()) return
    hoops.current.forEach((hoop, index) => {
      if (hoop) hoop.rotation.y = clock.elapsedTime * HOOPS[index].speed
    })
    if (rays.current) rays.current.rotation.z = clock.elapsedTime * 0.15
  })

  return (
    <>
      <points geometry={field} raycast={noRaycast}>
        <pointsMaterial ref={stars} color="#ffffff" size={0.9} transparent depthWrite={false} fog={false} />
      </points>

      {HOOPS.map(({ size, tilt }, index) => (
        <group key={size} rotation={[...tilt]}>
          <group
            ref={(group) => {
              hoops.current[index] = group
            }}
            scale={size}
          >
            {both(parts, 'or_hoop')}
          </group>
        </group>
      ))}

      <group position={SUN.clone().multiplyScalar(66)} quaternion={toPlanet} scale={3.4}>
        <Part mesh={parts.get('or_sun_glow')} />
        <group ref={rays}>
          <Part mesh={parts.get('or_sun_move')} />
        </group>
      </group>

      {others.slice(0, PLACES.length).map((region, index) => (
        <Neighbor
          key={region.id}
          parts={parts}
          region={region}
          place={PLACES[index]}
          index={index}
          onTravel={() => onTravel(region)}
        />
      ))}
    </>
  )
}

/** A flight around a planet: a great circle at some height, with its own pace. */
function flights(count: number, seed: number) {
  const roll = dice(seed)
  return Array.from({ length: count }, () => {
    const from = anywhere(roll)
    const axis = anywhere(roll).cross(from).normalize()
    return { from, axis, phase: roll() * 7, high: roll(), pace: 0.6 + roll() * 0.8 }
  })
}

/** Copies of one model that drift around the planet, upright above the ground below them. */
function Flock({
  parts,
  name,
  radius,
  count,
  seed,
  high,
  size,
  speed,
  spin = 0,
  forward = false,
}: {
  parts: Parts
  name: string
  radius: number
  count: number
  seed: number
  /** The lowest and the highest height above the ground. */
  high: [number, number]
  size: number
  speed: number
  spin?: number
  /** For things with a head: they look where they fly. */
  forward?: boolean
}) {
  const group = useRef<Group>(null)
  const paths = useMemo(() => flights(count, seed), [count, seed])
  const turn = useMemo(() => new Quaternion(), [])
  const way = useMemo(() => new Vector3(), [])

  useFrame(({ clock }) => {
    const time = calm() ? 0 : clock.elapsedTime
    group.current?.children.forEach((child, index) => {
      const { from, axis, phase, high: share, pace } = paths[index]
      const up = child.position.copy(from).applyAxisAngle(axis, phase + time * speed * pace)
      if (forward) {
        child.quaternion.copy(standing(up, way.crossVectors(axis, up).normalize()))
      } else {
        child.quaternion.setFromUnitVectors(UP, up)
        child.quaternion.multiply(turn.setFromAxisAngle(UP, phase + time * spin))
      }
      const rise = MathUtils.lerp(high[0], high[1], share) + Math.sin(time * pace + phase) * 0.35
      up.multiplyScalar(radius + rise)
    })
  })

  return (
    <group ref={group}>
      {paths.map((path, index) => (
        <group key={index} scale={size * (0.75 + path.high * 0.5)}>
          {both(parts, name)}
        </group>
      ))}
    </group>
  )
}

/** How many links the body of the dragon has. */
const LINKS = 24

/** The dragon of Huanglong, which winds around its planet and passes over the place of arrival. */
function Dragon({ parts, radius }: { parts: Parts; radius: number }) {
  const group = useRef<Group>(null)
  const work = useMemo(() => ({ ahead: new Vector3() }), [])

  useFrame(({ clock }) => {
    const time = (calm() ? 0 : clock.elapsedTime * 0.09) + 1.95
    const way = (t: number, to: Vector3) =>
      to
        .set(Math.cos(t), Math.sin(t), 0.45 * Math.sin(t * 3))
        .normalize()
        .multiplyScalar(radius + 9.5 + Math.sin(t * 9) * 1.1)
    group.current?.children.forEach((link, index) => {
      const t = time - index * (1.1 / (radius + 9.5))
      way(t, link.position)
      way(t + 0.02, work.ahead).sub(link.position)
      const up = link.position.clone().normalize()
      const front = work.ahead.addScaledVector(up, -work.ahead.dot(up)).normalize()
      link.quaternion.copy(standing(up, front))
    })
  })

  return (
    <group ref={group}>
      {Array.from({ length: LINKS }, (_, index) => {
        const tail = index === LINKS - 1
        const size = index ? 1.35 * (1 - (index / LINKS) * 0.55) : 1.55
        return (
          <group key={index} scale={size}>
            {both(parts, index === 0 ? 'or_dragon_head' : tail ? 'or_dragon_tail' : 'or_dragon_body')}
          </group>
        )
      })}
    </group>
  )
}

/** What flies low around a planet; every region has something of its own. */
export function Orbiters({
  parts,
  region,
  radius,
  night,
}: {
  parts: Parts
  region: number
  radius: number
  night: RefObject<number>
}) {
  const lights = useRef<Group>(null)
  useFrame(({ clock }) => {
    // The northern lights are faint by day, and bright in the night.
    const curtain = parts.get('or_aurora_beam')?.material
    if (curtain instanceof MeshBasicMaterial) curtain.opacity = 0.05 + night.current * 0.32
    if (lights.current && !calm()) lights.current.rotation.y = clock.elapsedTime * 0.035
  })
  const kind = planetOf(region)
  return (
    <>
      <Flock parts={parts} name="or_cloud" radius={radius} count={kind === 900 ? 5 : 12} seed={region + 3}
        high={[7.5, 11]} size={1.4} speed={0.018} />
      <Flock parts={parts} name="or_comet" radius={radius} count={4} seed={region + 9}
        high={[18, 30]} size={2.2} speed={0.22} forward />
      {kind === 1 && <Dragon parts={parts} radius={radius} />}
      {kind === 900 && (
        <Flock parts={parts} name="or_drone" radius={radius} count={14} seed={41}
          high={[4.5, 8]} size={0.9} speed={0.09} spin={1.6} />
      )}
      {kind === 3 && (
        <Flock parts={parts} name="or_balloon" radius={radius} count={13} seed={23}
          high={[6.5, 12]} size={1.15} speed={0.025} />
      )}
      {kind === 4 && (
        <group ref={lights}>
          <group rotation={[0.55, 0, 0.2]} scale={radius * 1.9}>
            <Part mesh={parts.get('or_aurora_beam')} />
          </group>
          <group rotation={[-1.1, 0.8, 0]} scale={radius * 2.2}>
            <Part mesh={parts.get('or_aurora_beam')} />
          </group>
        </group>
      )}
    </>
  )
}

useGLTF.preload(orreryUrl, false, true)
