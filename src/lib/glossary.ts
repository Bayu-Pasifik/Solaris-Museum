import { useMemo } from 'react'
import { useJson } from './characters'

/** One entry of public/data/glossary.json, written by scripts/add-glossary.mjs. */
export type Term = { id: number; name: string; text: string }

export const useGlossary = () => useJson<Term[]>('data/glossary.json', Array.isArray)

/** Many terms explain how to fight and say nothing about the story. */
const COMBAT =
  /\bDMG\b|\bstacks?\b|\bcan hold up to\b|\bBasic Attack\b|\bEchoes (with|include)\b|^Exchange:/i

/** Names that the texts mostly use as ordinary words. */
const ORDINARY = new Set(
  (
    'Bank Beyond Celestial Channel Core Exchange Glory Greatsword Hunt Kill Melody Play ' +
    'Reflection Remove Team'
  ).split(' '),
)

const isStoryTerm = ({ id, name, text }: Term) =>
  // Below 200000 are the mechanics of one character, 852000 and 853xxx belong to game modes.
  id >= 200000 && id !== 852000 && Math.floor(id / 1000) !== 853 &&
  !ORDINARY.has(name) &&
  !COMBAT.test(text)

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Wraps the first mention of every term in <t=id>…</t>, which GameText shows with its
 * explanation. Texts that share the set "seen" explain a term only once between them.
 */
export type Linker = (text: string, seen: Set<number>) => string

function linkerOf(terms: Term[]): Linker {
  const byName = new Map<string, number>()
  // A few names have two explanations; the first one is used.
  for (const term of terms.filter(isStoryTerm)) {
    if (!byName.has(term.name)) byName.set(term.name, term.id)
  }
  if (byName.size === 0) return (text) => text

  // The longest name wins, as in "Magistrate of Jinzhou". A plural is the same term.
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape)
  const pattern = new RegExp(`(?<![\\w-])(${names.join('|')})(?:es|s)?(?![\\w-])`, 'g')

  return (text, seen) =>
    text.replace(pattern, (word, name: string) => {
      const id = byName.get(name)!
      if (seen.has(id)) return word
      seen.add(id)
      return `<t=${id}>${word}</t>`
    })
}

/** The terms by id and the linker. Both stay empty when the glossary is not there. */
export function useTerms() {
  const state = useGlossary()
  const terms = state.status === 'ready' ? state.data : undefined
  return useMemo(
    () => ({
      byId: new Map(terms?.map((term) => [term.id, term])),
      link: linkerOf(terms ?? []),
    }),
    [terms],
  )
}
