import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  Fog,
  MathUtils,
  Matrix4,
  Quaternion,
  Vector3,
  type Camera,
  type Group,
} from 'three'
import type { HallProps } from '../components/WingWalk'
import { playRustle } from '../lib/ambience'
import type { ElementTheme } from '../lib/elements'
import {
  bind,
  EXIT,
  floorOf,
  LAYOUT,
  onPage,
  pageHeight,
  PITCH,
  slotOf,
  spotAtSpread,
  spreadAt,
  type Entry,
} from '../lib/popup'
import { gateAhead } from '../lib/roam'
import type { Room } from '../lib/rooms'
import PopupMap from './PopupMap'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#f5c542', path: '/' }
const noop = () => {}

const AIR = new Color('#140d2a')
const FOG = new Fog(AIR, 70, 230)

function Night() {
  useFrame(({ scene }) => {
    scene.background = AIR
    scene.fog = FOG
  })
  return null
}

/** Seconds that a page takes to swing over. */
const SWING = 2.8
/** Where a walker lands on the next spread, on the page at the other side of the spine. */
const LANDING = 11.4
/** Height of the eyes above the page. */
const EYE = 1.6
const ride = LAYOUT.ride

/** The point of the page that carries the walker, at the moment "swing" of the turn. */
function ridden(swing: number) {
  const at = MathUtils.clamp(swing, 0, 1) * (ride.length - 1)
  const low = Math.min(Math.floor(at), ride.length - 2)
  const share = at - low
  return [0, 1].map((axis) => MathUtils.lerp(ride[low][axis], ride[low + 1][axis], share))
}

const smooth = (t: number) => MathUtils.smoothstep(t, 0, 1)

type Turn = {
  from: number
  to: number
  time: number
  /** Where on the page the walker left it. */
  x: number
  z: number
  /** How the camera looked and stood when the walker reached the edge. */
  look: Quaternion
  eye: Vector3
}

/** The camera at the moment "t" of a turn: high over the book, looking down at the spine. */
function rideCamera(camera: Camera, turn: Turn, t: number) {
  const forward = turn.to > turn.from
  const eased = smooth(t)
  const swing = forward ? eased : 1 - eased
  const start = forward ? 0 : 1
  const land = (forward ? -1 : 1) * LANDING
  const [x, y] = ridden(swing)
  const arc = Math.sin(Math.PI * eased)
  // The book lies where the spread that was left is.
  const offset = -turn.from * PITCH

  const eye = new Vector3(
    // The walker leaves from where they stand and lands a little inside the edge.
    x + MathUtils.lerp(turn.x - ridden(start)[0], land - ridden(1 - start)[0], eased),
    y + EYE + arc * 3.2,
    MathUtils.lerp(turn.z, Math.max(turn.z, 9), arc * 0.85) + offset,
  )
  const middle = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(eye, new Vector3(0, 0.6, offset - 2.2), camera.up),
  )
  const from = turn.eye.clone()
  // The walker lands looking the way they looked, so the keys they hold keep their meaning.
  const arrive = new Vector3(
    turn.eye.x + land - turn.x,
    turn.eye.y + pageHeight(land) - pageHeight(turn.x),
    turn.eye.z,
  )

  const leaving = smooth(Math.min(t / 0.25, 1))
  const arriving = smooth(Math.max((t - 0.72) / 0.28, 0))
  camera.position.copy(from.lerp(eye, leaving).lerp(arrive, arriving))
  camera.quaternion.copy(turn.look).slerp(middle, leaving).slerp(turn.look, arriving)
}

