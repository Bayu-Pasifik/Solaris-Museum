import { BAY, door } from './corridor'

/** "tour" walks from door to door; the other two walk freely, with or without a body in sight. */
export const MODES = {
  tour: 'Tur',
  first: 'Orang pertama',
  third: 'Orang ketiga',
} as const
export type Mode = keyof typeof MODES

/** Where a free walker is and where they look. "yaw" 0 looks down the corridor. */
export type Spot = {
  x: number
  z: number
  yaw: number
  pitch: number
  /** The way the body faces, when there is one. */
  heading: number
}

/** The spot, together with what the keys and the stick ask for. */
export type Roam = Spot & {
  /** The "code" of every walking key that is held down. */
  keys: Set<string>
  /** The touch stick: right and forward are positive, and its length is at most 1. */
  stick: { x: number; y: number }
}

/** These Resonators have no walking clip, so they cannot be walked with. */
const NO_WALK = new Set([
  'chisa',
  'chixia',
  'danjin',
  'hiyuki',
  'mortefi',
  'taoqi',
  'youhu',
])
export const canWalk = (id: string) => !NO_WALK.has(id)

/** Height of the step under a portal, and how far it reaches. */
export const STEP_HEIGHT = 0.2
export const STEP_RADIUS = 1.15

/** The sides of the floor that can be walked on, inside the columns. */
export const SIDE = 4.7
/** The entrance end, behind the first door. */
const START = 9

const facing = (z: number): Spot => ({ x: 0, z, yaw: 0, pitch: 0, heading: Math.PI })

/** In the middle of the corridor, a little before a door. */
export const spotBefore = (index: number) => facing(-index * BAY + 3.5)

/** A point as seen from a door: "across" is along the gate, "front" is out of it. */
function fromDoor(index: number, x: number, z: number) {
  const { position, turn } = door(index)
  const dx = x - position[0]
  const dz = z - position[2]
  return {
    across: dx * Math.cos(turn) - dz * Math.sin(turn),
    front: dx * Math.sin(turn) + dz * Math.cos(turn),
    distance: Math.hypot(dx, dz),
  }
}

/** Where a visitor who comes out of a room stands: before its door, looking down the corridor. */
export function spotOutside(index: number): Spot {
  const { position, turn } = door(index)
  return {
    ...facing(position[2] + Math.cos(turn) * 2.2),
    x: position[0] + Math.sin(turn) * 2.2,
  }
}

/** How close to the middle of the gate a walker must be to pass through it. */
const GATE = 0.75
/** The depth of the gate: passing this line from the front enters the room. */
const SILL = 0.3

export type Circle = { x: number; z: number; radius: number }

/**
 * One step of a walker from "at" toward "to". It slides along what is in the way, and it tells
 * which door was walked into.
 */
export function advance(
  at: { x: number; z: number },
  to: { x: number; z: number },
  doors: number,
  open: (index: number) => boolean,
  obstacles: Circle[],
): { x: number; z: number; entered?: number } {
  // The far wall closes the corridor behind two spare bays. Stop a little before it, so its
  // round window stays in sight.
  const wall = -(doors + 1.5) * BAY + 5

  for (let index = 0; index < doors; index++) {
    const next = fromDoor(index, to.x, to.z)
    if (next.front >= SILL || Math.abs(next.across) >= GATE) continue
    if (open(index) && fromDoor(index, at.x, at.z).front >= SILL) {
      return { x: at.x, z: at.z, entered: index }
    }
  }

  const free = (x: number, z: number) => {
    if (Math.abs(x) > SIDE || z > START || z < wall) return false
    for (let index = 0; index < doors; index++) {
      const next = fromDoor(index, x, z)
      // The gate and the back of its step are solid.
      if (next.distance < STEP_RADIUS && next.front < SILL) return false
    }
    return obstacles.every((circle) => {
      const next = Math.hypot(x - circle.x, z - circle.z)
      // A walker who starts inside a circle can still walk out of it.
      return next >= circle.radius || next > Math.hypot(at.x - circle.x, at.z - circle.z)
    })
  }

  if (free(to.x, to.z)) return { x: to.x, z: to.z }
  if (free(to.x, at.z)) return { x: to.x, z: at.z }
  if (free(at.x, to.z)) return { x: at.x, z: to.z }
  return { x: at.x, z: at.z }
}

/** The door that is close in front of the walker, if any. */
export function doorAhead(x: number, z: number, doors: number) {
  let found: number | undefined
  let best = 2.4
  for (let index = 0; index < doors; index++) {
    const { front, distance } = fromDoor(index, x, z)
    if (front > 0 && distance < best) {
      best = distance
      found = index
    }
  }
  return found
}

/** Whether a point is on the step of some door. */
export const onStep = (x: number, z: number, doors: number) =>
  Array.from({ length: doors }, (_, index) => fromDoor(index, x, z).distance).some(
    (distance) => distance < STEP_RADIUS,
  )

type Choice = { mode: Mode; hero?: string }

const KEY = 'solaris-museum:walk'

/** The saved text can be old, broken or edited by hand, so every field is checked. */
export function loadChoice(): Choice {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Choice> | null
    const mode = data?.mode
    return {
      mode: mode && Object.hasOwn(MODES, mode) ? mode : 'tour',
      hero: typeof data?.hero === 'string' ? data.hero : undefined,
    }
  } catch {
    return { mode: 'tour' }
  }
}

export function saveChoice(choice: Choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice))
  } catch {
    // A full or forbidden storage; the choice then lasts until the page is closed.
  }
}
