import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Fog, type Group } from 'three'
import type { HallProps } from '../components/WingWalk'
import { playNote } from '../lib/ambience'
import type { Character } from '../lib/characters'
import { themeOf } from '../lib/elements'
import {
  CAR_NAMES,
  carAt,
  EXIT,
  trainOf,
  type Style,
  type Train,
} from '../lib/express'
import { gateAhead, nearest, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import ElementParticles from './ElementParticles'
import ExpressMap from './ExpressMap'
import Guard from './Guard'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }
const noop = () => {}

/** The sky over the country of every carriage. */
const SKIES: Record<Style, string> = {
  glacio: '#86b8ee',
  fusion: '#6e2a40',
  electro: '#281a5e',
  aero: '#92dbe4',
  spectro: '#ffcf9a',
  havoc: '#1d0b2e',
}

/** The sky turns into the one of the carriage that the visitor is in. */
function Air({ train, roam }: { train: Train; roam: RefObject<Roam> }) {
  const { sky, goal, fog } = useMemo(
    () => ({
      sky: new Color(SKIES.glacio),
      goal: new Color(),
      fog: new Fog(SKIES.glacio, 55, 280),
    }),
    [],
  )
  const first = useRef(true)
  useFrame(({ scene }, delta) => {
    goal.set(SKIES[carAt(train, roam.current.z)?.style ?? 'glacio'])
    sky.lerp(goal, first.current ? 1 : 1 - Math.exp(-1.6 * Math.min(delta, 0.05)))
    first.current = false
    fog.color.copy(sky)
    scene.background = sky
    scene.fog = fog
  })
  return null
}

/** The board above the way into every carriage. */
function Boards({ train }: { train: Train }) {
  const boards = useRef<Group>(null)
  // A board that is right overhead would only be seen cut off, so it hides until it is passed.
  useFrame(({ camera }) => {
    boards.current?.children.forEach((board) => {
      board.visible = Math.abs(camera.position.z - board.position.z) > 7
    })
  })
  return (
    <group ref={boards}>
      {train.cars.map((car) => (
        <group key={car.element} position={[0, 3.5, car.back + 0.22]} scale={1.15}>
          <Sign
            solid
            title={car.element}
            note={`${CAR_NAMES[car.style]} · ${car.count}`}
            shadow={themeOf(car.element).accent}
            position={[0, 0, 0]}
          />
        </group>
      ))}
    </group>
  )
}

/** How far along the train a Resonator is loaded; they are much heavier than the carriages. */
const SIGHT = 15
/** Height of the top of a berth, and of the name board above it. */
const TOP = 0.22
const BOARD = 2.5

/** The walk of the Resonator Hall: along a train, one carriage for every element. */
export default function ExpressScene({
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
}: HallProps<Character>) {
  // The list is a new one at every render, and the train only changes with who rides it.
  const riders = items.map((item) => item.id).join()
  const train = useMemo(() => trainOf(items), [riders])
  // The first and the last Resonator that are close enough to be loaded.
  const [seen, setSeen] = useState({ from: 0, to: -1 })
  const told = useRef('')

  // Two notes, as in a station, when the visitor comes into another carriage.
  const [element, setElement] = useState<string>()
  const announced = useRef<string>(undefined)
  useEffect(() => {
    const before = announced.current
    announced.current = element
    if (before === undefined || before === element) return
    playNote(79)
    const second = window.setTimeout(() => playNote(74), 230)
    return () => window.clearTimeout(second)
  }, [element])

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    const spots = train.stands.map((stand) => stand.position)
    const close = spots.flatMap(([, , z], index) => (Math.abs(z - pose.z) < SIGHT ? [index] : []))
    const from = close[0] ?? 0
    const to = close.at(-1) ?? -1
    if (from !== seen.from || to !== seen.to) setSeen({ from, to })
    setElement(carAt(train, pose.z)?.element)

    const found = nearest(pose.x, pose.z, spots, 2.9)
    // Away from every berth, the closest one says where in the train the visitor is.
    const row = found ?? nearest(0, pose.z, spots, Infinity) ?? 0
    const exit = gateAhead(pose.x, pose.z, train.floor.gates) !== undefined
    const words = `${riders.length} ${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : items[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  const focus = near ?? picked
  const active = focus === undefined ? undefined : items[focus]

  return (
    <>
      <Air train={train} roam={roam} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[-14, 30, 18]} intensity={1.5} />
      <ExpressMap train={train} roam={roam} />
      <Boards train={train} />

      {active && train.stands[focus!] && (
        <group position={train.stands[focus!].position}>
          <ElementParticles
            key={active.id}
            element={active.element}
            theme={themeOf(active.element)}
          />
        </group>
      )}

      {items.map((character, index) => {
        const stand = train.stands[index]
        const shown = (index >= seen.from && index <= seen.to) || index === picked
        if (!stand || !shown) return null
        const [x, , z] = stand.position
        return (
          <group key={character.id}>
            <Guard
              character={character}
              position={[x, TOP, z]}
              turn={stand.turn}
              active={index === near || index === picked}
            />
            {/* One simple shape takes the clicks, so the pointer is never tested against a model. */}
            <mesh
              visible={false}
              position={[x, BOARD / 2, z]}
              onClick={(event) => {
                event.stopPropagation()
                // A drag that looks around also ends in a click.
                if (event.delta <= 6) onPick(index)
              }}
            >
              <cylinderGeometry args={[0.65, 0.65, BOARD, 8]} />
            </mesh>
            <group position={[x, BOARD, z]} scale={0.62}>
              <Sign
                solid
                title={character.name}
                note={'★'.repeat(character.rarity)}
                shadow={themeOf(character.element).accent}
                position={[0, 0, 0]}
              />
            </group>
          </group>
        )
      })}

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
        floor={train.floor}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