/** The walk of the Glossary: over a dictionary whose pages carry the visitor along. */
export default function PopupScene({
  items,
  themeOf,
  mode,
  roam,
  hero,
  insets,
  near,
  picked,
  onPlace,
  onPick,
  onExit,
}: HallProps<Entry> & { themeOf: (letter: string) => ElementTheme }) {
  // The list is a new one at every render, and what stands in the book does not change.
  const key = `${items.length} ${items[0]?.id}`
  const list = useMemo(() => items, [key])
  const { spreads } = bind(list)
  const floor = useMemo(() => floorOf(list), [list])
  const within = (spread: number) => MathUtils.clamp(spread, 0, spreads.length - 1)

  const [shown, setShown] = useState(() => within(spreadAt(roam.current.z)))
  const [turning, setTurning] = useState<{ low: number; high: number }>()
  const turn = useRef<Turn>(undefined)
  const swing = useRef(0)
  const open = useRef(0)
  /** The spread that the walker was on at the last step. */
  const last = useRef<number>(undefined)
  const told = useRef('')
  const world = useRef<Group>(null)

  /** Brings the one book to the spread where the walker is. */
  const place = (spread: number) => {
    if (world.current) world.current.position.z = -spread * PITCH
  }

  useFrame(({ camera }, delta) => {
    const step = Math.min(delta, 0.05)
    const now = turn.current
    // The one book is brought to where the walker is, or stays under the page they ride.
    place(now ? now.from : within(spreadAt(roam.current.z)))
    if (!now) {
      open.current = window.SakugaFX?.calm ? 1 : Math.min(open.current + step / 1.3, 1)
      return
    }
    const pose = roam.current
    // The camera still looks as the walker left it.
    if (now.time === 0) {
      now.look.copy(camera.quaternion)
      now.eye.copy(camera.position)
    }
    // A button that brings the walker to another spread ends the ride.
    const moved = spreadAt(pose.z) !== now.from
    now.time += window.SakugaFX?.calm ? SWING : step
    const t = Math.min(now.time / SWING, 1)
    const forward = now.to > now.from

    if (!moved) {
      swing.current = forward ? smooth(t) : 1 - smooth(t)
      // The old spread folds flat in the first half, the new one rises in the second.
      open.current = Math.abs(2 * t - 1)
      setShown(t < 0.5 ? now.from : now.to)
      rideCamera(camera, now, t)
      if (t < 1) return
      pose.x = (forward ? -1 : 1) * LANDING
      pose.z = now.z - now.to * PITCH
      last.current = now.to
      open.current = 1
      place(now.to)
      setShown(now.to)
    }
    turn.current = undefined
    setTurning(undefined)
  })

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    // The walker can take one more step before they are held still for the ride.
    if (turn.current) return
    const spread = within(spreadAt(pose.z))
    place(spread)
    // A spread that the walker was brought to opens from flat.
    if (last.current !== spread) {
      last.current = spread
      open.current = 0
      setShown(spread)
    }

    const way =
      pose.x > LAYOUT.trigger && spread < spreads.length - 1
        ? 1
        : pose.x < -LAYOUT.trigger && spread > 0
          ? -1
          : 0
    if (way) {
      turn.current = {
        from: spread,
        to: spread + way,
        time: 0,
        x: pose.x,
        z: onPage(pose.z),
        look: new Quaternion(),
        eye: new Vector3(),
      }
      swing.current = way > 0 ? 0 : 1
      playRustle(SWING)
      setTurning({ low: Math.min(spread, spread + way), high: Math.max(spread, spread + way) })
    }

    const { first, count } = spreads[spread]
    const along = onPage(pose.z)
    const here = Array.from({ length: count }, (_, slot) => first + slot)
    const away = (index: number) => {
      const card = slotOf(index - first)
      return Math.hypot(card.x - pose.x, card.z - along)
    }
    /** How much a card is in front of the eyes: 1 straight ahead, -1 right behind. */
    const facing = (index: number) => {
      const card = slotOf(index - first)
      return (
        (-Math.sin(pose.yaw) * (card.x - pose.x) - Math.cos(pose.yaw) * (card.z - along)) /
        away(index)
      )
    }
    const found =
      picked !== undefined && here.includes(picked) && away(picked) < 4.8
        ? picked
        : here.filter((index) => away(index) < 4.2).sort((a, b) => facing(b) - facing(a))[0]
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    const row = found ?? first
    const words = `${key} ${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : list[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  const spread = spreads[shown]
  const next = spreads[shown + 1]
  const before = spreads[shown - 1]

  return (
    <>
      <Night />
      <ambientLight color="#ffe9cf" intensity={1.9} />
      <directionalLight color="#fff0d6" position={[10, 22, 6]} intensity={1.6} />
      <directionalLight color="#8fa8ff" position={[-14, 10, 12]} intensity={0.7} />

      <group ref={world}>
        <PopupMap
          list={list}
          themeOf={themeOf}
          shown={shown}
          leaf={turning && { ...turning, swing }}
          open={open}
          focus={near ?? picked}
          onPick={onPick}
          onLetter={(letter) => {
            const index = spreads.findIndex((item) => item.letter === letter)
            Object.assign(roam.current, spotAtSpread(index))
          }}
        />

        {spread && !turning && (
          <>
            <group position={[0, 5.5, -6.7]} scale={1.7}>
              <Sign
                solid
                title={spread.letter === '#' ? 'Numbers and signs' : `Letter ${spread.letter}`}
                note={`Spread ${shown + 1} of ${spreads.length}`}
                shadow={themeOf(spread.letter).accent}
                position={[0, 0, 0]}
              />
            </group>
            {before && (
              <Sign
                solid
                title="‹ Turn back"
                note={`to spread ${shown}, letter ${before.letter}`}
                shadow={themeOf(before.letter).accent}
                position={[-12.6, 2.9, -0.6]}
              />
            )}
            {next && (
              <Sign
                solid
                title="Turn page ›"
                note={`to spread ${shown + 2}, letter ${next.letter}`}
                shadow={themeOf(next.letter).accent}
                position={[12.6, 2.9, -0.6]}
              />
            )}
          </>
        )}

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
      </group>

      <Roamer
        roam={roam}
        third={mode === 'third'}
        hero={hero}
        floor={floor}
        frozen={turning !== undefined}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
