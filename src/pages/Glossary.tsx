import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useGlossary, type Term } from '../lib/glossary'
import type { SakugaInput } from '../lib/sakuga'
import Disclaimer from '../components/Disclaimer'
import GameText from '../components/GameText'

/** Names that start with a digit or a quote stand under "#". */
const letterOf = (term: Term) => term.name.match(/^[A-Z]/i)?.[0].toUpperCase() ?? '#'

export default function Glossary() {
  const state = useGlossary()
  const [query, setQuery] = useState('')

  const search = useCallback((element: SakugaInput | null) => {
    if (!element) return
    const onInput = () => setQuery(element.value)
    element.addEventListener('input', onInput)
    return () => element.removeEventListener('input', onInput)
  }, [])

  const terms = state.status === 'ready' ? state.data : []
  const text = query.trim().toLowerCase()
  // A match in the name comes before a match in the explanation only.
  const matches = text
    ? [
        ...terms.filter((term) => term.name.toLowerCase().includes(text)),
        ...terms.filter(
          (term) =>
            !term.name.toLowerCase().includes(text) && term.text.toLowerCase().includes(text),
        ),
      ]
    : terms
  const groups = new Map<string, Term[]>()
  for (const term of matches) {
    const key = text ? 'Hasil' : letterOf(term)
    groups.set(key, [...(groups.get(key) ?? []), term])
  }

  return (
    <div className="wrap glossary">
      <header>
        <h1>Glosarium</h1>
        <p className="lede">Istilah Solaris dan penjelasannya.</p>
        <p className="links">
          <Link to="/library" className="pill">
            ← Perpustakaan
          </Link>
        </p>
      </header>

      <main>
        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Glosarium gagal dimuat ({state.message}). Pastikan file data/glossary.json ada.
          </p>
        )}
        {state.status === 'ready' && (
          <section className="card dossier">
            <sakuga-input type="search" placeholder="Cari istilah" label="Cari istilah" ref={search} />
            <p className="count" role="status">
              {matches.length} dari {terms.length} istilah
            </p>
            {[...groups].map(([letter, items]) => (
              <section key={letter}>
                <h2>{letter}</h2>
                <dl>
                  {items.map((term) => (
                    <div key={term.id} className="panel">
                      <dt>{term.name}</dt>
                      <dd>
                        <GameText text={term.text} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            {matches.length === 0 && <p>Tidak ditemukan.</p>}
          </section>
        )}
      </main>

      <Disclaimer />
    </div>
  )
}
