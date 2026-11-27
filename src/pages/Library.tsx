import { useRef, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { useCharacters, useJson, type Character } from '../lib/characters'
import { themeOf } from '../lib/elements'
import { isProfile, type Profile } from '../lib/profiles'
import { pop } from '../lib/sakuga'
import Disclaimer from '../components/Disclaimer'
import GameText from '../components/GameText'
import Roster from '../components/Roster'

/** The stories of one character, one chapter at a time. */
function Chapters({ stories }: { stories: Profile['stories'] }) {
  const [open, setOpen] = useState(0)
  const top = useRef<HTMLDivElement>(null)
  const story = stories[open]

  if (!story) return <p className="notice">Belum ada cerita untuk karakter ini.</p>

  // The buttons below a chapter also bring its start back into view.
  const turn = (index: number) => {
    setOpen(index)
    top.current?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="panel" ref={top}>
      <div className="chapters" role="group" aria-label="Daftar bab">
        {stories.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className="pill"
            aria-pressed={index === open}
            onClick={(event) => {
              pop(event.currentTarget)
              setOpen(index)
            }}
          >
            <b>{index + 1}</b>
            {item.title}
          </button>
        ))}
      </div>

      <article>
        <h3>{story.title}</h3>
        <GameText key={open} text={story.text} />
      </article>

      <nav className="turn" aria-label="Pindah bab">
        <button type="button" className="pill" disabled={open === 0} onClick={() => turn(open - 1)}>
          ← Sebelumnya
        </button>
        <span>
          Bab {open + 1} dari {stories.length}
        </span>
        <button
          type="button"
          className="pill"
          disabled={open === stories.length - 1}
          onClick={() => turn(open + 1)}
        >
          Berikutnya →
        </button>
      </nav>
    </div>
  )
}

/** The open book of one character. Render it with the character id as key. */
function Book({ character }: { character: Character }) {
  const state = useJson<Profile>(`data/profiles/${character.id}.json`, isProfile)
  const theme = themeOf(character.element)

  return (
    <section
      className="card book"
      aria-label={`Cerita ${character.name}`}
      style={
        {
          '--el-deep': theme.deep,
          '--el-pale': theme.pale,
          '--el-accent': theme.accent,
        } as CSSProperties
      }
    >
      <h2>{character.name}</h2>
      <p className="how">
        {character.element} · {character.weapon}
      </p>

      {state.status === 'loading' && <p className="notice">Memuat cerita…</p>}
      {state.status === 'error' && (
        <p className="notice" role="alert">
          Cerita karakter ini belum tersedia.
        </p>
      )}
      {state.status === 'ready' && <Chapters stories={state.data.stories} />}
    </section>
  )
}

export default function Library() {
  const { id } = useParams()
  const state = useCharacters()

  const characters = state.status === 'ready' ? state.data : []
  const current = id ? characters.find((item) => item.id === id) : characters[0]

  return (
    <div className="wrap">
      <header>
        <h1>Perpustakaan</h1>
        <p className="lede">
          Arsip cerita Resonator. Pilih karakter, lalu baca ceritanya bab demi bab.
        </p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
        </p>
      </header>

      <main className="hall">
        <Roster characters={characters} currentId={current?.id} base="/library" />

        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data karakter gagal dimuat ({state.message}). Pastikan file data/characters.json ada.
          </p>
        )}
        {state.status === 'ready' && !current && (
          <p className="notice">Karakter tidak ditemukan.</p>
        )}
        {current && <Book key={current.id} character={current} />}
      </main>

      <Disclaimer />
    </div>
  )
}
