import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl, Outlines, useGLTF } from '@react-three/drei'
import { BackSide, DoubleSide, MathUtils, Mesh, MeshToonMaterial, PerspectiveCamera, Vector3, type Group } from 'three'
import { regionColors, type Region } from '../lib/map'
import islandsUrl from '../assets/map/islands.glb?url'
import MapLabel from './MapLabel'

const INK = '#1d1a4a'
const PICKED = '#ff5fa8'
export const WORLD_FOV = 35
const SLOPE = Math.tan(MathUtils.degToRad(WORLD_FOV / 2))
/** A drag that turns the map also ends in a click. Pointer moves above this are drags. */
const DRAG = 6

type Spot = [number, number, number]

/**
 * How big each island is, and where it floats on a wide and on a narrow screen. A region
 * without an entry is only in the strip.
 */
const ISLANDS: Record<number, { radius: number; wide: Spot; narrow: Spot }> = {
  1: { radius: 5.4, wide: [-12, -0.4, 1.5], narrow: [-5.8, 0, 5.5] },
  900: { radius: 3.9, wide: [-4.2, 1.6, -5.5], narrow: [-5.2, 2.2, -8] },
  3: { radius: 5.4, wide: [3.6, -1, 3], narrow: [5.8, -0.6, 4] },
  4: { radius: 5.6, wide: [12.4, 0.6, -2.5], narrow: [5.6, 1.6, -8.5] },
}

/** Pixels at the edges of the screen that the page covers with its own bars and panels. */
export type Insets = { top: number; right: number; bottom: number }

/** The part of the world that the camera has to fit on screen, and where it looks from. */
const OVERVIEW = {
  wide: { width: 40, height: 16 },
  narrow: { width: 25, height: 24 },
  from: new Vector3(0, 0.5, 1).normalize(),
}
const CLOSE_FROM = new Vector3(0, 0.85, 1).normalize()

/** [x, y, z, size] of every cloud. */
const CLOUDS: [number, number, number, number][] = [
  [-19, -4, -8, 1.5],
  [-8, -6.5, 2, 1.1],
  [1, -7, -12, 1.8],
  [10, -6, 6, 0.9],
  [20, -3.5, -9, 1.6],
  [-14, 5, -18, 1.2],
  [9, 7, -20, 1.4],
]

const calm = () => Boolean(window.SakugaFX?.calm)

function Cloud({ at: [x, y, z, size], index }: { at: [number, number, number, number]; index: number }) {
  const root = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (root.current && !calm()) {
      root.current.position.x = x + Math.sin(clock.elapsedTime * 0.08 + index * 2) * 1.6
    }
  })

  return (
    <group ref={root} position={[x, y, z]} scale={[size, size * 0.55, size]}>
      {[
        [0, 0, 0, 1.2],
        [1.2, -0.2, 0.2, 0.85],
        [-1.2, -0.25, -0.1, 0.75],
        [0.35, 0.45, -0.3, 0.8],
      ].map(([px, py, pz, radius], puff) => (
        <mesh key={puff} position={[px, py, pz]}>
          <icosahedronGeometry args={[radius, 1]} />
          <meshToonMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

type PinProps = {
  position: Vector3
  name: string
  color: string
  picked: boolean
  hovered: boolean
  onHover: (over: boolean) => void
  onClick: () => void
}

/** The beacon of one area: a gem that floats over a ring on the ground. */
function Pin({ position, name, color, picked, hovered, onHover, onClick }: PinProps) {
  const gem = useRef<Group>(null)
  const lit = picked || hovered

  useFrame(({ clock }, delta) => {
    if (!gem.current) return
    const still = calm()
    const lift = still ? 0 : Math.sin(clock.elapsedTime * 2.4 + position.x * 3) * 0.06
    gem.current.position.y = (picked ? 1.35 : 0.85) + lift
    if (!still) gem.current.rotation.y += delta * (picked ? 3 : 0.8)
    const size = picked ? 1.55 : hovered ? 1.3 : 1
    gem.current.scale.setScalar(MathUtils.damp(gem.current.scale.x, size, still ? 1000 : 10, delta))
  })

  const paint = picked ? PICKED : color

  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.17, lit ? 0.34 : 0.27, 28]} />
        <meshBasicMaterial color={paint} side={DoubleSide} />
      </mesh>
      <mesh position={[0, picked ? 0.6 : 0.42, 0]}>
        <cylinderGeometry args={[0.018, 0.018, picked ? 1.15 : 0.65, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <group ref={gem} position={[0, 0.85, 0]}>
        <mesh scale={[1, 1.35, 1]}>
          <octahedronGeometry args={[0.19]} />
          <meshToonMaterial color={paint} />
        </mesh>
        <mesh scale={[1.28, 1.66, 1.28]}>
          <octahedronGeometry args={[0.19]} />
          <meshBasicMaterial color={INK} side={BackSide} />
        </mesh>
      </group>

      {/* Bigger than the gem, so a finger can hit it. */}
      <mesh
        position={[0, 0.65, 0]}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(true)
        }}
        onPointerOut={() => onHover(false)}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta <= DRAG) onClick()
        }}
      >
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {lit && (
        // Not a target of the pointer, so it never takes the hover away from the beacon.
        <MapLabel
          text={name}
          shadow={picked ? PICKED : undefined}
          position={[0, picked ? 2.05 : 1.55, 0]}
          raycast={() => null}
        />
      )}
    </group>
  )
}

