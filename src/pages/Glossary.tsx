import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCharacters } from '../lib/characters'
import { useGlossary, type Term } from '../lib/glossary'
import { reveal } from '../lib/insets'
import { letterOf } from '../lib/popup'
import { categoryTheme } from '../lib/stories'
import { useTitle } from '../lib/title'
import { useWalkChoice } from '../lib/walkChoice'
import { unique } from '../components/Chips'
import GameText from '../components/GameText'
import GlossaryWalk from '../components/GlossaryWalk'
import ModeSwitch from '../components/ModeSwitch'
import RingHall from '../components/RingHall'
import RingStrip from '../components/RingStrip'
import GlossaryScene from '../three/GlossaryScene'

const NONE: Term[] = []

export default function Glossary() {
  const { id } = useParams()
  const state = useGlossary()
  const [query, setQuery] = useState('')
  const characters = useCharacters()
  const walk = useWalkChoice(characters.status === 'ready' ? characters.data : [])
  const walking = walk.mode !== 'tour' && state.status !== 'error'

  const terms = state.status === 'ready' ? state.data : NONE
  const letters = unique(terms.map((term) => letterOf(term.name))).sort()
  const current = id
    ? terms.find((term) => String(term.id) === id)
    : (terms.find((term) => letterOf(term.name) === 'A') ?? terms[0])
  useTitle((id && current?.name) || 'Glossary')
  const letter = current ? letterOf(current.name) : ''
  const shelf = terms.filter((term) => letterOf(term.name) === letter)
  const index = shelf.findIndex((term) => term.id === current?.id)
  const theme = categoryTheme(letters, letter)

  const text = query.trim().toLowerCase()
  const named = (term: Term) => term.name.toLowerCase().includes(text)
  // A match in the name comes before a match in the explanation only.
  const matches = text
    ? [
        ...terms.filter(named),
        ...terms.filter((term) => !named(term) && term.text.toLowerCase().includes(text)),
      ]
    : shelf

  if (walking) {
    if (state.status === 'loading') return <p className="notice">Loading data…</p>
    return <GlossaryWalk terms={terms} currentId={id} walk={walk} />
  }

  return (
    <RingHall
      name="star-hall"
      theme={theme}
      base="/glossary"
      back={{ to: '/', label: 'Lobby' }}
      title="Glossary"
      subtitle={current ? `${terms.length} Solaris terms` : 'Terms of Solaris'}
      links={<ModeSwitch walk={walk} onChoose={walk.choose} still="Ring" />}
      switches={{
        label: 'Letter',
        children: letters.map((item) => {
          const first = terms.find((term) => letterOf(term.name) === item)!
          return (
            <Link
              key={item}
              to={`/glossary/${first.id}`}
              className="pill"
              aria-current={item === letter ? 'page' : undefined}
              ref={item === letter ? reveal : undefined}
              onClick={() => setQuery('')}
            >
              {item}
            </Link>
          )
        }),
      }}
      ids={shelf.map((term) => String(term.id))}
      current={current && String(current.id)}
      noun="Term"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Loading data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Could not load the glossary ({state.message}). Check that data/glossary.json exists.
          </p>
        ) : (
          !current && <p className="notice">Term not found.</p>
        )
      }
      caption={
        current && {
          title: current.name,
          detail: `Letter ${letter} · ${index + 1} of ${shelf.length}`,
          action: 'Read definition',
        }
      }
      scene={(stage) => (
        <GlossaryScene
          {...stage}
          terms={shelf}
          current={index}
          letter={letter}
          theme={theme}
        />
      )}
      strip={(pick) => (
        <RingStrip
          label="Term list"
          search="Search terms"
          base="/glossary"
          entries={matches.map((term) => ({
            id: String(term.id),
            title: term.name,
            detail: <bdi lang="en">{term.text.replace(/<\/?s>/g, '')}</bdi>,
          }))}
          current={current && String(current.id)}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} of ${terms.length} terms`}
          list={text || letter}
          hint="Drag or scroll to browse · click a panel to read"
        />
      )}
      report={
        current && (
          <section className="card dossier term-report" aria-label={`Term ${current.name}`}>
            <h2 lang="en">{current.name}</h2>
            <GameText text={current.text} />
          </section>
        )
      }
      reportLabel="Definition"
    />
  )
}
