import { Matrix4, Vector3 } from 'three'
import layout from '../assets/gallery/mobius.json'
import { SECTIONS, type Choosable, type SectionId } from './exhibits'
import type { AchievementCategory } from './gallery'
import type { Floor, Gate, Spot } from './roam'

/*
 * The Endless Salon: the whole collection along one ribbon with a half twist, so after one round
 * the visitor walks on the underside of where they began. It is modeled by
 * scripts/build-mobius.py, which also writes the layout read here.
 *
 * The visitor walks on flat ground: "x" across the ribbon and "-z" along it. The page bends the
 * world around them instead, so the part under their feet is always level.
 */

export const LAYOUT = layout
const { length, thick, walk } = layout
export const LENGTH = length

const RADIUS = length / 2 / (Math.PI * 2)

/** Where "s" falls on the two rounds of the ribbon. */
export const wrap = (s: number) => ((s % length) + length) % length

/** The shortest way along the ribbon from "from" to "to", with its sign. */
export const ahead = (from: number, to: number) => wrap(to - from + length / 2) - length / 2

/**
 * The frame of the floor at "s": it turns a point that is told by how far across, above and
 * back it is into a point of the world.
 */
export function frameAt(s: number, target = new Matrix4()) {
  const theta = s / RADIUS
  const phi = theta / 2
  const out = new Vector3(Math.cos(theta), 0, Math.sin(theta))
  const along = new Vector3(-Math.sin(theta), 0, Math.cos(theta))
  const up = new Vector3(0, 1, 0)
  const above = up.clone().multiplyScalar(Math.cos(phi)).addScaledVector(out, Math.sin(phi))
  const across = up.clone().multiplyScalar(Math.sin(phi)).addScaledVector(out, -Math.cos(phi))
  const origin = out.multiplyScalar(RADIUS).addScaledVector(above, thick / 2)
  return target.makeBasis(across, above, along.negate()).setPosition(origin)
}

/** The place of a thing that stands on the ribbon, turned about its own upright line. */
export function placeAt(s: number, x = 0, h = 0, turn = 0) {
  return frameAt(s)
    .multiply(new Matrix4().makeTranslation(x, h, 0))
    .multiply(new Matrix4().makeRotationY(turn))
}

/** A piece as the walk lists it. */
export type Show = { id: string; name: string; section: SectionId; record: Choosable }

export const wingOf = ({ section }: { section: SectionId }) => SECTIONS.find((item) => item.id === section)!.label

export const WINGS = SECTIONS.map((item) => item.label)

export const colorsOf = ({ section }: { section: SectionId }) =>
  SECTIONS.find((item) => item.id === section)!.colors

/** The size of a picture, in the units that it is painted in. */
const SIZES = {
  card: { width: 3.5, height: 2.1, middle: 2.05 },
  title: { width: 3.7, height: 0.9, middle: 1.75 },
  group: { width: 2.4, height: 2.9, middle: 2.3 },
}
/** How much smaller a picture hangs on its easel than it is painted. */
export const SHRINK = 0.85

export type Stand = {
  s: number
  x: number
  /** 1 for the right side of the way, -1 for the left one. */
  side: number
  /** The picture turns toward who comes along the way. */
  turn: number
  width: number
  height: number
  /** The height of the middle of the picture. */
  middle: number
}

export type Arch = { s: number; section: SectionId; count: number }
export type Banner = { s: number; category: AchievementCategory }

/** How far along the way the first collection starts, and the room before the start again. */
const FIRST = 14
const LAST = 10
/** The room between two collections, and how far into it their arch stands. */
const ARCH = 18
const DOOR = 11
/** How far the face of a picture is turned from looking along the way, toward the way. */
const TURN = (55 * Math.PI) / 180

/** Spreads the collections over the two rounds: arches, banners and one easel for each piece. */
export function hangUp(list: Show[]) {
  const starts = (index: number) => list[index].section !== list[index - 1]?.section
  const category = (index: number) => {
    const { record } = list[index] ?? {}
    return record?.kind === 'group' ? record.category : undefined
  }
  const arches = list.filter((_, index) => starts(index)).length
  const banners = list.filter(
    (_, index) => category(index) && category(index)!.id !== category(index - 1)?.id,
  ).length
  const step = (length - FIRST - LAST - arches * ARCH) / Math.max(list.length + banners, 1)

  const stands: Stand[] = []
  const gates: Arch[] = []
  const flags: Banner[] = []
  let s = FIRST
  list.forEach((show, index) => {
    if (starts(index)) {
      const count = list.filter((item) => item.section === show.section).length
      gates.push({ s: s + DOOR, section: show.section, count })
      s += ARCH
    }
    const own = category(index)
    if (own && own.id !== category(index - 1)?.id) {
      flags.push({ s, category: own })
      s += step
    }
    const side = index % 2 ? -1 : 1
    stands.push({
      s,
      x: side * layout.stand,
      side,
      turn: -side * TURN,
      ...SIZES[show.record.kind],
    })
    s += step
  })
  return { stands, gates, banners: flags }
}

export type Salon = ReturnType<typeof hangUp>

/** How far from a picture a visitor looks at it. */
export const lookingDistance = ({ width, height }: Stand) =>
  Math.max(width, height) * SHRINK * 1.1 + 1.4

/** How far a walker who is seen from behind looks past a picture, so the body does not hide it. */
const ASIDE = 0.42

/** Where a visitor stands to look at a stand: in front of the picture. */
export function spotAtStand(stand: Stand, third: boolean): Spot {
  const distance = lookingDistance(stand)
  const nx = Math.sin(stand.turn)
  const nz = Math.cos(stand.turn)
  const heading = Math.atan2(-nx, -nz)
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.6 : ASIDE
  return {
    x: stand.x + nx * distance,
    z: -stand.s + nz * distance,
    yaw: heading + Math.PI + (third ? aside : 0),
    pitch: third ? 0 : Math.atan2(stand.middle - 1.6, distance),
    heading,
  }
}

const facing = (s: number): Spot => ({ x: 0, z: -s, yaw: 0, pitch: 0.04, heading: Math.PI })

/** Where a new visitor stands, before the first arch. */
export const START = facing(12)

/**
 * Where the button of a collection brings a visitor: before its arch, out of reach of the
 * pieces of the one before.
 */
export const spotBeforeArch = ({ s }: Arch) => facing(s - 6)

/** The way back to the lobby, beside the start. Its "z" is where it is along the ribbon. */
export const EXIT: Gate = { position: [-3.2, 0, -5], turn: (Math.PI * 3) / 4, open: true }

/** The way across is closed by the rims; along the ribbon it never ends. */
export const floorOf = (stands: Stand[]): Floor => ({
  gates: [EXIT],
  circles: stands.map(({ x, s }) => ({ x, z: -s, radius: 1.15 })),
  far: -Infinity,
  side: walk,
  inside: (x) => Math.abs(x) <= walk,
})
