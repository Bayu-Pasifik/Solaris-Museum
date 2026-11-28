import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl, useJson } from '../lib/characters'
import { useTerms, type Linker } from '../lib/glossary'
import { isStoryText, pagesOf, type Section, type Story, type StoryText } from '../lib/stories'
import { getVisits, keepPlace } from '../lib/visits'
import GameText, { Struck } from './GameText'
import Marks from './Marks'

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

type PagesProps = { story: Story; sections: Section[]; terms: Terms }

/** The dialogue of a story, one page at a time. It opens where the visitor stopped. */
function Pages({ story, sections, terms }: PagesProps) {
  const path = `/library/${story.id}`
  const pages = useMemo(() => pagesOf(sections), [sections])
  // A new import of the story can have fewer pages than the saved place.
  const [resumed] = useState(() => Math.min(getVisits().pages[path] ?? 0, pages.length - 1))
  const [open, setOpen] = useState(resumed)
  const top = useRef<HTMLDivElement>(null)
  const page = useMemo(() => explain(pages[open], terms.link), [pages, open, terms])

  // The controls below a page also bring its start back into view.
  const turn = (index: number) => {
    setOpen(index)
    top.current?.scrollIntoView({ block: 'start' })
  }

  useEffect(() => keepPlace(path, story.name, open), [path, story.name, open])
  useEffect(() => {
    if (resumed > 0) top.current?.scrollIntoView({ block: 'start' })
  }, [resumed])

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
      {resumed > 0 && open === resumed && (
        <p className="resumed" role="status">
          Melanjutkan dari halaman {open + 1} dari {pages.length}.
          <button type="button" className="pill" onClick={() => turn(0)}>
            Baca dari awal
          </button>
        </p>
      )}
      {page.map((section, index) => (
        <section key={`${open} ${index}`}>
          {section.title && <h3 lang="en">{section.title}</h3>}
          {section.lines.map((line, at) => (
            <div key={at} className={line.note ? 'say note' : 'say'}>
              {line.speaker && <b lang="en">{line.speaker}</b>}
              {line.text && <GameText text={line.text} terms={terms.byId} />}
              {line.choices && (
                <ul aria-label="Pilihan jawaban">
                  {line.choices.map((choice, number) => (
                    <li key={number} lang="en">
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
      {open === pages.length - 1 && <Marks path={path} readable />}
    </div>
  )
}

function Script({ story, terms }: { story: Story; terms: Terms }) {
  const state = useJson<StoryText>(`data/story/${story.id}.json`, isStoryText)

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
  return <Pages story={story} sections={state.data.sections} terms={terms} />
}

/** One story: what it is about, then its script. Render it with the story id as key. */
export default function StoryReader({ story }: { story: Story }) {
  const terms = useTerms()
  // The summary explains its own terms; the pages of the script start over.
  const summary = terms.link(story.summary, new Set())

  return (
    <section className="card dossier reader" aria-label={`Cerita ${story.name}`}>
      <h2 lang="en">{story.name}</h2>
      <p className="how" lang="en">
        {story.category} · {story.group}
        {story.subtitle && story.subtitle !== story.group && ` · ${story.subtitle}`}
      </p>
      <Marks path={`/library/${story.id}`} readable />

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

      <Script story={story} terms={terms} />
    </section>
  )
}
