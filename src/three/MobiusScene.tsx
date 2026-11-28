import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Color, DoubleSide, Fog, MathUtils, Matrix4, type CanvasTexture, type Group } from 'three'
import type { HallProps } from '../components/WingWalk'
import type { Hung } from '../lib/exhibits'
import {
  ahead,
  colorsOf,
  EXIT,
  floorOf,
  frameAt,
  hangUp,
  LENGTH,
  lookingDistance,
  placeAt,
  SHRINK,
  wingOf,
  type Show,
  type Stand,
} from '../lib/mobius'
import { gateAhead, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import MobiusMap from './MobiusMap'
import { MARGIN, paint } from './pieceArt'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }
const noop = () => {}

const AIR = new Color('#34196a')
const FOG = new Fog(AIR, 90, 330)

function Air() {
  useFrame(({ scene }) => {
    scene.background = AIR
    scene.fog = FOG
  })
  return null
}

/** A thing that stays where it is on the ribbon. */
function Fixed({ place, children }: { place: Matrix4; children: ReactNode }) {
  return (
    <group matrix={place} matrixAutoUpdate={false}>
      {children}
    </group>
  )
}

/** The picture of a piece, painted when the visitor comes near. */
function Art({
  item,
  edge,
  active = false,
  onPick,
}: {
  item: Hung
  edge: string
  active?: boolean
  onPick?: () => void
}) {
  const [texture, setTexture] = useState<CanvasTexture>()
  const [over, setOver] = useState(false)
  const body = useRef<Group>(null)

  useEffect(() => {
    let gone = false
    void paint(item, edge).then((result) => {
      if (gone) result.dispose()
      else setTexture(result)
    })
    return () => {
      gone = true
    }
    // The picture depends on what the piece is and how big it is, not on where it hangs.
  }, [item.piece.key, item.width, item.height, edge])

  // The old picture is freed only when the new one has taken its place.
  useEffect(() => () => texture?.dispose(), [texture])

  useFrame((_, delta) => {
    const group = body.current
    if (!group) return
    const size = active ? 1.12 : over ? 1.06 : 1
    group.scale.setScalar(
      window.SakugaFX?.calm ? size : MathUtils.damp(group.scale.x, size, 9, Math.min(delta, 0.05)),
    )
  })

  if (!texture) return null
  return (
    <group ref={body}>
      <mesh
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setOver(Boolean(onPick))
        }}
        onPointerOut={() => setOver(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          // A drag that looks around also ends in a click.
          if (event.delta <= 6) onPick?.()
        }}
      >
        <planeGeometry args={[item.width + MARGIN * 2, item.height + MARGIN * 2]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.02} />
      </mesh>
    </group>
  )
}

const MOTES = Array.from({ length: 18 }, (_, index) => index)

/** Drops of paint that circle the picture the visitor stands at. */
function Splash({ stand, colors }: { stand: Stand; colors: string[] }) {
  const drops = useRef<Group>(null)
  const place = useMemo(() => placeAt(stand.s, stand.x, 0, stand.turn), [stand])
  const wide = (stand.width * SHRINK) / 2 + 0.45
  const high = (stand.height * SHRINK) / 2 + 0.45

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    drops.current?.children.forEach((drop, index) => {
      const angle = time * 0.55 + (index / MOTES.length) * Math.PI * 2
      drop.position.set(
        Math.cos(angle) * wide,
        stand.middle + Math.sin(angle) * high,
        0.25 + Math.sin(time * 2 + index) * 0.16,
      )
      drop.scale.setScalar(0.05 + 0.04 * Math.abs(Math.sin(time * 1.7 + index * 2.4)))
    })
  })

  return (
    <Fixed place={place}>
      <group ref={drops}>
        {MOTES.map((index) => (
          <mesh key={index} raycast={() => null}>
            <icosahedronGeometry />
            <meshBasicMaterial color={colors[index % colors.length]} side={DoubleSide} />
          </mesh>
        ))}
      </group>
    </Fixed>
  )
}

/** Wraps the walker to the start when they have gone the whole way, before they move on. */
function Loop({ roam }: { roam: React.RefObject<Roam> }) {
  useFrame(() => {
    const pose = roam.current
    if (pose.z > 0) pose.z -= LENGTH
    else if (pose.z <= -LENGTH) pose.z += LENGTH
  })
  return null
}

/** How far along the way pictures are painted, in each direction. */
const SIGHT = 55

