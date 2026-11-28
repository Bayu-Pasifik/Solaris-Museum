import layout from '../assets/bestiary/wilds.json'
import type { Monster } from './bestiary'
import type { Floor, Gate, Spot } from './roam'

/*
 * The Wilds: a camp that floats in the middle, and around it one island for every element.
 * The ground is modeled by scripts/build-wilds.py, which also writes the layout read here.
 * Every monster has a den on the island of its element.
 */

export const ISLANDS = layout.islands
/** The elements in the order around the camp. */
export const ELEMENTS = ISLANDS.map((island) => island.element)
export const SPINS = layout.spins

/** Where a new visitor stands, by the fire of the camp. */
export const START: Spot = { x: 0, z: 7, yaw: 0, pitch: 0, heading: Math.PI }

/** The way back to the lobby, behind a new visitor. */
export const EXIT: Gate = { position: [0, 0, 12], turn: Math.PI, open: true }

/** Height and widest side of a monster in meters, by rank. */
const SIZES: Record<string, [number, number]> = {
  Calamity: [3.8, 4.4],
  Overlord: [3.1, 3.8],
  Elite: [2.3, 3],
  Standard: [1.5, 2.2],
}

/** A monster as the walk lists it. */
export type Beast = { id: string; name: string; record: Monster }

const islandOf = (element: string) => {
  const found = ELEMENTS.indexOf(element)
  // An element without an island of its own lives in the canyon.
  return found < 0 ? ELEMENTS.length - 1 : found
}

export const wingOf = (beast: Beast) => ELEMENTS[islandOf(beast.record.element)]

/** The monsters island by island, the strongest of each island first. */
export const beasts = (monsters: Monster[]): Beast[] =>
  [...monsters]
    .sort((a, b) => islandOf(a.element) - islandOf(b.element) || b.rankId - a.rankId || a.id - b.id)
    .map((record) => ({ id: String(record.id), name: record.name, record }))

export type Den = {
  position: [number, number, number]
  island: number
  /** Which way the monster looks while nobody is close: away from the middle of the island. */
  turn: number
  /** The most room the monster takes. */
  size: [number, number]
  /** How tall it is, as far as the model tells. */
  height: number
  /** How close a walker can come. */
  radius: number
}

/** Dens spread from these distances to the middle of an island. */
const INNER = 10.5
const OUTER = 24.5
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** The den of every monster of "list", in its order. */
export function densOf(list: Beast[]): Den[] {
  const islands = list.map((beast) => islandOf(beast.record.element))
  const counts = ELEMENTS.map((_, island) => islands.filter((other) => other === island).length)
  const used = ELEMENTS.map(() => 0)

  return list.map(({ record }, index) => {
    const island = islands[index]
    const at = used[island]++
    const { x, z } = ISLANDS[island]
    // A sunflower pattern keeps the dens apart without rows. The strongest are in the middle.
    const share = (at + 0.5) / counts[island]
    const away = Math.sqrt(INNER ** 2 + (OUTER ** 2 - INNER ** 2) * share)
    const angle = Math.atan2(-z, -x) + 0.5 + at * GOLDEN
    const size = SIZES[record.rank] ?? SIZES.Standard
    const box = record.model?.size
    const scale = box && Math.min(size[0] / box[1], size[1] / Math.max(box[0], box[2]))
    const height = box && scale ? box[1] * scale : size[0]
    const width = box && scale ? Math.max(box[0], box[2]) * scale : size[1]
    return {
      position: [x + Math.cos(angle) * away, 0, z + Math.sin(angle) * away],
      island,
      turn: Math.atan2(Math.cos(angle), Math.sin(angle)),
      size,
      height,
      radius: Math.min(Math.max(width * 0.35, 0.7), 1.5),
    }
  })
}

/** How far from the middle of a den a visitor stands to look at it. */
export const lookingDistance = ({ height, radius }: Den) =>
  Math.min(Math.max(height * 1.4 + radius, 3.4), 6.4)

/** Whether a walker can stand at a point: on the camp, on an island or on a bridge. */
export function inside(x: number, z: number) {
  if (Math.hypot(x, z) <= layout.camp) return true
  if (ISLANDS.some((island) => Math.hypot(x - island.x, z - island.z) <= island.walk)) return true
  return layout.bridges.some(([ax, az, bx, bz]) => {
    const dx = bx - ax
    const dz = bz - az
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1)
    return Math.hypot(x - ax - dx * t, z - az - dz * t) <= layout.halfBridge
  })
}

export const floorOf = (dens: Den[]): Floor => ({
  gates: [EXIT],
  circles: [
    ...layout.circles.map(([x, z, radius]) => ({ x, z, radius })),
    ...dens.map(({ position: [x, , z], radius }) => ({ x, z, radius })),
  ],
  far: -Infinity,
  side: Infinity,
  inside,
})

/** How far a walker who is seen from behind looks past a monster, so the body does not hide it. */
const ASIDE = 0.4
/** The turns away from the best side that are tried when something is in the way. */
const TURNS = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]

/** Where a visitor stands to look at a den: if there is room, with the landmark behind it. */
export function spotAtDen(dens: Den[], index: number, third: boolean): Spot {
  const den = dens[index]
  const [dx, , dz] = den.position
  const island = ISLANDS[den.island]
  const out = Math.atan2(dz - island.z, dx - island.x)
  const distance = lookingDistance(den)
  const places = TURNS.map((turn) => ({
    x: dx + Math.cos(out + turn) * distance,
    z: dz + Math.sin(out + turn) * distance,
  }))
  const free = ({ x, z }: { x: number; z: number }) =>
    Math.hypot(x - island.x, z - island.z) > island.core + 0.5 &&
    Math.hypot(x - island.x, z - island.z) <= island.walk &&
    dens.every(
      (other) =>
        other === den ||
        Math.hypot(x - other.position[0], z - other.position[2]) > other.radius + 0.9,
    )
  const { x, z } = places.find(free) ?? places[0]
  const heading = Math.atan2(dx - x, dz - z)
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.65 : ASIDE
  return {
    x,
    z,
    yaw: heading + Math.PI + (third ? aside : 0),
    pitch: third ? 0 : Math.atan2(den.height * 0.5 - 1.6, distance),
    heading,
  }
}

/** Where a visitor arrives on an island: at the end of the bridge, looking at the middle. */
export function spotOnIsland(index: number): Spot {
  const { x, z, walk } = ISLANDS[index]
  const away = Math.hypot(x, z)
  const back = walk - 0.5
  const heading = Math.atan2(x, z)
  return {
    x: x - (x / away) * back,
    z: z - (z / away) * back,
    yaw: heading + Math.PI,
    pitch: 0,
    heading,
  }
}

/** The island that a point is on or closest to, and how far its middle is. */
export function closestIsland(x: number, z: number) {
  let index = 0
  let distance = Infinity
  ISLANDS.forEach((island, at) => {
    const next = Math.hypot(x - island.x, z - island.z)
    if (next < distance) {
      index = at
      distance = next
    }
  })
  return { index, distance }
}
