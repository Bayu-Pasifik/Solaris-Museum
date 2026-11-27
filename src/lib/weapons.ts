import { useJson } from './characters'
import type { ElementTheme } from './elements'

export type Weapon = {
  id: string
  name: string
  type: string
  rarity: number
  /** Path inside public/, for example "models/weapons/lustrous-razor.glb". */
  model: string
  /** The model in the size and place that it has in the hand. Absent in older lists. */
  held?: string
  description: string
  /** The value at the first and at the last level. */
  stats: { name: string; min: string; max: string }[]
  skill: { name: string; description: string }
}

export const useWeapons = () => useJson<Weapon[]>('data/weapons.json', Array.isArray)

/** Weapons have no element, so the stage takes the colors of the rarity. */
const themes: Record<number, ElementTheme> = {
  5: { deep: '#a86a00', pale: '#fff3c4', accent: '#ffc21c' },
  4: { deep: '#5b2aa8', pale: '#ecdcff', accent: '#b47aff' },
  3: { deep: '#1f63c4', pale: '#d8f0ff', accent: '#4fb3ff' },
  2: { deep: '#1c7a4c', pale: '#dcf8e6', accent: '#45d38a' },
  1: { deep: '#55527a', pale: '#eeedf7', accent: '#a9a6c8' },
}

export const rarityTheme = (rarity: number) => themes[rarity] ?? themes[1]
