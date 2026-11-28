import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { Character } from '../lib/characters'
import { BAY } from '../lib/corridor'
import type { ElementTheme } from '../lib/elements'
import type { Insets } from '../lib/insets'
import { farEnd, gateAhead, nearest, type Floor, type Mode, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import { EXIT, rowOf, stand } from '../lib/wings'
import Corridor from './Corridor'
import Podium from './Podium'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'

const SKY = '#e4e0ff'
/** Size of the podium under what is on show. */
const SIZE = 0.8
const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }

const noop = () => {}

/** Something that stands on a podium of a wing. */
export type Exhibit = { id: string; name: string; rarity: number }

/** How the stands of a hall look. */
export type Stands<T> = {
  carpet: string
  /** Height of the top of a podium. */
  top: number
  /** Height of the name board. */
  sign: number
  /** How many rows away a model is still loaded. */
  reach: number
  theme: (item: T) => ElementTheme
  /**
   * What stands on a podium. "position" is the top of it, in the room. "active" is true while the
   * visitor stands here.
   */
  show: (
    item: T,
    place: { position: [number, number, number]; turn: number; active: boolean },
  ) => ReactNode
}

type StandProps<T> = {
  item: T
  index: number
  stands: Stands<T>
  active: boolean
  /** Only what is close by is loaded. */
  shown: boolean
  onPick: () => void
}

function Stand<T extends Exhibit>({ item, index, stands, active, shown, onPick }: StandProps<T>) {
  const theme = stands.theme(item)
  const { position, turn } = stand(index)
  const { top, sign } = stands

  return (
    <group>
      <group position={position} rotation={[0, turn, 0]}>
        <mesh position={[0, top / 2 - 0.06, 0]}>
          <cylinderGeometry args={[0.44, 0.58, top - 0.12, 8]} />
          <meshToonMaterial color="#ffffff" />
        </mesh>
        <group position={[0, top, 0]} scale={SIZE}>
          <Podium theme={theme} />
        </group>
        {/* One simple shape takes the clicks, so the pointer is never tested against a model. */}
        <mesh
          visible={false}
          position={[0, sign / 2, 0]}
          onClick={(event) => {
            event.stopPropagation()
            // A drag that looks around also ends in a click.
            if (event.delta <= 6) onPick()
          }}
        >
          <cylinderGeometry args={[0.65, 0.65, sign, 8]} />
        </mesh>
        {shown && (
          <group position={[0, sign, 0]} scale={0.75}>
            <Sign
              solid
              title={item.name}
              note={'★'.repeat(item.rarity)}
              shadow={theme.accent}
              position={[0, 0, 0]}
            />
          </group>
        )}
      </group>
      {shown && stands.show(item, { position: [position[0], top, position[2]], turn, active })}
    </group>
  )
}

type Props<T> = {
  /** What is in the open wing, in the order of the stands. */
  items: T[]
  stands: Stands<T>
  mode: Mode
  roam: RefObject<Roam>
  hero?: Character
  insets: Insets
  /** The row nearest along the corridor, and the stand the visitor is at. */
  row: number
  near?: number
  /** The stand whose report is open. */
  picked?: number
  /** Tells the row, the id of what the visitor stands at, and whether the way out is near. */
  onPlace: (row: number, near: string | undefined, exit: boolean) => void
  onPick: (index: number) => void
  onExit: () => void
}

/** A wing of a hall: a corridor with a stand at both sides of every bay. */
export default function WingScene<T extends Exhibit>({
  items,
  stands,
  mode,
  roam,
  hero,
  insets,
  row,
  near,
  picked,
  onPlace,
  onPick,
  onExit,
}: Props<T>) {
  const rows = Math.max(Math.ceil(items.length / 2), 1)
  const floor = useMemo<Floor>(
    () => ({
      gates: [EXIT],
      circles: items.map((_, index) => {
        const [x, , z] = stand(index).position
        return { x, z, radius: 0.9 }
      }),
      far: farEnd(rows),
    }),
    [items, rows],
  )
  const told = useRef('')

  const onFrame = (pose: Roam, entered: number | undefined) => {
    const at = Math.min(Math.max(Math.round(-pose.z / BAY), 0), rows - 1)
    const spots = items.map((_, index) => stand(index).position)
    const found = nearest(pose.x, pose.z, spots, 3.1)
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    // The first item is part of the words, so a new wing is told even at the same place.
    const words = `${items[0]?.id} ${at} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(at, found === undefined ? undefined : items[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 14, 34]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 7, 5]} intensity={1.8} />
      <Corridor bays={rows} carpet={stands.carpet} />

      {items.map((item, index) => (
        <Stand
          key={item.id}
          item={item}
          index={index}
          stands={stands}
          active={index === near || index === picked}
          shown={Math.abs(rowOf(index) - row) <= stands.reach || index === picked}
          onPick={() => onPick(index)}
        />
      ))}

      <Portal
        room={LOBBY}
        position={EXIT.position}
        turn={EXIT.turn}
        scale={1}
        active={false}
        onHover={noop}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta <= 6) onExit()
        }}
      />

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
