import layout from '../assets/echo/spire.json'
import type { Monster } from './bestiary'
import { KINDS, type Echo } from './echoes'
import type { Floor, Gate, Spot } from './roam'

/*
 * The Spire: a road of keys that winds inwards and upwards from a record on the ground floor to
 * a tuning fork at the top. It is modeled by scripts/build-spire.py, which also writes the
 * layout read here. Every echo has a stand beside the road, and the climb is a crescendo: the
 * echoes of the highest cost stand at the top.
 */

export const LAYOUT = layout
const { road, plaza, summit } = layout

const TAU = Math.PI * 2

/** The distance of the middle of the road from the middle of the map, at the angle "t". */
const radiusAt = (t: number) => road.r0 - (road.pitch * Math.max(t, 0)) / TAU

/** The height of the road at the angle "t". */
export const heightAt = (t: number) => road.rise * Math.min(Math.max(t / road.climb, 0), 1)

/** A point beside the road: "across" goes away from the middle of the map. */
export function roadPoint(t: number, across = 0): [number, number, number] {
  const phi = Math.PI / 2 + t
  const r = radiusAt(t) + across
  return [r * Math.cos(phi), heightAt(t), r * Math.sin(phi)]
}

/** The length of the road from its start to the angle "t". */
export const lengthAt = (t: number) => road.r0 * t - (road.pitch * t * t) / (2 * TAU)

/** The angle at which the road is "length" long. */
export const angleAt = (length: number) =>
  (road.r0 - Math.sqrt(road.r0 ** 2 - (road.pitch * length) / Math.PI)) / (road.pitch / TAU)

/** The turn of the road that a point is on or closest to, and how far its middle is. */
export function closestRoad(x: number, z: number) {
  const around = (((Math.atan2(z, x) - Math.PI / 2) % TAU) + TAU) % TAU
  const away = Math.hypot(x, z)
  let found: { t: number; off: number } | undefined
  // The turns lie far apart, so at most one is close.
  for (let t = around - TAU; t <= road.end + 0.12; t += TAU) {
    if (t < road.lead) continue
    const off = Math.abs(away - radiusAt(t))
    if (!found || off < found.off) found = { t, off }
  }
  return found
}

const onSummit = (x: number, z: number) =>
  Math.hypot(x, z) <= summit.radius ||
  (Math.abs(x) <= summit.bridge && z > 0 && z <= radiusAt(road.end))

const onPlaza = (x: number, z: number) => Math.hypot(x - plaza.x, z - plaza.z) <= plaza.radius

/** The height of the ground under a point. */
export function groundAt(x: number, z: number) {
  if (onSummit(x, z)) return road.rise
  if (onPlaza(x, z)) return 0
  const near = closestRoad(x, z)
  return near ? heightAt(near.t) : 0
}

/** Whether a walker can stand at a point: on the record, on the road or on the stage. */
export function inside(x: number, z: number) {
  if (onSummit(x, z) || onPlaza(x, z)) return true
  const near = closestRoad(x, z)
  return near !== undefined && near.off <= road.half
}

/** Where a new visitor stands, on the record at the foot of the road. */
export const START: Spot = {
  x: layout.start.x,
  z: layout.start.z,
  yaw: layout.start.heading + Math.PI,
  pitch: 0.12,
  heading: layout.start.heading,
}

/** The way back to the lobby, behind a new visitor. */
export const EXIT: Gate = {
  position: [layout.exit.x, 0, layout.exit.z],
  turn: layout.exit.turn,
  open: true,
}

export const FLOOR: Floor = {
  gates: [EXIT],
  circles: layout.circles.map(([x, z, radius]) => ({ x, z, radius })),
  far: -Infinity,
  side: Infinity,
  inside,
  height: groundAt,
}

/** An echo as the walk lists it, with the Bestiary monster that lends it a model. */
export type Voice = { id: string; name: string; record: Echo; lender?: Monster }

export const wingOf = ({ record }: Voice) => KINDS.find((kind) => kind.id === record.kind)!.label

export const WINGS = KINDS.map((kind) => kind.label)

/** The lowest cost first, so the strongest echoes stand at the top. */
export const climbing = (a: Voice, b: Voice) =>
  a.record.cost - b.record.cost || a.record.id - b.record.id

/** Height and widest side of an echo in meters, by cost. */
const SIZES: Record<number, [number, number]> = {
  1: [1.6, 2.2],
  3: [2.4, 2.9],
  4: [3.3, 3.5],
}

export type Stand = {
  position: [number, number, number]
  /** The angle of the road beside the stand. */
  t: number
  /** 1 for the outer side of the road, -1 for the inner one. */
  side: number
  /** Which way the echo looks while nobody is close: across the road. */
  turn: number
  size: [number, number]
  /** How tall it is, as far as the model tells. */
  height: number
  radius: number
}

/** The road between the first stand and the last one. */
const FIRST = lengthAt(0.22)
// The last stands stay clear of the stage, which reaches far under the end of the road.
const LAST = lengthAt(road.end - 1.5)

/** The stand of the echo at "index" of the "count" echoes of a wing, from the foot to the top. */
export function standOf({ record, lender }: Voice, index: number, count: number): Stand {
  const t = angleAt(FIRST + (index / Math.max(count - 1, 1)) * (LAST - FIRST))
  const side = index % 2 ? -1 : 1
  const position = roadPoint(t, side * road.stand)
  const middle = roadPoint(t)
  const size = SIZES[record.cost] ?? SIZES[1]
  const box = lender?.model?.size
  const scale = box && Math.min(size[0] / box[1], size[1] / Math.max(box[0], box[2]))
  return {
    position,
    t,
    side,
    turn: Math.atan2(middle[0] - position[0], middle[2] - position[2]),
    size,
    height: box && scale ? box[1] * scale : 1.6,
    radius: 1.7,
  }
}

/** How far from the middle of a stand a visitor looks at it. */
export const lookingDistance = ({ height }: Stand) =>
  Math.min(Math.max(height * 1.5 + 2, 4.8), 6.6)

/** How far a walker who is seen from behind looks past an echo, so the body does not hide it. */
const ASIDE = 0.4

/** Where a visitor stands to look at a stand: on the road, across from it. */
export function spotAtStand(stand: Stand, third: boolean): Spot {
  const distance = lookingDistance(stand)
  const [x, , z] = roadPoint(stand.t, stand.side * (road.stand - distance))
  const heading = Math.atan2(stand.position[0] - x, stand.position[2] - z)
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.65 : ASIDE
  return {
    x,
    z,
    yaw: heading + Math.PI + (third ? aside : 0),
    pitch: third ? 0 : Math.atan2(stand.height * 0.5 - 1.6, distance),
    heading,
  }
}
