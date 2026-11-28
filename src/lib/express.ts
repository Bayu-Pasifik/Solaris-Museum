import layout from '../assets/express/express.json'
import { elementNames } from './elements'
import type { Floor, Gate, Spot } from './roam'

/*
 * The Resonance Express: a train with one carriage for every element, from the open deck at its
 * end to the engine at its head, which is toward -z. It is modeled by scripts/build-express.py,
 * which also writes the layout read here. A carriage is as long as its Resonators need.
 */

export const LAYOUT = layout
const { module, joint, tail, nose, berth, walk } = layout

/** The names of the carriages, by the style of their model. */
export const CAR_NAMES = {
  glacio: 'Frost Lounge',
  fusion: 'Forge Diner',
  electro: 'Dynamo Car',
  aero: 'Garden Car',
  spectro: 'Prism Parlor',
  havoc: 'Void Car',
}
export type Style = keyof typeof CAR_NAMES
export const STYLES = Object.keys(CAR_NAMES) as Style[]

/** An element that the train has no carriage for rides in the parlor. */
export const styleOf = (element: string): Style => {
  const name = element.toLowerCase()
  return Object.hasOwn(CAR_NAMES, name) ? (name as Style) : 'spectro'
}

export type Car = {
  element: string
  style: Style
  /** The index of its first Resonator, and how many it carries. */
  first: number
  count: number
  /** Its end toward the tail, how many pieces it is made of, and how long that makes it. */
  back: number
  pieces: number
  length: number
}

export type Stand = {
  position: [number, number, number]
  /** 1 for the right side of the train, -1 for the left one. */
  side: number
  /** Turned toward the carpet and the end of the train, where a visitor comes from. */
  turn: number
  car: Car
}

export type Train = {
  cars: Car[]
  /** One for every Resonator, in the order of the list. */
  stands: Stand[]
  /** Where the deck before the engine begins, and where the engine does. */
  nose: number
  engine: number
  floor: Floor
}

/** The way back to the lobby, at the end of the train. */
export const EXIT: Gate = { position: [0, 0, tail - 1.9], turn: Math.PI, open: true }

/** Where a new visitor stands, on the open deck, looking up the train. */
export const START: Spot = { x: 0, z: 1.4, yaw: 0, pitch: 0.06, heading: Math.PI }

/** The order of the carriages from the end of the train. */
const rank = (element: string) => elementNames.indexOf(element) + 1 || elementNames.length + 1
export const byCar = (a: { element: string }, b: { element: string }) =>
  rank(a.element) - rank(b.element) || a.element.localeCompare(b.element)

/** The train that carries "list", which is in the order of the carriages. */
export function trainOf(list: { element: string }[]): Train {
  const cars: Car[] = []
  let back = 0
  list.forEach(({ element }, index) => {
    const last = cars.at(-1)
    if (last?.element === element) {
      last.count += 1
      return
    }
    if (last) back = last.back - Math.ceil(last.count / 2) * module - joint
    cars.push({
      element,
      style: styleOf(element),
      first: index,
      count: 1,
      back,
      pieces: 0,
      length: 0,
    })
  })
  for (const car of cars) {
    car.pieces = Math.ceil(car.count / 2)
    car.length = car.pieces * module
  }
  const last = cars.at(-1)
  const head = last ? last.back - last.length - joint : 0

  const stands = cars.flatMap((car) =>
    Array.from({ length: car.count }, (_, at): Stand => {
      // The two sides take turns, so every Resonator has a window of their own.
      const side = at % 2 ? 1 : -1
      const z = car.back - Math.floor(at / 2) * module - berth.first - (at % 2) * berth.step
      return { position: [side * berth.x, 0, z], side, turn: -side * 0.9, car }
    }),
  )

  const inside = (x: number, z: number) => {
    const across = Math.abs(x)
    // The corners of both decks are cut.
    if (z > 0) return z <= tail - 0.6 && across <= Math.min(walk.deck, 4.15 - (z - tail * 0.55) * 0.45)
    if (z < head) {
      const out = head - z
      return out <= nose - 0.6 && across <= Math.min(walk.deck, 4.15 - (out - nose * 0.55) * 0.5)
    }
    const within = cars.some((car) => z <= car.back && z >= car.back - car.length)
    return across <= (within ? walk.car : walk.joint)
  }

  return {
    cars,
    stands,
    nose: head,
    engine: head - nose,
    floor: {
      gates: [EXIT],
      circles: stands.map(({ position: [x, , z] }) => ({ x, z, radius: 0.85 })),
      far: -Infinity,
      side: walk.car,
      inside,
    },
  }
}

/** The carriage that a point is in, or on the bridge to. */
export const carAt = ({ cars }: Train, z: number) =>
  cars.find((car) => z >= car.back - car.length - joint / 2) ?? cars.at(-1)

/** How far a walker who is seen from behind looks past a Resonator, so the body hides nothing. */
const ASIDE = 0.55

/** Where a visitor stands to look at a Resonator. */
export function spotAtStand({ position, side }: Stand, third: boolean): Spot {
  const x = side * 0.35
  const z = position[2] + 1.9
  const dx = position[0] - x
  const dz = position[2] - z
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.65 : ASIDE
  const yaw = Math.atan2(-dx, -dz) + (third ? side * aside : 0)
  return { x, z, yaw, pitch: 0, heading: Math.atan2(dx, dz) }
}

/** On the bridge behind a carriage, looking into it. */
export const spotAtCar = ({ back }: Car): Spot => ({
  x: 0,
  z: back + 1.3,
  yaw: 0,
  pitch: 0.04,
  heading: Math.PI,
})
