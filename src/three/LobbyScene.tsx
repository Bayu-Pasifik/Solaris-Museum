import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { DoubleSide, MathUtils, Mesh, MeshToonMaterial, PerspectiveCamera, Vector3 } from 'three'
import type { Character } from '../lib/characters'
import { BAY, door, type Walk } from '../lib/corridor'
import type { Insets } from '../lib/insets'
import type { Room } from '../lib/rooms'
import corridorUrl from '../assets/lobby/corridor.glb?url'
import Greeter from './Greeter'
import Portal, { PORTAL_CENTER } from './Portal'

export const LOBBY_FOV = 45
/** Color of the air. The fog fades everything far away into it. */
const SKY = '#e4e0ff'
/** Bays behind the first door, which the camera stands in, and behind the last one. */
const BEFORE = 3
const AFTER = 2

type RigProps = {
  walk: RefObject<Walk>
  /** Where the visitor is now; the scene moves it toward the target. */
  place: RefObject<number | null>
  /** Index of the door being entered. */
  entering?: number
  insets: Insets
}

/**
 * Walks along the corridor. A wide screen looks down the corridor, with a little turn to the
 * nearest door; a tall screen has no room for both sides, so it turns to the door.
 */
function CameraRig({ walk, place, entering, insets }: RigProps) {
  const goal = useRef(new Vector3())
  const aim = useRef(new Vector3())
  const look = useRef<Vector3>(null)

  useFrame(({ camera, size, pointer }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const calm = Boolean(window.SakugaFX?.calm)
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

/** The corridor itself, made by scripts/build-lobby.py. */
function Corridor({ doors, carpet }: { doors: number; carpet: string }) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(corridorUrl, false, true)
  const paint = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  const cloth = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => cloth.dispose(), [cloth])
  useEffect(() => {
    cloth.color.set(carpet)
  }, [cloth, carpet])

  const { bay, runner, end } = nodes
  if (!(bay instanceof Mesh && runner instanceof Mesh && end instanceof Mesh)) return null
  const bays = Array.from({ length: BEFORE + doors + AFTER }, (_, index) => index - BEFORE)

  return (
    <group>
      {bays.map((index) => (
        <group key={index} position={[0, 0, -index * BAY]}>
          <mesh geometry={bay.geometry} material={paint} raycast={() => null} />
          <mesh geometry={runner.geometry} material={cloth} raycast={() => null} />
        </group>
      ))}
      <mesh
        geometry={end.geometry}
        material={paint}
        position={[0, 0, -(doors + AFTER - 0.5) * BAY]}
        raycast={() => null}
      />
    </group>
  )
}

type Props = {
  rooms: Room[]
  walk: RefObject<Walk>
  insets: Insets
  /** Name of the room that is pointed at, or whose door the visitor stands at. */
  active?: string
  /** Path of the room being entered. */
  entering?: string
  greeter?: Character
  onHover: (name: string | undefined) => void
  onSelect: (path: string, pointer: { x: number; y: number }) => void
  onArrive: () => void
}

/** The lobby: a long corridor with the doors of the rooms at its sides. */
export default function LobbyScene({
  rooms,
  walk,
  insets,
  active,
  entering,
  greeter,
  onHover,
  onSelect,
  onArrive,
}: Props) {
  const tall = useThree((state) => state.size.width < state.size.height)
  const place = useRef<number>(null)
  // The greeter stands by the Resonator hall, and the carpet takes its color.
  const main = rooms.findIndex((room) => room.path === '/resonator')
  const home = door(Math.max(main, 0))
  const opening = rooms.findIndex((room) => entering && room.path === entering)

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 14, 34]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 7, 5]} intensity={1.8} />
      <Corridor doors={rooms.length} carpet={rooms[main]?.color ?? '#8f8df7'} />

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

      {greeter && main >= 0 && (
        <Greeter
          key={greeter.id}
          character={greeter}
          position={[
            home.side * (tall ? 1.5 : 1.25),
            0,
            home.position[2] + (tall ? 1.7 : 1.5),
          ]}
          turn={-home.side * 0.25}
          onArrive={onArrive}
        />
      )}

      <CameraRig
        walk={walk}
        place={place}
        entering={opening < 0 ? undefined : opening}
        insets={insets}
      />
    </>
  )
}

useGLTF.preload(corridorUrl, false, true)
