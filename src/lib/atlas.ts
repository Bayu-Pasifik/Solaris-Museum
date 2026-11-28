import { Matrix4, Quaternion, Vector3 } from 'three'
import layout from '../assets/map/orrery.json'
import { regionColors, type Area, type Region } from './map'
import type { Spot } from './roam'

/*
 * The Armillary Atlas: every region is a small planet, and every area a landmark on it. The
 * models are made by scripts/build-orrery.py, which also writes the layout read here.
 *
 * The walker stays on top of the planet, at the zero point, and the planet turns underneath. A
 * "direction" is a unit vector from the middle of a planet, in the planet's own axes.
 */

export const LAYOUT = layout

/** An area as the walk lists it. */
export type Land = { id: string; name: string; region: Region; area: Area }

export const landsOf = (regions: Region[]): Land[] =>
  regions.flatMap((region) =>
    region.areas.map((area) => ({
      id: `${region.id}/${area.id}`,
      name: area.name,
      region,
      area,
    })),
  )

export const wingOf = ({ region }: Land) => region.name
export const colorsOf = ({ region }: Land) => regionColors(region.id)

type Motion = 'spin' | 'wheel' | 'flag' | 'rock' | 'sway' | 'bob' | 'tumble' | 'rise' | 'pulse'
type Model = { pivot: [number, number, number]; motion: Motion; high: number }

export const MODELS = layout.sites as unknown as Record<string, Model>
const KINDS = layout.areas as Record<string, string>
/** The landmark of an area that the script does not know. */
const SPARE = 'cairn'

type Air = {
  /** The sky above and at the horizon, by day and by night. */
  day: [string, string]
  night: [string, string]
  sun: string
  /** The notes that sound when an area is surveyed. */
  notes: number[]
}

const AIRS: Record<number, Air> = {
  1: { day: ['#2f8fd6', '#ffe3a8'], night: ['#0c1440', '#6a3f7a'], sun: '#fff0cc', notes: [72, 74, 79, 81] },
  900: { day: ['#0c1a44', '#2f7f9e'], night: ['#03061a', '#14305c'], sun: '#cfeaff', notes: [69, 76, 79, 83] },
  3: { day: ['#3f78d8', '#ffd0c0'], night: ['#171048', '#8a4a76'], sun: '#ffe8d8', notes: [76, 79, 83, 88] },
  4: { day: ['#4f86c8', '#dff0ff'], night: ['#050c2e', '#2a5c78'], sun: '#eaf4ff', notes: [74, 81, 86, 83] },
}
export const airOf = (id: number) => AIRS[id] ?? AIRS[900]

/** The models of a region that the script has no planet for are those of this one. */
export const planetOf = (id: number) => (layout.planets.includes(id) ? id : 900)

/** A planet grows with the number of its areas, between these radii in meters. */
const radiusOf = (count: number) => Math.min(22, Math.max(16, 4.9 * Math.sqrt(count + 1)))

/** How far from the place of arrival the first of a few areas stands, in meters. */
const ARRIVAL = 9.6

/** The turns that are tried, in order, for the way a landmark looks. */
const TURNS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6].map((step) => (step * Math.PI) / 6)

/** Below this many areas, an even spread would hide all of them behind the horizon. */
const FEW = 6

/** From the middle of a landmark: how far its ground reaches, and where its picture stands. */
export const GROUND = 3.1
export const EASEL: [number, number] = [2.5, 2.7]
/** Where a visitor stands to look at a landmark, to the side and before it. */
const READING: [number, number] = [1.1, 7.8]
/** How far behind the place of arrival the way back to the lobby is. */
const BACK = 6.5
/** How far a walker who is seen from behind looks past a picture, so the body does not hide it. */
const ASIDE = 0.34

const UP = new Vector3(0, 1, 0)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** The part of "toward" that lies flat on the ground at "up". */
function tangent(up: Vector3, toward: Vector3) {
  const flat = toward.clone().addScaledVector(up, -toward.dot(up))
  // A point right below or above says no way, so any flat way does.
  if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1).addScaledVector(up, -up.z)
  return flat.normalize()
}

/** The turn of a thing that stands on the ground at "up" and looks along the flat "front". */
export function standing(up: Vector3, front: Vector3) {
  const right = new Vector3().crossVectors(up, front)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, front))
}

export type Place = { up: Vector3; frame: Quaternion }

