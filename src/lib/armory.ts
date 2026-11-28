import { BAY } from './corridor'
import type { Gate, Spot } from './roam'
import type { Weapon } from './weapons'

/** The order of the wings. A kind of weapon that is not listed comes after these. */
const ORDER = ['Broadblade', 'Sword', 'Pistols', 'Gauntlets', 'Rectifier']

export const wingsOf = (weapons: Weapon[]) => {
  const rank = (type: string) => (ORDER.indexOf(type) + 1 || ORDER.length + 1)
  return [...new Set(weapons.map((weapon) => weapon.type))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  )
}

/** The weapons of one wing, the best ones by the entrance. */
export const wing = (weapons: Weapon[], type: string) =>
  weapons
    .filter((weapon) => weapon.type === type)
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name))

/** Stands face each other in pairs, one pair in every bay of the corridor. */
export const rowOf = (index: number) => Math.floor(index / 2)

export function stand(index: number) {
  const side = index % 2 ? 1 : -1
  const position: [number, number, number] = [side * 2.7, 0, -rowOf(index) * BAY]
  // Turned toward the carpet and the entrance.
  return { side, position, turn: -side * 0.9 }
}

/** How far a walker who is seen from behind looks past a stand, so the body does not hide it. */
const ASIDE = 0.55

/** Where a visitor stands to look at a stand. */
export function spotAtStand(index: number, third: boolean): Spot {
  const { side, position } = stand(index)
  const x = side * 0.5
  // Closer to this stand than to the one a row nearer the entrance.
  const z = position[2] + 1.6
  const dx = position[0] - x
  const dz = position[2] - z
  // A tall screen shows less at the sides.
  const aside = window.innerHeight > window.innerWidth ? ASIDE * 0.65 : ASIDE
  const yaw = Math.atan2(-dx, -dz) + (third ? side * aside : 0)
  return { x, z, yaw, pitch: 0, heading: Math.atan2(dx, dz) }
}

/** The way back to the lobby, beside the entrance. */
export const EXIT: Gate = { position: [-3.2, 0, 5.4], turn: 0.9, open: true }
