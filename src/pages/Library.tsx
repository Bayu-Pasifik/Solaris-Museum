import { useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate, useParams } from 'react-router'
import { categoryTheme, useStories } from '../lib/stories'
import { unique } from '../components/Chips'
import Disclaimer from '../components/Disclaimer'
import SceneBoundary from '../components/SceneBoundary'
import StoryList from '../components/StoryList'
import StoryReader from '../components/StoryReader'
import LibraryScene, { LIBRARY_FOV } from '../three/LibraryScene'

export default function Library() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useStories()
  const [pointing, setPointing] = useState(false)

  const stories = state.status === 'ready' ? state.data : []
  const categories = unique(stories.map((story) => story.category))
  const current = id ? stories.find((story) => story.id === id) : stories[0]
  const shelf = stories.filter((story) => story.category === current?.category)
  const index = shelf.findIndex((story) => story.id === current?.id)
  const theme = categoryTheme(categories, current?.category ?? '')

  const open = (next: string) => {
    setPointing(false)
    navigate(`/library/${next}`)
  }

  return (
    <div
      className="wrap library"
      style={
        {
          '--el-deep': theme.deep,
          '--el-pale': theme.pale,
          '--el-accent': theme.accent,
        } as CSSProperties
      }
    >
      <header>
        <h1>Perpustakaan</h1>
        <p className="lede">
          Arsip cerita Solaris. Pilih panel di ruang arsip, lalu baca naskahnya.
        </p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>{' '}
          <Link to="/glossary" className="pill">
            Glosarium
          </Link>{' '}
          <Link to="/messages" className="pill">
            Pesan
          </Link>
        </p>
      </header>

      <main>
        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data cerita gagal dimuat ({state.message}). Pastikan file data/story.json ada.
          </p>
        )}
        {state.status === 'ready' && !current && <p className="notice">Cerita tidak ditemukan.</p>}

        {current && (
          <>
            <div className={pointing ? 'lobby pointing' : 'lobby'}>
              <SceneBoundary message="Tampilan 3D gagal dimuat.">
                {/* Clicking a panel is a mouse shortcut. The buttons and the list do the same. */}
                <Canvas
                  flat
                  aria-hidden="true"
                  camera={{ position: [0, 1.9, 7], fov: LIBRARY_FOV }}
                  dpr={[1, 2]}
                >
                  {/* A new category gets new panels instead of sliding the old ones. */}
                  <LibraryScene
                    key={current.category}
                    stories={shelf}
                    current={index}
                    theme={theme}
                    onSelect={open}
                    onHover={setPointing}
                  />
                </Canvas>
              </SceneBoundary>
            </div>

            <nav className="shelf" aria-label="Pindah cerita">
              <button
                type="button"
                className="button"
                aria-label="Cerita sebelumnya"
                disabled={index <= 0}
                onClick={() => open(shelf[index - 1].id)}
              >
                ←<span> Sebelumnya</span>
              </button>
              <p role="status">
                <b>{current.name}</b>
                {index + 1} dari {shelf.length}
              </p>
              <button
                type="button"
                className="button"
                aria-label="Cerita berikutnya"
                disabled={index >= shelf.length - 1}
                onClick={() => open(shelf[index + 1].id)}
              >
                <span>Berikutnya </span>→
              </button>
            </nav>
          </>
        )}

        {stories.length > 0 && (
          <div className="hall">
            <StoryList stories={stories} categories={categories} current={current} />
            {current && <StoryReader key={current.id} story={current} />}
          </div>
        )}
      </main>

      <Disclaimer />
    </div>
  )
}