/** The walk of the Gallery: along a ribbon with a half twist, past every piece. */
export default function MobiusScene({
  items,
  mode,
  roam,
  hero,
  insets,
  near,
  picked,
  onPlace,
  onPick,
  onExit,
}: HallProps<Show>) {
  // The list is a new one at every render, and what hangs does not change.
  const key = `${items.length} ${items[0]?.id}`
  const shows = useMemo(() => items, [key])
  const salon = useMemo(() => hangUp(shows), [shows])
  const floor = useMemo(() => floorOf(salon.stands), [salon])
  const [seen, setSeen] = useState<{ pieces: number[]; banners: number[] }>({
    pieces: [],
    banners: [],
  })
  const told = useRef('')
  const looked = useRef('')
  const world = useRef<Group>(null)
  const bend = useMemo(() => new Matrix4(), [])

  /** Bends the world so that the floor at "s" lies level under the walker. */
  const turnWorld = (s: number) => {
    const group = world.current
    if (!group) return
    group.matrix.makeTranslation(0, 0, -s).multiply(frameAt(s, bend).invert())
    group.matrixWorldNeedsUpdate = true
  }
  useLayoutEffect(() => turnWorld(-roam.current.z), [])

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    const s = -pose.z
    turnWorld(s)

    const along = salon.stands.map((stand) => ahead(s, stand.s))
    const pieces = along.flatMap((way, index) => (Math.abs(way) < SIGHT ? index : []))
    const banners = salon.banners.flatMap((banner, index) =>
      Math.abs(ahead(s, banner.s)) < SIGHT * 1.4 ? index : [],
    )
    const sight = `${pieces.join()} ${banners.join()}`
    if (looked.current !== sight) {
      looked.current = sight
      setSeen({ pieces, banners })
    }

    // The stand that the walker is at: the open one, or else the one in reach that is most
    // straight ahead.
    const away = (index: number) => Math.hypot(salon.stands[index].x - pose.x, along[index])
    const reaches = (index: number) =>
      salon.stands[index] !== undefined &&
      away(index) < lookingDistance(salon.stands[index]) + 0.8
    /** How much a stand is in front of the eyes: 1 straight ahead, -1 right behind. */
    const facing = (index: number) =>
      (-Math.sin(pose.yaw) * (salon.stands[index].x - pose.x) +
        Math.cos(pose.yaw) * along[index]) /
      away(index)
    const found =
      picked !== undefined && reaches(picked)
        ? picked
        : pieces.filter(reaches).sort((a, b) => facing(b) - facing(a))[0]
    // Away from every stand, the next one along the way says where the walker is.
    const coming = (index: number) => (along[index] < 0 ? LENGTH : 0) + along[index]
    const row = found ?? [...pieces].sort((a, b) => coming(a) - coming(b))[0] ?? 0
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    const words = `${key} ${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : shows[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  const focus = near ?? picked
  const stand = focus === undefined ? undefined : salon.stands[focus]
  const show = focus === undefined ? undefined : shows[focus]
  const pictures = new Set(picked === undefined ? seen.pieces : [...seen.pieces, picked])

  const exitPlace = useMemo(() => placeAt(-EXIT.position[2]), [])
  const boards = useMemo(
    () => [
      ...salon.gates.map((gate) => ({
        s: gate.s,
        title: wingOf(gate),
        note: `${gate.count} ${gate.count === 1 ? 'piece' : 'pieces'}`,
        shadow: colorsOf(gate).accent,
        height: 5.5,
      })),
      {
        s: LENGTH / 2,
        title: 'Halfway',
        note: 'Under where you began',
        shadow: '#45e0ff',
        height: 5.5,
      },
    ],
    [salon],
  )

  return (
    <>
      <Air />
      <ambientLight intensity={1.8} />
      <directionalLight position={[-20, 50, 30]} intensity={1.5} />
      <Loop roam={roam} />

      <group ref={world} matrixAutoUpdate={false}>
        <MobiusMap salon={salon} items={shows} />

        {[...pictures].map((index) => {
          const own = salon.stands[index]
          const item = shows[index]
          if (!own || !item) return null
          const colors = colorsOf(item)
          return (
            <Fixed key={item.id} place={placeAt(own.s, own.x, 0, own.turn)}>
              <group position={[0, own.middle, 0.14]} scale={SHRINK}>
                <Art
                  item={{ piece: item.record, x: 0, y: 0, width: own.width, height: own.height }}
                  edge={item.id === shows[focus ?? -1]?.id ? '#1d1a4a' : colors.accent}
                  active={index === focus}
                  onPick={() => onPick(index)}
                />
              </group>
            </Fixed>
          )
        })}

        {seen.banners.map((index) => {
          const banner = salon.banners[index]
          if (!banner) return null
          const { s, category } = banner
          return (
            <Fixed key={category.id} place={placeAt(s, 0, 6)}>
              <Art
                item={{
                  piece: { kind: 'banner', key: `banner-${category.id}`, category },
                  x: 0,
                  y: 0,
                  width: 2,
                  height: 5.4,
                }}
                edge="#ff5fa8"
              />
            </Fixed>
          )
        })}

        {boards.map(({ s, title, note, shadow, height }) => (
          <Fixed key={title} place={placeAt(s, 0, height)}>
            <group scale={2.1}>
              <Sign solid title={title} note={note} shadow={shadow} position={[0, 0, 0]} />
            </group>
          </Fixed>
        ))}

        {stand && show && (
          <Splash
            key={show.id}
            stand={stand}
            colors={[colorsOf(show).accent, colorsOf(show).pale, '#45e0ff', '#ffd45a']}
          />
        )}

        <Fixed place={exitPlace}>
          <Portal
            room={LOBBY}
            position={[EXIT.position[0], 0, 0]}
            turn={EXIT.turn}
            scale={1}
            active={false}
            onHover={noop}
            onClick={(event) => {
              event.stopPropagation()
              if (event.delta <= 6) onExit()
            }}
          />
        </Fixed>
      </group>

      <Roamer
        roam={roam}
        third={mode === 'third'}
        hero={hero}
        floor={floor}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
