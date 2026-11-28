import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { Character } from '../lib/characters'
import { BAY, door, guardSpot, type Walk } from '../lib/corridor'
import type { Insets } from '../lib/insets'
import { farEnd, gateAhead, nearest, type Floor, type Mode, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import Corridor from './Corridor'
import Guard from './Guard'
import Portal, { PORTAL_CENTER } from './Portal'
import Roamer from './Roamer'

export const LOBBY_FOV = 45
/** Color of the air. The fog fades everything far away into it. */
const SKY = '#e4e0ff'
/** How many doors away a guard is still shown. */
const REACH = 2

type RigProps = {
  walk: RefObject<Walk>
  /** Where the visitor is now; the scene moves it toward the target. */
  place: RefObject<number | null>
  /** Index of the door being entered. */
  entering?: number
  insets: Insets
  /** True while the visitor walks freely, so only a walk into a room moves the camera. */
  idle: boolean
}

/**
 * Walks along the corridor. A wide screen looks down the corridor, with a little turn to the
 * nearest door; a tall screen has no room for both sides, so it turns to the door.
 */
function CameraRig({ walk, place, entering, insets, idle }: RigProps) {
  const goal = useRef(new Vector3())
  const aim = useRef(new Vector3())
  const look = useRef<Vector3>(null)

  useFrame(({ camera, size, pointer }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const calm = Boolean(window.SakugaFX?.calm)
    if (idle && (entering === undefined || calm)) {
      // Follow where the walker looks, so the way into a room starts from there.
      look.current ??= new Vector3()
      camera.getWorldDirection(look.current).multiplyScalar(5).add(camera.position)
      return
    }
    const step = Math.min(delta, 0.05)
    const target = walk.current.target
    const stop = (place.current = calm
      ? target
      : MathUtils.damp(place.current ?? target, target, 5, step))

    // Between two doors the side glides from one to the other.
    const from = Math.floor(stop)
    const side = MathUtils.lerp(
      door(from).side,
      door(from + 1).side,
      MathUtils.smoothstep(stop - from, 0, 1),
    )
    const z = -stop * BAY
    // 0 on a wide screen, 1 on a tall one.
    const tall = MathUtils.clamp((1.5 - size.width / size.height) / 0.9, 0, 1)

    if (entering !== undefined && !calm) {
      const { position, turn } = door(entering)
      const height = position[1] + PORTAL_CENTER
      goal.current.set(
        position[0] + Math.sin(turn) * 2.4,
        height + 0.15,
        position[2] + Math.cos(turn) * 2.4,
      )
      aim.current.set(position[0], height, position[2])
    } else {
      const sway = calm ? 0 : 1
      goal.current.set(
        MathUtils.lerp(-side * 0.5, -side * 0.7, tall) + pointer.x * 0.35 * sway,
        MathUtils.lerp(2.35, 2.7, tall) + pointer.y * 0.2 * sway,
        z + MathUtils.lerp(7.2, 8.6, tall),
      )
      aim.current.set(
        side * MathUtils.lerp(0.7, 2.5, tall),
        MathUtils.lerp(1.85, 1.75, tall),
        z - MathUtils.lerp(1.4, 0, tall),
      )
    }

    // The first frame starts at the goal, also after a visit to a room.
    const fresh = !look.current
    const at = (look.current ??= aim.current.clone())
    const ease = calm || fresh ? 1 : 1 - Math.exp(-(entering !== undefined ? 6 : 5) * step)
    camera.position.lerp(goal.current, ease)
    at.lerp(aim.current, ease)
    camera.lookAt(at)
    camera.fov = MathUtils.lerp(camera.fov, LOBBY_FOV, ease)
    // The picture slides to the middle of the free part, between the bars.
    camera.setViewOffset(
      size.width,
      size.height,
      0,
      (insets.bottom - insets.top) / 2,
      size.width,
      size.height,
    )
  })

  return null
}

type Props = {
  rooms: Room[]
  walk: RefObject<Walk>
  insets: Insets
  /** Name of the room that is pointed at, or whose door the visitor stands at. */
  active?: string
  /** Path of the room being entered. */
  entering?: string
  /** Everyone in the museum; the guards of the doors are among them. */
  characters: Character[]
  /** The door nearest along the corridor. */
  stop: number
  /** The door whose guard says hello. */
  greeting?: number
  onHover: (name: string | undefined) => void
  onSelect: (path: string, pointer: { x: number; y: number }) => void
  mode: Mode
  roam: RefObject<Roam>
  /** The Resonator who walks in the third-person view. */
  hero?: Character
  onPlace: (stop: number, ahead: number | undefined, met: number | undefined) => void
  onEnter: (path: string) => void
}

/** The lobby: a long corridor with the doors of the rooms at its sides. */
export default function LobbyScene({
  rooms,
  walk,
  insets,
  active,
  entering,
  characters,
  stop,
  greeting,
  onHover,
  onSelect,
  mode,
  roam,
  hero,
  onPlace,
  onEnter,
}: Props) {
  const place = useRef<number>(null)
  // The carpet takes the color of the Resonator hall.
  const main = rooms.findIndex((room) => room.path === '/resonator')
  const opening = rooms.findIndex((room) => entering && room.path === entering)
  const roaming = mode !== 'tour'
  const floor = useMemo<Floor>(
    () => ({
      gates: rooms.map((room, index) => ({ ...door(index), open: Boolean(room.path) })),
      circles: rooms.flatMap((room, index) => {
        if (!room.guard) return []
        const [x, , z] = guardSpot(index).position
        return [{ x, z, radius: 0.5 }]
      }),
      far: farEnd(rooms.length),
    }),
    [rooms],
  )
  const told = useRef('')

  /** Tells the page which door and guard the walker is at, and when a door is walked into. */
  const onFrame = (pose: Roam, entered: number | undefined) => {
    const at = Math.min(Math.max(Math.round(-pose.z / BAY), 0), rooms.length - 1)
    const near = gateAhead(pose.x, pose.z, floor.gates)
    const guards = rooms.map((_, index) => guardSpot(index).position)
    const met = nearest(pose.x, pose.z, guards, 2.6)
    if (told.current !== `${at} ${near} ${met}`) {
      told.current = `${at} ${near} ${met}`
      onPlace(at, near, met)
    }
    const path = entered === undefined ? undefined : rooms[entered].path
    if (path) onEnter(path)
  }

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 14, 34]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 7, 5]} intensity={1.8} />
      <Corridor bays={rooms.length} carpet={rooms[main]?.color ?? '#8f8df7'} />

      {rooms.map((room, index) => {
        const { position, turn } = door(index)
        return (
          <Portal
            key={room.name}
            room={room}
            position={position}
            scale={1}
            turn={turn}
            active={active === room.name}
            onHover={(over) => onHover(over ? room.name : undefined)}
            onClick={(event) => {
              event.stopPropagation()
              // A drag that walks along the corridor also ends in a click.
              if (room.path && event.delta <= 6) {
                onSelect(room.path, { x: event.clientX, y: event.clientY })
              }
            }}
          />
        )
      })}

      {rooms.map((room, index) => {
        const character = characters.find((item) => item.id === room.guard?.id)
        // Only the guards close by are loaded, so a visit does not download all of them.
        if (!character || Math.abs(index - stop) > REACH) return null
        return (
          <Guard
            key={character.id}
            character={character}
            {...guardSpot(index)}
            active={greeting === index && opening < 0}
          />
        )
      })}

      <CameraRig
        walk={walk}
        place={place}
        entering={opening < 0 ? undefined : opening}
        insets={insets}
        idle={roaming}
      />

      {roaming && (
        <Roamer
          roam={roam}
          third={mode === 'third'}
          hero={hero}
          floor={floor}
          frozen={opening >= 0}
          insets={insets}
          onFrame={onFrame}
        />
      )}
    </>
  )
}
