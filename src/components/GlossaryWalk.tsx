import { useMemo } from 'react'
import type { ElementTheme } from '../lib/elements'
import type { Term } from '../lib/glossary'
import { bind, entriesOf, LETTERS, spotAtCard, spotAtSpread, type Entry } from '../lib/popup'
import { categoryTheme } from '../lib/stories'
import { useTitle } from '../lib/title'
import type { WalkChoice } from '../lib/walkChoice'
import PopupScene from '../three/PopupScene'
import GameText from './GameText'
import WingWalk, { type Hall, type HallProps } from './WingWalk'

type Props = {
  terms: Term[]
  /** The term from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Glossary that is walked through: a pop-up dictionary with a spread for every few terms. */
export default function GlossaryWalk({ terms, currentId, walk }: Props) {
  const entries = useMemo(() => entriesOf(terms), [terms])
  useTitle(entries.find((entry) => entry.id === currentId)?.name ?? 'Glossary')

  const hall = useMemo<Hall<Entry>>(() => {
    // The letters have the same colors as in the ring.
    const letters = [...new Set(entries.map((entry) => entry.letter))]
    const themeOf = (letter: string): ElementTheme => categoryTheme(letters, letter)
    const opening = bind(entries).spreads.findIndex((spread) => spread.letter === 'A')
    return {
      theme: (entry) => themeOf(entry.letter),
      note: (entry) => `Letter ${entry.letter}`,
      spot: (index, third, list) => spotAtCard(list, index, third),
      // The strip has no rows here: every term is its own.
      rowOf: (index) => index,
      rowStart: (row) => row,
      jump: (index, list) => spotAtSpread(bind(list).of[index]),
      start: spotAtSpread(Math.max(opening, 0)),
      Scene: function Book(props: HallProps<Entry>) {
        return <PopupScene {...props} themeOf={themeOf} />
      },
    }
  }, [entries])

  return (
    <WingWalk
      title="Glossary"
      base="/glossary"
      noun={['term', 'terms']}
      items={entries}
      wingOf={(entry) => entry.letter}
      order={LETTERS}
      hall={hall}
      currentId={currentId}
      walk={walk}
      still="Ring"
      report={({ name, term }) => (
        <section className="card dossier term-report" aria-label={`Term ${name}`}>
          <h2 lang="en">{name}</h2>
          <GameText text={term.text} />
        </section>
      )}
    />
  )
}
