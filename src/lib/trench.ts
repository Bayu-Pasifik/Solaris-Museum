import layout from '../assets/documents/trench.json'
import { KINDS, regionOf, type DocumentKind, type Shelved } from './documents'
import type { ElementTheme } from './elements'
import type { Floor, Gate, Spot } from './roam'
import { categoryTheme } from './stories'

/*
 * The Drowned Archive: the documents on the floor of the sea, one depth for every kind. It is
 * modeled by scripts/build-trench.py, which also writes the layout read here.
 *
 * A path winds from side to side along "-z". "s" is the way walked along it.
 */

export const LAYOUT = layout
const { amp, wave, walk, stand } = layout

/** The middle of the path at "s". The same as "center" in the script. */
export const center = (s: number) => amp * Math.sin((Math.PI * 2 * s) / wave)
/** The height of the path at "s". The same as "base" in the script. */
export const base = (s: number) => 0.18 * Math.sin((Math.PI * 2 * s) / 16)
/** The turn about the upright line of a thing that faces back along the path. */
export const bend = (s: number) =>
  -Math.atan(((amp * Math.PI * 2) / wave) * Math.cos((Math.PI * 2 * s) / wave))

/** A document as the walk lists it. */
export type Paper = { id: string; name: string; kind: DocumentKind; document: Shelved }

const ORDER = Object.keys(KINDS) as DocumentKind[]

export const wingOf = ({ kind }: { kind: DocumentKind }) => KINDS[kind]
export const WINGS = ORDER.map((kind) => KINDS[kind])
export const colorsOf = ({ kind }: { kind: DocumentKind }): ElementTheme => categoryTheme(ORDER, kind)

export const papersOf = (documents: Shelved[]): Paper[] =>
  documents.map((document) => ({
    id: String(document.id),
    name: document.title,
    kind: document.kind,
    document,
  }))

type Depth = {
  name: string
  /** The color of the water far away, and of the light from above. */
  water: string
  above: string
  /** Where the water begins to hide things, and where it hides all. */
  sight: [number, number]
  light: { color: string; ambient: number; sun: number }
  /** How strong the net of light on the floor is. */
  ripple: number
  /** The color of the jellyfish. */
  jelly: string
  /** The notes that sound when a stand wakes. */
  notes: number[]
}

export const DEPTHS: Record<DocumentKind, Depth> = {
  text: {
    name: 'Bottle Meadow',
    water: '#1c96ae',
    above: '#c4fff0',
    sight: [20, 82],
    light: { color: '#fff6d8', ambient: 1.75, sun: 1.9 },
    ripple: 0.55,
    jelly: '#ffc2e2',
    notes: [76, 83],
  },
  picture: {
    name: 'Clam Reef',
    water: '#3d62b8',
    above: '#ffd6ec',
    sight: [20, 80],
    light: { color: '#ffe8e0', ambient: 1.7, sun: 1.8 },
    ripple: 0.4,
    jelly: '#9ff4ff',
    notes: [72, 79, 84],
  },
  record: {
    name: 'Gramophone Grotto',
    water: '#281a62',
    above: '#8a62d6',
    sight: [16, 74],
    light: { color: '#e6d6ff', ambient: 1.8, sun: 1.5 },
    ripple: 0.22,
    jelly: '#ffe28a',
    notes: [69, 72, 76, 81, 79],
  },
  foreign: {
    name: 'Letterless Abyss',
    water: '#060d27',
    above: '#163a74',
    sight: [14, 66],
    light: { color: '#bcd4ff', ambient: 1.45, sun: 1.1 },
    ripple: 0.08,
    jelly: '#7df9ff',
    notes: [57, 64, 63],
  },
}

export type Stand = {
  s: number
  x: number
  /** 1 for the right side of the path, -1 for the left one. */
  side: number
  /** The sheet turns toward the path and toward who comes along it. */
  turn: number
}

/** A wreck over the path, where the documents of a region begin. */
export type Arch = { s: number; region: string; count: number }

/** Where along the path the first document is, and the room from one to the next. */
const FIRST = 18
const STEP = 4.6
/** The room that an arch takes, and how far into it the arch stands. */
const ARCH = 9
const DOOR = 3.5
/** The room between the last document and the middle of the landmark. */
const TAIL = 20
/** How far from the middle of the landmark the path ends. */
const KEEP = 10
/** How far the face of a sheet is turned from looking back along the path, toward the path. */
const TURN = (55 * Math.PI) / 180

/** Lays one depth out: a stand for every document, an arch for every region, and the end. */
export function layOut(list: Paper[]) {
  const stands: Stand[] = []
  const arches: Arch[] = []
  let s = FIRST
  list.forEach(({ document }, index) => {
    const region = regionOf(document)
    if (region !== arches[arches.length - 1]?.region) {
      const count = list.filter((item) => regionOf(item.document) === region).length
      arches.push({ s: s - STEP / 2 + DOOR, region, count })
      s += ARCH
    }
    const side = index % 2 ? -1 : 1
    stands.push({ s, x: center(s) + side * stand, side, turn: -side * TURN + bend(s) })
    s += STEP
  })
  return { stands, arches, end: s + TAIL }
}

export type Trail = ReturnType<typeof layOut>

/** The size of a sheet, the height of its lower edge, and how far a visitor reads it from. */
export const SHEET = { width: 2.4, height: (2.4 * 600) / 768, low: 2 }
const READING = 5.1

/** How far a walker who is seen from behind looks past a sheet, so the body does not hide it. */
const ASIDE = 0.42

/** Where a visitor stands to read a stand: in front of its sheet. */
export function spotAtStand(at: Stand, third: boolean): Spot {
  const nx = Math.sin(at.turn)
  const nz = Math.cos(at.turn)
  const heading = Math.atan2(-nx, -nz)
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.6 : ASIDE
  return {
    x: at.x + nx * READING,
    z: -at.s + nz * READING,
    yaw: heading + Math.PI + (third ? aside : 0),
    pitch: third ? 0.21 : Math.atan2(SHEET.low + SHEET.height / 2 - 1.6, READING),
    heading,
  }
}

const ARRIVAL = 10

/** Where a visitor stands who comes out of the diving bell. */
export const START: Spot = {
  x: center(ARRIVAL),
  z: -ARRIVAL,
  yaw: bend(ARRIVAL),
  pitch: 0.06,
  heading: bend(ARRIVAL) + Math.PI,
}

/** The way back to the lobby, in front of the diving bell. */
export const EXIT: Gate = {
  position: [center(5) - 3.4, base(5), -5],
  turn: (Math.PI * 3) / 4,
  open: true,
}

/** The path ends behind the bell and before the landmark. */
export const floorOf = ({ stands, end }: Trail): Floor => ({
  gates: [EXIT],
  circles: stands.map(({ x, s }) => ({ x, z: -s, radius: 1.15 })),
  far: -(end - KEEP),
  side: amp + walk + 2,
  inside: (x, z) => {
    const s = -z
    return s >= 1 && s <= end - KEEP && Math.abs(x - center(s)) <= walk
  },
  height: (_, z) => base(-z),
})
