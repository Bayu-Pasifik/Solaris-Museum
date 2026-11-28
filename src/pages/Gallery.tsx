import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate, useParams } from 'react-router'
import { useGallery } from '../lib/gallery'
import { pieceId, pieceName, pieces, SECTIONS, type Choosable } from '../lib/exhibits'
import { reveal, useInsets } from '../lib/insets'
import { useTitle } from '../lib/title'
import Disclaimer from '../components/Disclaimer'
import GalleryStrip from '../components/GalleryStrip'
import LoadingOverlay from '../components/LoadingOverlay'
import PieceReport from '../components/PieceReport'
import SceneBoundary from '../components/SceneBoundary'
import SearchButton from '../components/SearchButton'
import SoundButton from '../components/SoundButton'
import GalleryScene, { GALLERY_FOV, newScroll, type Scroll } from '../three/GalleryScene'
import { DRAG } from '../three/Frame'

const choosable = (list: ReturnType<typeof pieces>) =>
  list.filter((piece): piece is Choosable => piece.kind !== 'banner')

export default function Gallery() {
  const params = useParams()
  const navigate = useNavigate()
  const state = useGallery()
  const section = SECTIONS.find((item) => item.id === params.section) ?? SECTIONS[0]
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState<string>()
  const [pointing, setPointing] = useState(false)
  const [jump, setJump] = useState<{ key: string }>()
  const { insets, setTop, setBottom, setDrawer } = useInsets()

  const text = query.trim().toLowerCase()
  const data = state.status === 'ready' ? state.data : undefined
  const shown = useMemo(() => (data ? pieces(data, section.id, text) : []), [data, section, text])
  // The drawer and the buttons in it keep to what the search found, if the piece is in it.
  const all = useMemo(
    () => (data ? choosable(pieces(data, section.id, '')) : []),
    [data, section],
  )
  const found = useMemo(() => choosable(shown), [shown])
  const piece = all.find((item) => String(pieceId(item)) === params.item)
  const round = piece && found.some((item) => item.key === piece.key) ? found : all
  const at = piece ? round.findIndex((item) => item.key === piece.key) : -1
  useTitle(piece ? pieceName(piece) : 'Gallery')

  // Every collection and every search starts at the left end of the wall.
  const scroll = useMemo<{ current: Scroll }>(() => ({ current: newScroll() }), [section, text])

  const base = `/gallery/${section.id}`
  const close = useCallback(() => navigate(base), [navigate, base])
  const move = (by: number) => {
    const next = round[(at + by + round.length) % round.length]
    if (next) navigate(`${base}/${pieceId(next)}`)
  }

  // Whatever was pointed at is gone after a move to another collection.
  const settle = () => {
    setHovered(undefined)
    setPointing(false)
    setJump(undefined)
    setQuery('')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (piece) {
        if (event.key === 'Escape') close()
        else if (by) move(by)
      } else if (by) {
        scroll.current.target += by * scroll.current.page * 0.5
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** The wall follows a drag, and slides on a little when it is let go. */
  const grab = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    const place = scroll.current
    const from = event.clientX
    let last = from
    let speed = 0
    const drag = (next: PointerEvent) => {
      const by = next.clientX - last
      last = next.clientX
      speed = by
      // A small shake of the pointer is a click and moves nothing.
      if (Math.abs(next.clientX - from) > DRAG) place.target -= by * place.perPixel
    }
    const drop = () => {
      if (Math.abs(last - from) > DRAG) place.target -= speed * place.perPixel * 10
      window.removeEventListener('pointermove', drag)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', drop)
    }
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', drop)
  }

  /** The wheel moves along the wall instead of down the page. */
  const roll = useCallback(
    (stage: HTMLDivElement | null) => {
      if (!stage) return
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        const by =
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        scroll.current.target += by * scroll.current.perPixel
      }
      stage.addEventListener('wheel', onWheel, { passive: false })
      return () => stage.removeEventListener('wheel', onWheel)
    },
    [scroll],
  )

  const { colors } = section

  return (
    <>
      <main
        className={
          piece ? 'gallery open-hall exhibit-hall reading' : 'gallery open-hall exhibit-hall'
        }
        style={
          {
            '--el-deep': colors.deep,
            '--el-pale': colors.pale,
            '--el-accent': colors.accent,
          } as CSSProperties
        }
      >
        <div
          className={pointing ? 'backdrop sky pointing' : 'backdrop sky'}
          ref={roll}
          onPointerDown={grab}
        >
          {data && (
            <SceneBoundary message="The 3D gallery failed to load.">
              {/* The wall is a shortcut for pointers. The strip below it has the same links. */}
              <Canvas
                flat
                aria-hidden="true"
                camera={{ position: [0, 5, 2], fov: GALLERY_FOV }}
                dpr={[1, 2]}
              >
                <Suspense fallback={null}>
                  <GalleryScene
                    pieces={shown}
                    accent={colors.accent}
                    insets={insets}
                    scroll={scroll}
                    picked={piece?.key}
                    hovered={hovered}
                    jump={jump}
                    onHover={(key) => {
                      setHovered(key)
                      setPointing(key !== undefined)
                    }}
                    onPick={(chosen) => navigate(`${base}/${pieceId(chosen)}`)}
                  />
                </Suspense>
              </Canvas>
              <LoadingOverlay />
            </SceneBoundary>
          )}
        </div>

        <header className="topbar" ref={setTop}>
          <Link to="/" className="pill">
            ← Lobby
          </Link>
          <SearchButton />
          <SoundButton />
          <div className="plate">
            <h1>Gallery</h1>
            <p>{data ? `${all.length} ${section.unit}` : 'Namecard, title, achievement'}</p>
          </div>
          <nav className="switches" aria-label="Collection types">
            <div>
              {SECTIONS.map((item) => (
                <Link
                  key={item.id}
                  to={`/gallery/${item.id}`}
                  className="pill"
                  aria-current={item.id === section.id ? 'page' : undefined}
                  ref={item.id === section.id ? reveal : undefined}
                  onClick={settle}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          {section.id === 'achievement' && (
            <nav className="jumps" aria-label="Achievement categories">
              {shown.map(
                (item) =>
                  item.kind === 'banner' && (
                    <button
                      key={item.key}
                      type="button"
                      className="pill"
                      lang="en"
                      onClick={() => {
                        close()
                        setJump({ key: item.key })
                      }}
                    >
                      {item.category.name}
                    </button>
                  ),
              )}
            </nav>
          )}
        </header>

        {/* The free space between the bars. The hall behind it takes the pointer. */}
        <div className="viewport">
          {state.status === 'loading' && <p className="notice">Loading data…</p>}
          {state.status === 'error' && (
            <p className="notice" role="alert">
              Could not load gallery data ({state.message}). Check that data/gallery.json exists.
            </p>
          )}
          {data && shown.length === 0 && <p className="notice plain">Nothing found.</p>}
          {shown.length > 0 &&
            ([-1, 1] as const).map((by) => (
              <button
                key={by}
                type="button"
                className={by < 0 ? 'pill walk back' : 'pill walk'}
                aria-label={by < 0 ? 'Scroll left' : 'Scroll right'}
                onClick={() => {
                  scroll.current.target += by * scroll.current.page
                }}
              >
                {by < 0 ? '‹' : '›'}
              </button>
            ))}
        </div>

        <div ref={setBottom}>
          <GalleryStrip
            section={section.id}
            unit={section.unit}
            pieces={found}
            picked={piece?.key}
            hovered={hovered}
            onHover={setHovered}
            query={query}
            onQuery={(next) => {
              setJump(undefined)
              setQuery(next)
            }}
          />
          <footer className="gallery-foot">
            <Disclaimer />
          </footer>
        </div>

        {piece && (
          // A new key starts every piece at its top.
          <aside key={piece.key} className="drawer" aria-label="Details" ref={setDrawer}>
            <p className="tools">
              <button type="button" className="pill" onClick={() => move(-1)}>
                ← Previous
              </button>
              <button type="button" className="pill" onClick={() => move(1)}>
                Next →
              </button>
              <button type="button" className="pill close" onClick={close}>
                Close ✕
              </button>
            </p>
            <PieceReport piece={piece} text={text} />
          </aside>
        )}
      </main>
    </>
  )
}
