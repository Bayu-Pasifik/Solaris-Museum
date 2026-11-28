import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { BAY } from '../lib/corridor'
import type { ElementTheme } from '../lib/elements'
import { gateAhead, type Floor, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import {
  AISLE,
  bayAt,
  bookAhead,
  GAP,
  SHELF_EXIT,
  WALL,
  type Aisle,
} from '../lib/shelves'
import type { Story } from '../lib/stories'
import type { HallProps } from '../components/WingWalk'
import { Lantern } from './ArchiveHall'
import Boxes, { type Box } from './Boxes'
import { noise } from './painting'
import Portal from './Portal'
import Roamer from './Roamer'
import ShelfBook, { BOARD } from './ShelfBook'
import Sign from './Sign'

const SKY = '#2c2766'
const WOOD = '#4a3f93'
const BACK = '#241f58'
const TRIM = '#ffc85a'
const BOOKS = ['#8f8df7', '#ff5fa8', '#4fb3ff', '#ffc21c', '#45d38a', '#b47aff', '#f4f3fc']
/** Heights of the boards of a bookcase; a row of books stands on each one but the last. */
const BOARDS = [0.1, BOARD - 0.045, 1.9, 2.75, 3.6]
/** Bays that are drawn behind and ahead of the walker; farther ones are lost in the haze. */
const BEHIND = 4
const AHEAD = 7
/** Bays behind the first books, around the entrance. */
const ENTRANCE = 3

const noop = () => {}
const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }

/** The bookcases of both walls along one bay. "taken" is the number of story books in it. */
function build(bay: number, taken: number) {
  const boxes: Box[] = []
  let seed = bay * 977 + 5000
  const next = () => noise(seed++)
  // The bay reaches half a gap past its first book.
  const start = -bay * BAY + GAP / 2
  const middle = start - BAY / 2

  for (const side of [-1, 1]) {
    // "out" comes from the books toward the middle of the aisle.
    const add = (
      out: number,
      y: number,
      z: number,
      [deep, tall, long]: [number, number, number],
      color: string,
    ) => boxes.push({ position: [side * (WALL - out), y, z], size: [deep, tall, long], color })

    add(-0.36, 2, middle, [0.1, 4, BAY], BACK)
    for (const y of BOARDS) add(0, y, middle, [0.66, 0.09, BAY], WOOD)
    add(0, 2, start, [0.74, 4, 0.1], WOOD)
    add(0.04, 3.78, middle, [0.74, 0.22, BAY], TRIM)

    BOARDS.slice(0, -1).forEach((board, row) => {
      // The row at eye height belongs to the stories, as far as there are any.
      const stories = row === 1 ? Math.ceil((taken - (side > 0 ? 1 : 0)) / 2) : 0
      let z = start - 0.07 - stories * GAP
      while (z > start - BAY + 0.2) {
        const long = 0.08 + next() * 0.11
        const tall = 0.46 + next() * 0.28
        const color = BOOKS[Math.floor(next() * BOOKS.length)]
        add(-0.05, board + 0.045 + tall / 2, z - long / 2, [0.4, tall, long], color)
        // Now and then a gap, as if a book is taken out.
        z -= long + (next() < 0.08 ? 0.22 : 0.016)
      }
    })
  }
  return boxes
}

function Bay({ bay, taken }: { bay: number; taken: number }) {
  const boxes = useMemo(() => build(bay, taken), [bay, taken])
  return <Boxes boxes={boxes} />
}

/** The name of a section, on a board that hangs over the aisle where it starts. */
function Marker({ bay, name, count, color, near }: MarkerProps) {
  const board = useRef<Group>(null)
  const z = -bay * BAY - 2.5

  // A board that is close to the camera hides behind the top bar, or hides the walker.
  useFrame(({ camera }) => {
    if (board.current) board.current.visible = Math.abs(camera.position.z - z) > near
  })

  return (
    <group ref={board} position={[0, 2.3, z]}>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 1.5, -0.01]}>
          <cylinderGeometry args={[0.012, 0.012, 2.5, 6]} />
          <meshBasicMaterial color={TRIM} />
        </mesh>
      ))}
      <Sign
        solid
        title={name}
        note={`${count} ${count === 1 ? 'story' : 'stories'}`}
        shadow={color}
        position={[0, 0, 0]}
      />
    </group>
  )
}

