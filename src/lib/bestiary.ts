import { useJson } from './characters'

export type MonsterModel = {
  /** Several monsters can share one model. */
  id: string
  /** Path inside public/. */
  url: string
  defaultAnimation: string
  /** Friendly labels, keyed by animation clip name and in the order of the buttons. */
  animationLabels: Record<string, string>
  /** The box around the idle pose, in meters: width, height and depth. */
  size: [number, number, number]
  /** The middle of that box. */
  center: [number, number, number]
}

export type Monster = {
  id: number
  name: string
  /** "Calamity", "Overlord", "Elite" or "Standard". */
  rank: string
  /** A higher one is a stronger rank. */
  rankId: number
  element: string
  /** Path inside public/ of the head picture. Absent when the API has no file for it. */
  icon?: string
  /** What is said before the monster is found, and what is known after. */
  rumor: string
  description: string
  /** At level 1 and at level 90. */
  stats: { name: string; min: number; max?: number }[]
  /** In percent. */
  resistances: { name: string; value: number }[]
  /** Absent when the API has no 3D model of the monster. */
  model?: MonsterModel
}

/** The color of a rank, for its badge. */
const RANK_COLORS: Record<string, string> = {
  Calamity: '#c22b4a',
  Overlord: '#b06a00',
  Elite: '#6a3fc0',
  Standard: '#3d6c8f',
}

export const rankColor = (rank: string) => RANK_COLORS[rank] ?? '#1d1a4a'

/**
 * The strongest rank first, then in the order of the game. The game has several monsters of
 * one name (other stages or story versions), so those get a number.
 */
export function ordered(monsters: Monster[]) {
  const sorted = [...monsters].sort((a, b) => b.rankId - a.rankId || a.id - b.id)
  const seen = new Map<string, number>()
  return sorted.map((monster) => {
    const count = (seen.get(monster.name) ?? 0) + 1
    seen.set(monster.name, count)
    return count > 1 ? { ...monster, name: `${monster.name} (${count})` } : monster
  })
}

const isBestiary = (data: Monster[]) =>
  Array.isArray(data) &&
  data.length > 0 &&
  data.every((monster) => Array.isArray(monster.stats) && Array.isArray(monster.resistances))

export const useBestiary = () => useJson<Monster[]>('data/bestiary.json', isBestiary)
