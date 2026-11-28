import { BAY } from './corridor'
import type { Gate, Spot } from './roam'

/*
 * One aisle between two walls of bookcases, with one book for every story. Every section starts
 * in a bay of its own, so there is room for its name.
 */

/** How far the books of a wall stand from the middle of the aisle. */
export const WALL = 3.05
/** How far from the middle a walker can go. The camera behind them stays out of the cases. */
export const AISLE = 2.1
/** The distance between two story books on one wall. */
export const GAP = 0.5
/** Story books in one bay of the aisle, on both walls together. */
const PER_BAY = (BAY / GAP) * 2

/** The books of one bay: the index of the first one and how many there are. */
export type Bay = { first: number; count: number; section: string }

/** Where a book stands. "side" is -1 at the left wall and 1 at the right one. */
export type Place = { bay: number; side: number; x: number; z: number }

export type Aisle = { bays: Bay[]; books: Place[] }

/**
 * Puts the books in the aisle, given the section of every book. Books of one section follow
 * each other, and take turns at the left and the right wall.
 */
export function layOut(sections: string[]): Aisle {
  const bays: Bay[] = []
  const books = sections.map((section, index) => {
    let bay = bays[bays.length - 1]
    if (!bay || bay.section !== section || bay.count === PER_BAY) {
      bay = { first: index, count: 0, section }
      bays.push(bay)
    }
    const at = bay.count++
    const side = at % 2 ? 1 : -1
    const z = -(bays.length - 1) * BAY - Math.floor(at / 2) * GAP
    return { bay: bays.length - 1, side, x: side * WALL, z }
  })
  return { bays, books }
}

/** How far a walker who is seen from behind looks past a book, so the body does not hide it. */
const aside = (third: boolean) =>
  // A tall screen shows less at the sides.
  third ? (window.innerHeight > window.innerWidth ? 0.28 : 0.45) : 0

/** Where a visitor stands to look at a book. */
export function spotAtBook({ side, x: wall, z: place }: Place, third: boolean): Spot {
  // The eyes of a first-person visitor need more room to take in the whole cover.
  const x = third ? side * 0.9 : 0
  const z = place + 0.4
  const yaw = Math.atan2(x - wall, z - place) + side * aside(third)
  return { x, z, yaw, pitch: 0, heading: Math.atan2(wall - x, place - z) }
}

/** How far before the first books of a section a visitor counts as being in it. */
const BEFORE = 2

/** Where a visitor stands at the start of a bay, looking down the aisle. */
export const spotAtBay = (bay: number): Spot => ({
  x: 0,
  z: -bay * BAY + BEFORE - 0.5,
  yaw: 0,
  pitch: 0,
  heading: Math.PI,
})

/** The bay that a walker is in. */
export const bayAt = (z: number, { bays }: Aisle) =>
  Math.min(Math.max(Math.floor((BEFORE - z) / BAY), 0), bays.length - 1)

/** How far a book can be seen well enough to be chosen. */
const REACH = 4.2

/** The index of the book that a walker looks at, if a wall with one is close in front. */
export function bookAhead(
  { x, z, yaw }: { x: number; z: number; yaw: number },
  third: boolean,
  { bays }: Aisle,
) {
  for (const side of [-1, 1]) {
    const look = yaw - side * aside(third)
    // How much of the look goes toward this wall.
    const toward = -Math.sin(look) * side
    if (toward < 0.45) continue
    const away = (side * WALL - x) / -Math.sin(look)
    if (away > REACH) continue
    const slot = Math.round((away * Math.cos(look) - z) / GAP)
    const bay = Math.floor(slot / (PER_BAY / 2))
    const at = (slot - bay * (PER_BAY / 2)) * 2 + (side > 0 ? 1 : 0)
    if (bays[bay] && at < bays[bay].count) return bays[bay].first + at
  }
}

/**
 * The way back to the lobby, in the middle of the aisle behind the entrance. It faces the books,
 * and stands far enough back that a camera behind a walker at the entrance is in front of it.
 */
export const SHELF_EXIT: Gate = { position: [0, 0, 8.6], turn: Math.PI, open: true }
