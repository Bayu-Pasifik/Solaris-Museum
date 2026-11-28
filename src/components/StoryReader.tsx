import { useMemo, useRef, useState } from 'react'
import { assetUrl, useJson } from '../lib/characters'
import { useTerms, type Linker } from '../lib/glossary'
import { isStoryText, pagesOf, type Section, type Story, type StoryText } from '../lib/stories'
import GameText, { Struck } from './GameText'

type Terms = ReturnType<typeof useTerms>

/** A page with the first mention of every term marked. */
function explain(page: Section[], link: Linker) {
  const seen = new Set<number>()
  return page.map((section) => ({
    ...section,
    lines: section.lines.map((line) => ({
      ...line,
      text: link(line.text, seen),
      choices: line.choices?.map((choice) => link(choice, seen)),
    })),
  }))
}

/** The dialogue of a story, one page at a time. */
function Pages({ sections, terms }: { sections: Section[]; terms: Terms }) {
  const pages = useMemo(() => pagesOf(sections), [sections])
  const [open, setOpen] = useState(0)
  const top = useRef<HTMLDivElement>(null)
  const page = useMemo(() => explain(pages[open], terms.link), [pages, open, terms])

  // The controls below a page also bring its start back into view.
  const turn = (index: number) => {
    setOpen(index)
    top.current?.scrollIntoView({ block: 'start' })
  }

  const nav = (
    <nav className="turn" aria-label="Pindah halaman">
      <button type="button" className="pill" disabled={open === 0} onClick={() => turn(open - 1)}>
        ← Sebelumnya
      </button>
      <label>
        Halaman{' '}
        <select value={open} onChange={(event) => turn(Number(event.target.value))}>
          {pages.map((_, index) => (
            <option key={index} value={index}>
              {index + 1}
            </option>
          ))}
        </select>{' '}
        dari {pages.length}
      </label>
      <button
        type="button"
        className="pill"
        disabled={open === pages.length - 1}
        onClick={() => turn(open + 1)}
      >
        Berikutnya →
      </button>
    </nav>
  )

  return (
    <div className="panel script" ref={top}>
      {page.map((section, index) => (
        <section key={`${open} ${index}`}>
          {section.title && <h3>{section.title}</h3>}
          {section.lines.map((line, at) => (
            <div key={at} className={line.note ? 'say note' : 'say'}>
              {line.speaker && <b>{line.speaker}</b>}
              {line.text && <GameText text={line.text} terms={terms.byId} />}
              {line.choices && (
                <ul aria-label="Pilihan jawaban">
                  {line.choices.map((choice, number) => (
                    <li key={number}>
                      <Struck terms={terms.byId}>{choice}</Struck>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
      {pages.length > 1 && nav}
    </div>
  )
}

function Script({ id, terms }: { id: string; terms: Terms }) {
  const state = useJson<StoryText>(`data/story/${id}.json`, isStoryText)

  if (state.status === 'loading') return <p className="notice">Memuat cerita…</p>
  if (state.status === 'error') {
    return (
      <p className="notice" role="alert">
        Naskah cerita ini belum tersedia.
      </p>
    )
  }
  if (state.data.sections.length === 0) {
    return <p className="notice">Arsip ini tidak memiliki naskah dialog.</p>
  }
  return <Pages sections={state.data.sections} terms={terms} />
}

/** One story: what it is about, then its script. Render it with the story id as key. */
export default function StoryReader({ story }: { story: Story }) {
  const terms = useTerms()
  // The summary explains its own terms; the pages of the script start over.
  const summary = terms.link(story.summary, new Set())

  return (
    <section className="card dossier reader" aria-label={`Cerita ${story.name}`}>
      <h2>{story.name}</h2>
      <p className="how">
        {story.category} · {story.group}
        {story.subtitle && story.subtitle !== story.group && ` · ${story.subtitle}`}
      </p>

      {(story.picture || story.summary) && (
        <div className="panel">
          {story.picture && (
            <img
              src={assetUrl(story.picture)}
              alt=""
              onError={(event) => (event.currentTarget.hidden = true)}
            />
          )}
          <GameText text={summary} terms={terms.byId} />
        </div>
      )}

      <Script id={story.id} terms={terms} />
    </section>
  )
}
