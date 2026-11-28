import { useState } from 'react'
import type { Character } from './characters'
import { canWalk, loadChoice, saveChoice, type Mode } from './roam'
import { getVisits } from './visits'

/** Picks the walker of a visitor who chose none, the same one until the page is closed. */
const walkerRoll = Math.random()

/**
 * How the visitor looks around, and who walks for them. One choice holds for every room that
 * can be walked through.
 */
export function useWalkChoice(characters: Character[]) {
  const [choice, setChoice] = useState(loadChoice)
  const [startFavorites] = useState(() => getVisits().favorites)
  const walkers = characters.filter((character) => canWalk(character.id))
  // The chosen walker, or else a favorite one, or else one by chance.
  const hero =
    walkers.find((character) => character.id === choice.hero) ??
    walkers.find((character) => startFavorites.includes(`/resonator/${character.id}`)) ??
    walkers[Math.floor(walkerRoll * walkers.length)]

  const choose = (next: { mode?: Mode; hero?: string }) => {
    const chosen = { ...choice, ...next }
    setChoice(chosen)
    saveChoice(chosen)
  }

  return { mode: choice.mode, hero, walkers, choose }
}

export type WalkChoice = ReturnType<typeof useWalkChoice>
