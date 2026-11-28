import layout from '../assets/armory/foundry.json'
import type { Floor, Gate, Spot } from './roam'

/*
 * The Ember Foundry: a round floor over a lake of lava where a giant smith beats a blade, with
 * a bridge to one forge for every kind of weapon. It is modeled by scripts/build-foundry.py,
 * which also writes the layout read here. A bearing of 0 points toward -z and grows to the
 * right.
 */

export const LAYOUT = layout
const { hub, bridge, forge, landing, bearings } = layout

const TAU = Math.PI * 2

export type Kind = keyof typeof bearings
export const KINDS = Object.keys(bearings) as Kind[]

/** The names of the forges. */
export const FORGE_NAMES: Record<Kind, string> = {
  broadblade: 'Anvil Yard',
  sword: 'Quenching Spring',
  pistols: 'Gunworks',
  gauntlets: 'Piston Press',
  rectifier: 'Arcane Kiln',
}

/** A kind of weapon that has no forge of its own shares the last one. */
export const kindOf = (type: string): Kind => {
  const name = type.toLowerCase()
  return Object.hasOwn(bearings, name) ? (name as Kind) : 'rectifier'
}

/** The order of the forges, from the left of a new visitor to the right. */
const rank = (type: string) => KINDS.indexOf(kindOf(type))
export const byForge = (a: { type: string }, b: { type: string }) =>
  rank(a.type) - rank(b.type) || a.type.localeCompare(b.type)

/** A point that is "far" from the middle of the map, at a bearing. */
export const arc = (far: number, bearing: number, up = 0): [number, number, number] => [
  far * Math.sin(bearing),
  up,
  -far * Math.cos(bearing),
]

export const middleOf = (kind: Kind) => arc(forge.far, bearings[kind])

export type Stand = {
  position: [number, number, number]
  /** Turned toward the middle of its forge. */
  turn: number
  forge: Kind
}

/**
 * The stands of the weapons in "list", one for each, in its order. Those of a forge share its
 * ring, from one side of the way in round to the other.
 */
export function standsOf(list: { type: string }[]): Stand[] {
  const total = new Map<Kind, number>()
  for (const { type } of list) total.set(kindOf(type), (total.get(kindOf(type)) ?? 0) + 1)
  const taken = new Map<Kind, number>()
  return list.map(({ type }) => {
    const kind = kindOf(type)
    const at = taken.get(kind) ?? 0
    taken.set(kind, at + 1)
    // ponytail: one ring holds about 35 weapons; more of one kind would need a second ring.
    const angle = forge.gap + ((at + 0.5) / total.get(kind)!) * (TAU - 2 * forge.gap)
    // The ring is laid out with the way in toward +z, then turned toward the middle of the map.
    const turned = -bearings[kind]
    const x = forge.stands * Math.sin(angle)
    const z = forge.stands * Math.cos(angle)
    const [cx, , cz] = middleOf(kind)
    return {
      position: [
        cx + x * Math.cos(turned) + z * Math.sin(turned),
        0,
        cz - x * Math.sin(turned) + z * Math.cos(turned),
      ],
      turn: angle + turned + Math.PI,
      forge: kind,
    }
  })
}

/** Whether a walker can stand at a point: on a floor or on a bridge. */
export function inside(x: number, z: number) {
  if (Math.hypot(x, z) <= hub.radius - 0.4) return true
  if (Math.hypot(x, z - landing.far) <= landing.radius - 0.6) return true
  const onBridge = (bearing: number, end: number) => {
    const along = x * Math.sin(bearing) - z * Math.cos(bearing)
    const across = x * Math.cos(bearing) + z * Math.sin(bearing)
    return Math.abs(across) <= bridge && along >= hub.radius - 1.5 && along <= end
  }
  if (onBridge(Math.PI, landing.far - landing.radius + 1.5)) return true
  return KINDS.some((kind) => {
    const [cx, , cz] = middleOf(kind)
    return (
      Math.hypot(x - cx, z - cz) <= forge.radius - 0.7 ||
      onBridge(bearings[kind], forge.far - forge.radius + 1.5)
    )
  })
}

/** The way back to the lobby, behind a new visitor. */
export const EXIT: Gate = { position: [0, 0, landing.gate], turn: Math.PI, open: true }

/** Where a new visitor stands, looking up at the smith. */
export const START: Spot = { x: 0, z: 20.5, yaw: 0, pitch: 0.16, heading: Math.PI }

export const floorOf = (stands: Stand[]): Floor => ({
  gates: [EXIT],
  circles: [
    { x: 0, z: 0, radius: hub.dais + 0.4 },
    // The posts and the fires of the way out.
    ...[-1, 1].flatMap((side) => [
      { x: side * 2.7, z: landing.gate + 1.4, radius: 0.6 },
      { x: side * 3.9, z: landing.far + 1.2, radius: 0.5 },
    ]),
    ...KINDS.map((kind) => {
      const [x, , z] = middleOf(kind)
      return { x, z, radius: forge.mark }
    }),
    ...stands.map(({ position: [x, , z] }) => ({ x, z, radius: 0.8 })),
  ],
  far: -Infinity,
  side: 1000,
  inside,
})

/** How far a walker who is seen from behind looks past a weapon, so the body hides nothing. */
const ASIDE = 0.5

/** Where a visitor stands to look at a weapon: between it and the landmark. */
export function spotAtStand({ position, forge: kind }: Stand, third: boolean): Spot {
  const [cx, , cz] = middleOf(kind)
  const share = forge.look / forge.stands
  const x = position[0] + (cx - position[0]) * share
  const z = position[2] + (cz - position[2]) * share
  const heading = Math.atan2(position[0] - x, position[2] - z)
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.65 : ASIDE
  return { x, z, yaw: heading + Math.PI + (third ? aside : 0), pitch: 0, heading }
}

/** On the bridge to a forge, looking into it. */
export function spotAtForge(kind: Kind): Spot {
  const bearing = bearings[kind]
  const [x, , z] = arc(forge.far - forge.radius - 2, bearing)
  return { x, z, yaw: -bearing, pitch: 0.1, heading: Math.PI - bearing }
}