type MarkerProps = {
  bay: number
  name: string
  count: number
  color: string
  /** The board is only drawn when it is farther than this along the aisle from the camera. */
  near: number
}

type Props = HallProps<Story> & { theme: (story: Story) => ElementTheme; aisle: Aisle }

/** The Library: one aisle between two walls of bookcases, with every section after another. */
export default function ShelfScene({
  items,
  theme,
  aisle,
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
}: Props) {
  const bays = Math.max(aisle.bays.length, 1)
  /** The end wall stands one bay past the last books. */
  const end = -(bays + 1) * BAY
  const floor = useMemo<Floor>(
    () => ({ gates: [SHELF_EXIT], circles: [], far: end + 1.5, side: AISLE }),
    [end],
  )
  const told = useRef('')

  const onFrame = (pose: Roam, entered: number | undefined) => {
    const at = bayAt(pose.z, aisle)
    const found = bookAhead(pose, mode === 'third', aisle)
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    const words = `${at} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(at, found === undefined ? undefined : items[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  // The visitor looks at one book; an open script keeps its own book out.
  const out = picked ?? near
  const first = Math.max(row - BEHIND, -ENTRANCE)
  const last = Math.min(row + AHEAD, bays)
  const shelves = Array.from({ length: last - first + 1 }, (_, index) => first + index)
  const length = (ENTRANCE + bays + 1) * BAY
  const center = ENTRANCE * BAY - length / 2

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 12, 28]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[-3, 6, 5]} intensity={1.6} />

      <mesh position={[0, -0.01, center]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WALL * 2 + 1, length]} />
        <meshBasicMaterial color="#b8b3ff" />
      </mesh>
      {/* A carpet with a golden edge down the middle. */}
      {[
        [2.3, TRIM, 0],
        [2.1, '#5b4fd0', 0.005],
      ].map(([width, color, y]) => (
        <mesh key={color} position={[0, Number(y), center]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[Number(width), length]} />
          <meshBasicMaterial color={String(color)} />
        </mesh>
      ))}

      {shelves.map((bay) => (
        <group key={bay}>
          {/* The bays around the entrance hold no stories. */}
          <Bay bay={bay} taken={aisle.bays[bay]?.count ?? 0} />
          {bay % 2 === 0 && <Lantern position={[0, 3.9, -bay * BAY - BAY / 2]} />}
        </group>
      ))}
      {shelves.map((bay) => {
        const here = aisle.bays[bay]
        if (!here || here.section === aisle.bays[bay - 1]?.section) return null
        const books = aisle.bays.filter((other) => other.section === here.section)
        return (
          <Marker
            key={here.section}
            bay={bay}
            name={here.section}
            count={books.reduce((sum, other) => sum + other.count, 0)}
            color={theme(items[here.first]).accent}
            // Behind a walker, the camera stands farther back.
            near={mode === 'third' ? 4.6 : 2.6}
          />
        )
      })}
      <mesh position={[0, 2, end]}>
        <planeGeometry args={[WALL * 2 + 1, 4]} />
        <meshToonMaterial color={BACK} />
      </mesh>
      <mesh position={[0, 2.1, end + 0.02]}>
        <circleGeometry args={[1.3, 48]} />
        <meshBasicMaterial color="#ff8fc4" />
      </mesh>
      <mesh position={[0, 2.1, end + 0.04]}>
        <torusGeometry args={[1.33, 0.1, 8, 48]} />
        <meshToonMaterial color={TRIM} />
      </mesh>

      {items.map((story, index) => {
        const place = aisle.books[index]
        return (
          ((place.bay >= first && place.bay <= last) || index === picked) && (
            <ShelfBook
              key={story.id}
              story={story}
              theme={theme(story)}
              place={place}
              out={index === out}
              onPick={() => onPick(index)}
            />
          )
        )
      })}
      {out !== undefined && items[out] && (
        // A light at the foot of the shelf shows which book is out.
        <mesh
          position={[aisle.books[out].side * (WALL - 0.9), 0.02, aisle.books[out].z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.32, 0.42, 40]} />
          <meshBasicMaterial color={theme(items[out]).accent} />
        </mesh>
      )}

      <Portal
        room={LOBBY}
        position={SHELF_EXIT.position}
        turn={SHELF_EXIT.turn}
        scale={0.85}
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
