import layout from '../assets/glossary/popup.json'
import type { Term } from './glossary'
import type { Floor, Gate, Spot } from './roam'

/*
 * The Pop-up Lexicon: a dictionary that lies open on a desk, as big as a square. It is modeled by
 * scripts/build-popup.py, which also writes the layout read here.
 *
 * Only one spread is open at a time. So that a place says which spread it is on, the spreads lie
 * one behind the other, far apart: "z" of the walk is the place on the page, less PITCH for every
 * spread before. The page draws the one book where the walker is.
 */

export const LAYOUT = layout
const { wide, walk, heights } = layout

/** The way between two spreads. */
export const PITCH = 100
/** How many terms stand on one spread. */
const PER_SPREAD = 8

export const LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** Names that start with a digit or a quote stand under "#". */
export const letterOf = (name: string) => name.match(/^[A-Z]/i)?.[0].toUpperCase() ?? '#'

/** A term as the walk lists it. */
export type Entry = { id: string; name: string; letter: string; term: Term }

export type Spread = { letter: string; first: number; count: number }

/** The terms in the order of the book: by letter, and as the glossary lists them within one. */
export const entriesOf = (terms: Term[]): Entry[] =>
  terms
    .map((term) => ({ id: String(term.id), name: term.name, letter: letterOf(term.name), term }))
    .sort((a, b) => LETTERS.indexOf(a.letter) - LETTERS.indexOf(b.letter))

const bound = new WeakMap<Entry[], { spreads: Spread[]; of: number[] }>()

/** Cuts the book into spreads. Every letter starts a new one. */
export function bind(list: Entry[]) {
  let book = bound.get(list)
  if (!book) {
    const spreads: Spread[] = []
    const of = list.map(({ letter }, index) => {
      const open = spreads[spreads.length - 1]
      if (open && open.letter === letter && open.count < PER_SPREAD) open.count += 1
      else spreads.push({ letter, first: index, count: 1 })
      return spreads.length - 1
    })
    book = { spreads, of }
    bound.set(list, book)
  }
  return book
}

/** The spread that a "z" of the walk is on. */
export const spreadAt = (z: number) => Math.round(-z / PITCH)
/** Where on its page a "z" of the walk is. */
export const onPage = (z: number) => z + spreadAt(z) * PITCH

/** The height of the page, "x" from the spine. */
export function pageHeight(x: number) {
  const at = Math.min(Math.abs(x), wide) * 2
  const low = Math.min(Math.floor(at), heights.length - 2)
  return heights[low] + (heights[low + 1] - heights[low]) * (at - low)
}

/** The places of the cards on a spread, in the order of reading: the left page, then the right. */
const SLOTS = [
  [-7.6, -4.0],
  [-2.8, -4.4],
  [-9.4, 1.6],
  [-4.8, 1.9],
  [2.8, -4.4],
  [7.6, -4.0],
  [4.8, 1.9],
  [9.4, 1.6],
] as const

/** Where a card stands on its page, turned a little toward the front of the book. */
export function slotOf(slot: number) {
  const [x, z] = SLOTS[slot]
  return { x, z, y: pageHeight(x), turn: Math.atan2(-x, 8 - z) * 0.55 }
}

/** How far from a card a visitor reads it. */
const READING = 4.1
/** How far a walker who is seen from behind looks past a card, so the body does not hide it. */
const ASIDE = 0.42

/** Where a visitor stands to read the term at "index" of "list". */
export function spotAtCard(list: Entry[], index: number, third: boolean): Spot {
  const { spreads, of } = bind(list)
  const spread = of[index]
  const card = slotOf(index - spreads[spread].first)
  const nx = Math.sin(card.turn)
  const nz = Math.cos(card.turn)
  const heading = Math.atan2(-nx, -nz)
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.6 : ASIDE
  return {
    x: card.x + nx * READING,
    z: card.z + nz * READING - spread * PITCH,
    yaw: heading + Math.PI + (third ? aside : 0),
    pitch: third ? 0 : Math.atan2(layout.card.middle - 1.6, READING),
    heading,
  }
}

/** Where a visitor stands who opens a spread: at its front, looking at the paper scene. */
export const spotAtSpread = (spread: number): Spot => ({
  x: 0,
  z: 7.2 - spread * PITCH,
  yaw: 0,
  pitch: 0.06,
  heading: Math.PI,
})

/** The way back to the lobby, at the front of the left page. Its "z" is the one on the page. */
export const EXIT: Gate = {
  position: [-5.2, pageHeight(5.2), 9.8],
  turn: 2.85,
  open: true,
}

/** The pages end the walk. The outer edges turn the page before a walker reaches the end. */
export function floorOf(list: Entry[]): Floor {
  const { spreads } = bind(list)
  return {
    gates: spreads.map((_, spread) => ({
      ...EXIT,
      position: [EXIT.position[0], EXIT.position[1], EXIT.position[2] - spread * PITCH],
    })),
    circles: spreads.flatMap(({ count }, spread) =>
      Array.from({ length: count }, (_, slot) => {
        const { x, z } = slotOf(slot)
        return { x, z: z - spread * PITCH, radius: 1.1 }
      }),
    ),
    far: -Infinity,
    side: walk,
    inside: (x, z) => {
      const along = onPage(z)
      return Math.abs(x) <= walk && along >= -5.6 && along <= 10.4
    },
    height: (x) => pageHeight(x),
  }
}