export type Site = Place & {
  kind: string
  /** The picture on its easel, and the flag of a surveyed area. */
  easel: Place
  flag: Place
  /** Where a visitor stands to look, and the turn of the planet that brings it on top. */
  view: Quaternion
}

export type Planet = {
  radius: number
  sites: Site[]
  /** The way back to the lobby. */
  exit: Place
}

/** The place that is reached from "from" by walking "x" to the right and "z" to the front. */
function walk(from: Place, x: number, z: number, radius: number) {
  const away = Math.hypot(x, z)
  const way = new Vector3(x, 0, z).normalize().applyQuaternion(from.frame)
  return from.up
    .clone()
    .multiplyScalar(Math.cos(away / radius))
    .addScaledVector(way, Math.sin(away / radius))
}

/** A thing at "up" that looks toward the point "at". */
const facing = (up: Vector3, at: Vector3): Place => ({
  up,
  frame: standing(up, tangent(up, at)),
})

/**
 * Spreads the areas of one region over its planet. The visitor arrives at the north pole, the
 * first area lies ahead, and every area is the nearest one to the area before it.
 */
export function layOut(lands: Land[]): Planet {
  const count = lands.length
  const radius = radiusOf(count)
  const free =
    count < FEW
      ? // A few areas: the first one is close enough to stand above the horizon on arrival.
        Array.from({ length: count }, (_, index) =>
          new Vector3().setFromSphericalCoords(
            1,
            ARRIVAL / radius + (index * 1.6) / Math.max(count - 1, 1),
            Math.PI + index * GOLDEN,
          ),
        )
      : // An even spread over the ball, without its first point, where the visitor arrives.
        Array.from({ length: count }, (_, index) => {
          // The shares keep both poles free, so no two areas crowd each other there.
          const y = 1 - (2 * (index + 1.2)) / (count + 1.4)
          const ring = Math.sqrt(Math.max(0, 1 - y * y))
          const angle = (index + 1) * GOLDEN
          return new Vector3(ring * Math.cos(angle), y, ring * Math.sin(angle))
        })
  const tour: Vector3[] = []
  let here = UP
  while (free.length) {
    let best = 0
    free.forEach((point, index) => {
      if (point.dot(here) > free[best].dot(here)) best = index
    })
    here = free.splice(best, 1)[0]
    tour.push(here)
  }
  // Turn the whole tour about the pole, so its start is straight ahead, along -z.
  const ahead = tour[0] ? Math.atan2(tour[0].x, -tour[0].z) : 0
  tour.forEach((point) => point.applyAxisAngle(UP, ahead))

  /** Whether a visitor, and the camera behind them, would stand clear of all other areas. */
  const clear = (from: Place) =>
    [READING[1], READING[1] + 2.5, READING[1] + 4].every((z) => {
      const point = walk(from, READING[0], z, radius)
      return tour.every((other) => other === from.up || point.angleTo(other) * radius > 5.6)
    })

  const sites = tour.map((up, index): Site => {
    const toward = facing(up, tour[index - 1] ?? UP)
    // A landmark looks back along the way, or else the first way beside it that is clear.
    const from =
      TURNS.map((angle) => ({
        up,
        frame: new Quaternion().setFromAxisAngle(up, angle).multiply(toward.frame),
      })).find(clear) ?? toward
    const eye = walk(from, READING[0], READING[1], radius)
    // The visitor looks back along the way from the landmark.
    const back = tangent(eye, walk(from, READING[0], READING[1] + 4, radius))
    const view = standing(eye, back).invert()
    return {
      ...from,
      kind: KINDS[lands[index].area.id] ?? SPARE,
      easel: facing(walk(from, EASEL[0], EASEL[1], radius), eye),
      flag: facing(walk(from, -2.4, 2.5, radius), eye),
      view,
    }
  })

  const behind = new Vector3(0, Math.cos(BACK / radius), Math.sin(BACK / radius))
  return { radius, sites, exit: facing(behind, UP) }
}

/** Where a visitor stands to look at an area; the scene turns the planet to it. */
export function spotAtSite(index: number, third: boolean): Spot {
  const heading = Math.PI
  return {
    x: 0,
    z: 0,
    yaw: third ? ASIDE : 0,
    pitch: third ? 0.1 : 0.03,
    heading,
    to: index,
  }
}

/** Where a visitor stands who has just landed. */
export const START: Spot = { x: 0, z: 0, yaw: 0, pitch: -0.04, heading: Math.PI }
