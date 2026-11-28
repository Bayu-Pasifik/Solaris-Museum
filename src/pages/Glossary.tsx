import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useGlossary, type Term } from '../lib/glossary'
import { reveal } from '../lib/insets'
import { categoryTheme } from '../lib/stories'
import { unique } from '../components/Chips'
import GameText from '../components/GameText'
import RingHall from '../components/RingHall'
import RingStrip from '../components/RingStrip'
import GlossaryScene from '../three/GlossaryScene'

/** Names that start with a digit or a quote stand under "#". */
const letterOf = (term: Term) => term.name.match(/^[A-Z]/i)?.[0].toUpperCase() ?? '#'

const NONE: Term[] = []

export default function Glossary() {
  const { id } = useParams()
  const state = useGlossary()
  const [query, setQuery] = useState('')

  const terms = state.status === 'ready' ? state.data : NONE
  const letters = unique(terms.map(letterOf)).sort()
  const current = id
    ? terms.find((term) => String(term.id) === id)
    : (terms.find((term) => letterOf(term) === 'A') ?? terms[0])
  const letter = current ? letterOf(current) : ''
  const shelf = terms.filter((term) => letterOf(term) === letter)
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

  return (
    <RingHall
      name="star-hall"
      theme={theme}
      base="/glossary"
      back={{ to: '/library', label: 'Perpustakaan' }}
      title="Glosarium"
      subtitle={current ? `${terms.length} istilah Solaris` : 'Istilah Solaris'}
      switches={{
        label: 'Huruf',
        children: letters.map((item) => {
          const first = terms.find((term) => letterOf(term) === item)!
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
      noun="Istilah"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Memuat data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Glosarium gagal dimuat ({state.message}). Pastikan file data/glossary.json ada.
          </p>
        ) : (
          !current && <p className="notice">Istilah tidak ditemukan.</p>
        )
      }
      caption={
        current && {
          title: current.name,
          detail: `Huruf ${letter} · ${index + 1} dari ${shelf.length}`,
          action: 'Baca arti',
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
          label="Daftar istilah"
          search="Cari istilah"
          base="/glossary"
          entries={matches.map((term) => ({
            id: String(term.id),
            title: term.name,
            detail: term.text.replace(/<\/?s>/g, ''),
          }))}
          current={current && String(current.id)}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} dari ${terms.length} istilah`}
          list={text || letter}
          hint="Seret atau gulir untuk menyusuri · klik panel untuk membaca"
        />
      )}
      report={
        current && (
          <section className="card dossier term-report" aria-label={`Istilah ${current.name}`}>
            <h2>{current.name}</h2>
            <GameText text={current.text} />
          </section>
        )
      }
      reportLabel="Arti istilah"
    />
  )
}
