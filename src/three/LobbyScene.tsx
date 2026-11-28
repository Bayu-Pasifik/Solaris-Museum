import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3 } from 'three'
import type { Character } from '../lib/characters'
import type { Room } from '../lib/rooms'
import Greeter from './Greeter'
import Museum from './Museum'
import Portal, { PORTAL_CENTER } from './Portal'

/** Tangent of half the vertical field of view of the lobby camera. */
export const LOBBY_FOV = 40
const SLOPE = Math.tan(MathUtils.degToRad(LOBBY_FOV / 2))

/** Above this many portals, the two rows of a narrow screen stand closer and smaller. */
const ROOMY = 5

/**
 * Portals stand on a curve around the visitor. On narrow screens they do not all fit side by
 * side, so every other one stands in front and the rest float smaller behind and above them.
 */
function place(index: number, count: number, narrow: boolean) {
  const offset = index - (count - 1) / 2
  if (!narrow) {
    const position: [number, number, number] = [offset * 2.35, 0, -1.6 + Math.abs(offset) * 0.35]
    return { position, scale: 1, turn: -offset * 0.2 }
  }
  const raised = index % 2 === 0
  // Each row stands in the middle on its own.
  const inRow = raised ? Math.ceil(count / 2) : Math.floor(count / 2)
  const across = Math.floor(index / 2) - (inRow - 1) / 2
  const tight = count > ROOMY
  const position: [number, number, number] = raised
    ? [across * (tight ? 1.7 : 1.8), 3.9, -4.8]
    : [across * (tight ? 1.85 : 2.3), 0, -1.6]
  const scale = raised ? (tight ? 0.65 : 0.72) : tight ? 0.78 : 0.9
  return { position, scale, turn: -across * 0.2 }
}

type RigProps = {
  narrow: boolean
  /** Number of portals. */
  count: number
  /** Where the portal being entered stands. */
  target?: [number, number, number]
}

/** Keeps the room in view, follows the pointer a little and walks into a chosen portal. */
function CameraRig({ narrow, count, target }: RigProps) {
  const goal = useRef(new Vector3())
  const aim = useRef(new Vector3())
  const look = useRef(new Vector3(0, 1.3, -1.6))

  useFrame(({ camera, size, pointer }, delta) => {
    const calm = window.SakugaFX?.calm
    // Half the width that must fit on screen, at the depth of the middle portal.
    const half = narrow ? 2.7 : (count - 1) * 1.175 + 2.1
    const distance = MathUtils.clamp(
      half / (SLOPE * (size.width / size.height)),
      // Far enough that both rows of a narrow screen fit in height.
      narrow ? 8.5 : 6.6,
      narrow ? (count > ROOMY ? 13 : 10.5) : 13.5,
    )

    if (target && !calm) {
      const height = target[1] + PORTAL_CENTER
      goal.current.set(target[0] * 0.85, height + 0.15, target[2] + 2.6)
      aim.current.set(target[0], height, target[2])
    } else {
      const sway = calm ? 0 : 1
      goal.current.set(pointer.x * 0.5 * sway, 1.95 + pointer.y * 0.25 * sway, distance - 1.6)
      // Narrow screens aim higher, so the raised portals fit too.
      aim.current.set(0, narrow ? 2.4 : 1.3, -1.6)
    }

    // 1 jumps straight to the goal.
    const ease = calm ? 1 : 1 - Math.exp(-(target ? 6 : 3) * Math.min(delta, 0.05))
    camera.position.lerp(goal.current, ease)
    look.current.lerp(aim.current, ease)
    camera.lookAt(look.current)
  })

  return null
}

type Props = {
  rooms: Room[]
  /** Name of the room that is pointed at. */
  active?: string
  /** Path of the room being entered. */
  entering?: string
  greeter?: Character
  onHover: (name: string | undefined) => void
  onSelect: (path: string, pointer: { x: number; y: number }) => void
  onArrive: () => void
}

export default function LobbyScene({
  rooms,
  active,
  entering,
  greeter,
  onHover,
  onSelect,
  onArrive,
}: Props) {
  const narrow = useThree((state) => state.size.width / state.size.height < 1.5)
  const spots = rooms.map((room, index) => ({ room, ...place(index, rooms.length, narrow) }))
  // The greeter stands by the Resonator hall, and the carpet takes its color.
  const main = spots.find((spot) => spot.room.path === '/resonator')

  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 5, 4]} intensity={1.8} />
      <Museum carpet={main?.room.color ?? '#8f8df7'} />

      {spots.map(({ room, position, scale, turn }) => (
        <Portal
          key={room.name}
          room={room}
          position={position}
          scale={scale}
          turn={turn}
          active={active === room.name}
          onHover={(over) => onHover(over ? room.name : undefined)}
          onClick={(event) => {
            event.stopPropagation()
            if (room.path) onSelect(room.path, { x: event.clientX, y: event.clientY })
          }}
        />
      ))}

      {greeter && main && (
        <Greeter
          key={greeter.id}
          character={greeter}
          position={[
            main.position[0] + (narrow ? 1.15 : 1.4),
            0,
            main.position[2] + (narrow ? 0.7 : 2.2),
          ]}
          turn={-0.3}
          onArrive={onArrive}
        />
      )}

      <CameraRig
        narrow={narrow}
        count={rooms.length}
        target={spots.find((spot) => spot.room.path === entering && entering)?.position}
      />
    </>
  )
}
