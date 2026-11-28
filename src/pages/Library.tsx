import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { reveal, useInsets } from '../lib/insets'
import { categoryTheme, useStories } from '../lib/stories'
import { unique } from '../components/Chips'
import Disclaimer from '../components/Disclaimer'
import LoadingOverlay from '../components/LoadingOverlay'
import SceneBoundary from '../components/SceneBoundary'
import StoryReader from '../components/StoryReader'
import StoryStrip from '../components/StoryStrip'
import LibraryScene, { LIBRARY_FOV } from '../three/LibraryScene'

/** Pixels at the foot of the hall that the name of the chosen story covers. */
const CAPTION = 80

/** Pixels of a drag, or of a turn of the wheel, that bring the next story to the middle. */
const STRIDE = 130

export default function Library() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const state = useStories()
  const [query, setQuery] = useState('')
  const [pointing, setPointing] = useState(false)
  const { insets, setTop, setBottom, setDrawer } = useInsets()

  const stories = state.status === 'ready' ? state.data : []
  const categories = unique(stories.map((story) => story.category))
  const current = id ? stories.find((story) => story.id === id) : stories[0]
  const shelf = stories.filter((story) => story.category === current?.category)
  const index = shelf.findIndex((story) => story.id === current?.id)
  const theme = categoryTheme(categories, current?.category ?? '')
  // The address says whether the reader is open, so the back button closes it.
  const reading = Boolean(current) && search.has('baca')

  const open = (next: string, read = reading) => {
    setPointing(false)
    navigate(`/library/${next}${read ? '?baca' : ''}`, { replace: next !== current?.id })
  }
  const close = () => current && navigate(`/library/${current.id}`, { replace: true })

  const move = (by: number) => {
    const next = shelf[index + by]
    if (next) open(next.id)
  }
  // The listeners of a drag and of the wheel live longer than one story, so they read the
  // newest "move" from here.
  const latest = useRef(move)
  useEffect(() => {
    latest.current = move
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const field = event.target
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) return
      if (reading && event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** A swipe to the left brings the next story; the other way brings the one before. */
  const grab = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    let from = event.clientX
    const drag = (next: PointerEvent) => {
      if (Math.abs(next.clientX - from) < STRIDE) return
      latest.current(next.clientX < from ? 1 : -1)
      from = next.clientX
    }
    const drop = () => {
      window.removeEventListener('pointermove', drag)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', drop)
    }
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', drop)
  }

  /** The wheel walks along the stories instead of down the page. */
  const roll = useCallback((stage: HTMLDivElement | null) => {
    if (!stage) return
    let walked = 0
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      walked += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (Math.abs(walked) < STRIDE / 2) return
      latest.current(Math.sign(walked))
      walked = 0
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <main
      className={
        reading ? 'gallery open-hall archive-hall reading' : 'gallery open-hall archive-hall'
      }
      style={
        {
          '--el-deep': theme.deep,
          '--el-pale': theme.pale,
          '--el-accent': theme.accent,
        } as CSSProperties
      }
    >
      <div
        className={pointing ? 'backdrop sky pointing' : 'backdrop sky'}
        ref={roll}
        onPointerDown={grab}
      >
        <SceneBoundary message="Tampilan 3D gagal dimuat.">
          {/* Clicking a panel is a mouse shortcut. The strip and the buttons do the same. */}
          <Canvas
            flat
            aria-hidden="true"
            camera={{ position: [0, 2.5, 9], fov: LIBRARY_FOV }}
            dpr={[1, 2]}
          >
            <LibraryScene
              stories={shelf}
              current={index}
              theme={theme}
              insets={reading ? insets : { ...insets, bottom: insets.bottom + CAPTION }}
              onSelect={(next) => open(next, reading || next === current?.id)}
              onHover={setPointing}
            />
          </Canvas>
          <LoadingOverlay />
        </SceneBoundary>
      </div>

      <header className="topbar" ref={setTop}>
        <Link to="/" className="pill">
          ← Lobby
        </Link>
        <div className="plate">
          <h1>Perpustakaan</h1>
          <p>{current ? `${shelf.length} cerita · ${current.category}` : 'Arsip cerita'}</p>
        </div>
        <Link to="/glossary" className="pill">
          Glosarium
        </Link>
        <Link to="/messages" className="pill">
          Pesan
        </Link>
        <nav className="switches" aria-label="Kategori">
          <div>
            {categories.map((category) => {
              const first = stories.find((story) => story.category === category)!
              const chosen = category === current?.category
              return (
                <Link
                  key={category}
                  to={`/library/${first.id}`}
                  className="pill"
                  aria-current={chosen ? 'page' : undefined}
                  ref={chosen ? reveal : undefined}
                  onClick={() => setQuery('')}
                >
                  {category}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>

      {/* The free space between the bars. The hall behind it takes the pointer. */}
      <div className="viewport">
        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data cerita gagal dimuat ({state.message}). Pastikan file data/story.json ada.
          </p>
        )}
        {state.status === 'ready' && !current && <p className="notice">Cerita tidak ditemukan.</p>}
        {current &&
          ([-1, 1] as const).map((by) => (
            <button
              key={by}
              type="button"
              className={by < 0 ? 'pill walk back' : 'pill walk'}
              aria-label={by < 0 ? 'Cerita sebelumnya' : 'Cerita berikutnya'}
              disabled={!shelf[index + by]}
              onClick={() => move(by)}
            >
              {by < 0 ? '‹' : '›'}
            </button>
          ))}
        {current && !reading && (
          <div className="caption">
            <p role="status">
              <b>{current.name}</b>
              {current.group} · {index + 1} dari {shelf.length}
            </p>
            <button type="button" className="button" onClick={() => open(current.id, true)}>
              Baca cerita
            </button>
          </div>
        )}
      </div>

      <div ref={setBottom}>
        <StoryStrip
          stories={stories}
          current={current}
          query={query}
          onQuery={setQuery}
          // The search stays open, so another result is one click away.
          onPick={() => setPointing(false)}
          onChapter={(next) => open(next)}
        />
        <footer className="gallery-foot">
          <Disclaimer />
        </footer>
      </div>

      {current && reading && (
        // A new key starts every story at its top.
        <aside key={current.id} className="drawer" aria-label="Naskah" ref={setDrawer}>
          <p className="tools">
            <button type="button" className="pill" disabled={index <= 0} onClick={() => move(-1)}>
              ← Sebelumnya
            </button>
            <button
              type="button"
              className="pill"
              disabled={index >= shelf.length - 1}
              onClick={() => move(1)}
            >
              Berikutnya →
            </button>
            <button type="button" className="pill close" onClick={close}>
              Tutup ✕
            </button>
          </p>
          <StoryReader story={current} />
        </aside>
      )}
    </main>
  )
}
