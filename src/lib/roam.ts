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
/**
 * The far wall closes a corridor of "bays" behind two spare ones. A walker stops a little before
 * it, so its round window stays in sight.
 */
export const farEnd = (bays: number) => -(bays + 1.5) * BAY + 5

const facing = (z: number): Spot => ({ x: 0, z, yaw: 0, pitch: 0, heading: Math.PI })

/** In the middle of the corridor, a little before a door. */
export const spotBefore = (index: number) => facing(-index * BAY + 3.5)

/**
 * Where a visitor who comes out of a room stands: on the carpet before its door, looking down
 * the corridor, with the guard at their side instead of right behind them.
 */
export function spotOutside(index: number): Spot {
  const { side, position } = door(index)
  return { ...facing(position[2] + 1.6), x: side * 0.5 }
}

/** A portal that stands on the floor. A closed one cannot be walked into. */
export type Gate = { position: [number, number, number]; turn: number; open: boolean }

export type Circle = { x: number; z: number; radius: number }

/** What a walker can walk on: the portals, the things in the way, and the far end. */
export type Floor = { gates: Gate[]; circles: Circle[]; far: number }

/** A point as seen from a gate: "across" is along it, "front" is out of it. */
function fromGate({ position, turn }: Gate, x: number, z: number) {
  const dx = x - position[0]
  const dz = z - position[2]
  return {
    across: dx * Math.cos(turn) - dz * Math.sin(turn),
    front: dx * Math.sin(turn) + dz * Math.cos(turn),
    distance: Math.hypot(dx, dz),
  }
}

/** How close to the middle of the gate a walker must be to pass through it. */
const GATE = 0.75
/** The depth of the gate: passing this line from the front enters it. */
const SILL = 0.3

/**
 * One step of a walker from "at" toward "to". It slides along what is in the way, and it tells
 * which gate was walked into.
 */
export function advance(
  at: { x: number; z: number },
  to: { x: number; z: number },
  { gates, circles, far }: Floor,
): { x: number; z: number; entered?: number } {
  const entered = gates.findIndex((gate) => {
    const next = fromGate(gate, to.x, to.z)
    if (!gate.open || next.front >= SILL || Math.abs(next.across) >= GATE) return false
    return fromGate(gate, at.x, at.z).front >= SILL
  })
  if (entered >= 0) return { x: at.x, z: at.z, entered }

  const free = (x: number, z: number) => {
    if (Math.abs(x) > SIDE || z > START || z < far) return false
    const solid = gates.some((gate) => {
      const next = fromGate(gate, x, z)
      // The gate and the back of its step are solid.
      return next.distance < STEP_RADIUS && next.front < SILL
    })
    if (solid) return false
    return circles.every((circle) => {
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

/** The index of the point on the floor that is closest to the walker, if one is within reach. */
export function nearest(x: number, z: number, points: [number, number, number][], reach: number) {
  let found: number | undefined
  let best = reach
  points.forEach(([px, , pz], index) => {
    const distance = Math.hypot(x - px, z - pz)
    if (distance < best) {
      best = distance
      found = index
    }
  })
  return found
}

/** The gate that is close in front of the walker, if any. */
export function gateAhead(x: number, z: number, gates: Gate[]) {
  const away: [number, number, number] = [Infinity, 0, 0]
  // A gate that is seen from behind is out of reach.
  const seen = gates.map((gate) => (fromGate(gate, x, z).front > 0 ? gate.position : away))
  return nearest(x, z, seen, 2.4)
}

/** Whether a point is on the step of some gate. */
export const onStep = (x: number, z: number, gates: Gate[]) =>
  gates.some((gate) => fromGate(gate, x, z).distance < STEP_RADIUS)

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
