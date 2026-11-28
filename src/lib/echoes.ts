import { useJson } from './characters'

/** The effect that a Sonata set gives from this number of echoes on. */
export type SonataSet = {
  id: number
  name: string
  /** Path inside public/. */
  icon?: string
  effects: { pieces: number; text: string }[]
}

export type Echo = {
  id: number
  name: string
  /** "Common", "Elite", "Overlord" or "Calamity". */
  rank: string
  /** 1, 3 or 4. */
  cost: number
  element: string
  /** "echo" and "phantom" are in the collection of the game; "other" belong to game modes. */
  kind: 'echo' | 'phantom' | 'other'
  /** Path inside public/. */
  icon?: string
  /** Ids of the Sonata sets that the echo can have. */
  sets: number[]
  skill: { icon?: string; text: string }
  /** Id of the Bestiary monster that lends its 3D model. Not every echo has one. */
  monster?: number
}

export type EchoArchive = { sets: SonataSet[]; echoes: Echo[] }

export const KINDS: { id: Echo['kind']; label: string }[] = [
  { id: 'echo', label: 'Echo' },
  { id: 'phantom', label: 'Phantom' },
  { id: 'other', label: 'Other modes' },
]

/**
 * The highest cost first, then in the order of the game. The game has several echoes of one
 * name, so within a kind those get a number.
 */
export function ordered(echoes: Echo[]) {
  const sorted = [...echoes].sort((a, b) => b.cost - a.cost || a.id - b.id)
  const seen = new Map<string, number>()
  return sorted.map((echo) => {
    const key = `${echo.kind} ${echo.name}`
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return count > 1 ? { ...echo, name: `${echo.name} (${count})` } : echo
  })
}

const isArchive = (data: EchoArchive) =>
  Array.isArray(data?.sets) && Array.isArray(data?.echoes) && data.echoes.length > 0

export const useEchoes = () => useJson<EchoArchive>('data/echo.json', isArchive)