type Props = {
  regions: Region[]
  /** The map is shown in the middle of what is left between these. */
  insets: Insets
  /** The island in focus. Without it the whole map is on show. */
  region?: number
  /** The chosen area. */
  area?: number
  /** The area that is pointed at, here or in the list beside the map. */
  hovered?: number
  onHover: (area: number | undefined) => void
  onPointing: (pointing: boolean) => void
  onRegion: (region: number) => void
  onArea: (region: number, area: number) => void
}

/** The floating map: one island per region, and a beacon for every area of the open one. */
export default function WorldScene({
  regions,
  insets,
  region,
  area,
  hovered,
  onHover,
  onPointing,
  onRegion,
  onArea,
}: Props) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(islandsUrl, false, true)
  const screen = useThree((state) => state.size)
  // The part of the screen that nothing covers.
  const width = Math.max(screen.width - insets.right, 1)
  const height = Math.max(screen.height - insets.top - insets.bottom, 1)
  // Below this the islands do not fit side by side, so they float in two rows.
  const narrow = width / height < 1.6
  const material = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => material.dispose(), [material])

  const islands = useMemo(
    () =>
      regions.flatMap((item) => {
        const look = ISLANDS[item.id]
        const model = nodes[`island_${item.id}`]
        if (!look || !(model instanceof Mesh)) return []
        // The pins are numbered, and the areas take them in order.
        const pins = model.children
          .filter((child) => child.name.startsWith('pin_'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((child) => child.position)
        const spots = item.areas.slice(0, pins.length).map((entry, index) => ({
          area: entry,
          position: pins[index],
        }))
        return [{ region: item, look, geometry: model.geometry, spots }]
      }),
    [regions, nodes],
  )

  const [over, setOver] = useState<number>()
  const point = (id: number | undefined) => {
    setOver(id)
    onPointing(id !== undefined)
  }

  const controls = useRef<CameraControlsImpl>(null)
  const view = useRef<string>(undefined)
  const open = islands.find((item) => item.region.id === region)
  const spot = open?.spots.find((item) => item.area.id === area)

  useEffect(() => {
    const camera = controls.current
    if (!camera) return
    const side = narrow ? 'narrow' : 'wide'
    const target = new Vector3()
    let wide = OVERVIEW[side].width
    let tall = OVERVIEW[side].height
    if (open) {
      target.set(...open.look[side])
      wide = open.look.radius * 2.35
      tall = open.look.radius * 1.8
      if (spot) target.add(spot.position)
      else target.y += 0.7
    }
    // One unit away, the screen shows this many pixels per unit.
    const zoom = screen.height / (2 * SLOPE)
    let distance = zoom * Math.max(wide / width, tall / height)
    // A chosen area comes closer, but its neighbors stay in sight.
    if (spot) distance *= 0.68

    const next = String(open?.region.id ?? 'all')
    const slide = view.current !== undefined && !calm()
    if (view.current !== next) {
      // A new island is seen from the front again.
      const from = open ? CLOSE_FROM : OVERVIEW.from
      const eye = target.clone().addScaledVector(from, distance)
      void camera.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, slide)
    } else {
      // Within one island the visitor keeps the angle that they chose.
      void camera.moveTo(target.x, target.y, target.z, slide)
      void camera.dollyTo(distance, slide)
    }
    view.current = next
  }, [open, spot, narrow, width, height, screen.height])

  // The picture slides to the middle of the free part, without turning the camera.
  const shift = useRef<{ x: number; y: number }>(null)
  useFrame(({ camera, size }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const x = insets.right / 2
    const y = (insets.bottom - insets.top) / 2
    const now = (shift.current ??= { x, y })
    const speed = calm() ? 1000 : 8
    now.x = MathUtils.damp(now.x, x, speed, delta)
    now.y = MathUtils.damp(now.y, y, speed, delta)
    camera.setViewOffset(size.width, size.height, now.x, now.y, size.width, size.height)
  })

  const root = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    if (calm()) return
    islands.forEach((item, index) => {
      const group = root.current[index]
      if (!group) return
      const rest = item.look[narrow ? 'narrow' : 'wide'][1]
      group.position.y = rest + Math.sin(clock.elapsedTime * 0.7 + index * 1.7) * 0.14
    })
  })

  const { ACTION } = CameraControlsImpl

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-5, 9, 7]} intensity={1.9} />

      {CLOUDS.map((at, index) => (
        <Cloud key={index} at={at} index={index} />
      ))}

      {islands.map((item, index) => {
        const id = item.region.id
        const focused = id === open?.region.id
        return (
          <group
            key={id}
            ref={(group) => {
              root.current[index] = group
            }}
            position={item.look[narrow ? 'narrow' : 'wide']}
          >
            <mesh
              geometry={item.geometry}
              material={material}
              onPointerOver={(event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                if (!focused) point(id)
              }}
              onPointerOut={() => point(undefined)}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation()
                if (focused || event.delta > DRAG) return
                point(undefined)
                onRegion(id)
              }}
            >
              <Outlines thickness={!focused && over === id ? 0.14 : 0.028} color={!focused && over === id ? regionColors(id).accent : INK} />
            </mesh>

            {focused &&
              item.spots.map(({ area: entry, position }) => (
                <Pin
                  key={entry.id}
                  position={position}
                  name={entry.name}
                  color={regionColors(id).accent}
                  picked={entry.id === area}
                  hovered={entry.id === hovered}
                  onHover={(inside) => {
                    onHover(inside ? entry.id : undefined)
                    onPointing(inside)
                  }}
                  onClick={() => onArea(id, entry.id)}
                />
              ))}

            {!open && (
              <MapLabel
                text={item.region.name}
                note={`${item.region.areas.length} area`}
                // Under the island, or above it when another one floats in front.
                position={
                  item.look[narrow ? 'narrow' : 'wide'][2] < 0
                    ? [0, 4.9, 0]
                    : [0, -item.look.radius * 0.55, item.look.radius]
                }
                onPointerOver={(event) => {
                  event.stopPropagation()
                  point(id)
                }}
                onPointerOut={() => point(undefined)}
                onClick={(event) => {
                  event.stopPropagation()
                  if (event.delta > DRAG) return
                  point(undefined)
                  onRegion(id)
                }}
              />
            )}
          </group>
        )
      })}

      <CameraControls
        ref={controls}
        makeDefault
        minDistance={4}
        maxDistance={90}
        minPolarAngle={0.3}
        maxPolarAngle={1.5}
        smoothTime={0.35}
        mouseButtons={{ left: ACTION.ROTATE, middle: ACTION.DOLLY, right: ACTION.NONE, wheel: ACTION.DOLLY }}
        touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
      />
    </>
  )
}

useGLTF.preload(islandsUrl, false, true)
