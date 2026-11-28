import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate } from 'react-router'
import { assetUrl, useCharacters } from '../lib/characters'
import { clampStop, type Walk } from '../lib/corridor'
import { reveal, useInsets } from '../lib/insets'
import { rooms } from '../lib/rooms'
import { impact } from '../lib/sakuga'
import { openSearch } from '../lib/search'
import { useVisits } from '../lib/visits'
import { wheel } from '../lib/wheel'
import LobbyScene, { LOBBY_FOV } from '../three/LobbyScene'
import SceneBoundary from '../components/SceneBoundary'
import LoadingOverlay from '../components/LoadingOverlay'
import SearchButton from '../components/SearchButton'
import Disclaimer from '../components/Disclaimer'

const GREETINGS = [
  'Selamat datang di Solaris Museum!',
  'Halo! Koleksi Resonator ada di balik portal ini.',
  'Kamu datang juga. Ayo, masuk lewat portal ini.',
  'Hai! Mau lihat-lihat? Aku tunggu di dalam.',
]

/** Pixels of a drag that walk from one door to the next. */
const STRIDE = 220

/** The door where the visitor left, so coming back from a room starts there. */
let lastStop = 0

export default function Lobby() {
  const navigate = useNavigate()
  const timer = useRef<number>(undefined)
  const rest = useRef<number>(undefined)
  const viewport = useRef<HTMLDivElement>(null)
  const walk = useRef<Walk>({ target: lastStop })
  const [stop, setStop] = useState(lastStop)
  const [hovered, setHovered] = useState<string>()
  const [entering, setEntering] = useState<string>()
  const [arrived, setArrived] = useState(false)
  const onArrive = useCallback(() => setArrived(true), [])
  const { insets, setTop, setBottom } = useInsets()

  // One roll per visit decides who greets and what they say.
  const [roll] = useState(() => [Math.random(), Math.random()])
  const state = useCharacters()
  const favorites = useVisits((visits) => visits.favorites.length)
  // The story that was read last, as long as it is not finished.
  const unfinished = useVisits((visits) =>
    visits.last && !visits.read.includes(visits.last.path) ? visits.last : undefined,
  )
  const characters = state.status === 'ready' ? state.data : []
  const greeter = characters[Math.floor(roll[0] * characters.length)]
  const greeting = GREETINGS[Math.floor(roll[1] * GREETINGS.length)]

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(rest.current)
    },
    [],
  )

  /** Walks to a place in the corridor, counted in doors. */
  const go = useCallback((to: number) => {
    window.clearTimeout(rest.current)
    walk.current.target = clampStop(to, rooms)
    lastStop = Math.round(walk.current.target)
    setStop(lastStop)
  }, [])
  /** A moment after a scroll or a drag, the visitor comes to stand at the nearest door. */
  const settle = useCallback(() => {
    window.clearTimeout(rest.current)
    rest.current = window.setTimeout(() => go(Math.round(walk.current.target)), 220)
  }, [go])

  // Wait a moment before leaving, so the hit and the walk into the portal can be seen.
  const enter = (path: string) => {
    lastStop = Math.max(
      rooms.findIndex((room) => room.path === path),
      0,
    )
    setEntering(path)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => navigate(path), window.SakugaFX?.calm ? 0 : 500)
  }

  // A click on a portal or a card also gets the big hit, where it was clicked.
  const select = (path: string, pointer: { x: number; y: number }) => {
    const element = viewport.current
    if (element) {
      const box = element.getBoundingClientRect()
      impact(element, (pointer.x - box.left) / box.width, (pointer.y - box.top) / box.height)
    }
    enter(path)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const forward = event.key === 'ArrowUp' || event.key === 'ArrowRight'
      const back = event.key === 'ArrowDown' || event.key === 'ArrowLeft'
      if (!forward && !back) return
      event.preventDefault()
      go(Math.round(walk.current.target) + (forward ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  /** The wheel walks along the corridor instead of down the page. */
  const stroll = useCallback(
    (stage: HTMLDivElement | null) => {
      if (!stage) return
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        const by = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        go(walk.current.target + by / (STRIDE * 2))
        settle()
      }
      stage.addEventListener('wheel', onWheel, { passive: false })
      return () => stage.removeEventListener('wheel', onWheel)
    },
    [go, settle],
  )

  /** A swipe up or to the left walks on; the other way walks back. */
  const grab = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    let x = event.clientX
    let y = event.clientY
    const drag = (next: PointerEvent) => {
      go(walk.current.target + (y - next.clientY + x - next.clientX) / STRIDE)
      x = next.clientX
      y = next.clientY
    }
    const drop = () => {
      settle()
      window.removeEventListener('pointermove', drag)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', drop)
    }
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', drop)
  }

  const pointed = rooms.find((room) => room.name === hovered)
  const here = rooms[stop]

  return (
    <main className="gallery open-hall lobby-hall">
      <div
        className={pointed?.path ? 'backdrop sky pointing' : 'backdrop sky'}
        ref={stroll}
        onPointerDown={grab}
      >
        <SceneBoundary message="Tampilan 3D gagal dimuat.">
          {/* Clicking a portal is a mouse shortcut. The buttons below are for keyboard and screen readers. */}
          <Canvas
            flat
            aria-hidden="true"
            camera={{ position: [0, 2.4, 7], fov: LOBBY_FOV }}
            dpr={[1, 2]}
          >
            <Suspense fallback={null}>
              <LobbyScene
                rooms={rooms}
                walk={walk}
                insets={insets}
                active={hovered ?? here?.name}
                entering={entering}
                greeter={greeter}
                onHover={setHovered}
                onSelect={select}
                onArrive={onArrive}
              />
            </Suspense>
          </Canvas>
          <LoadingOverlay />
        </SceneBoundary>
      </div>

      <header className="topbar" ref={setTop}>
        <div className="plate">
          <h1>Solaris Museum</h1>
          <p>Museum 3D buatan penggemar</p>
        </div>
        <SearchButton label="Cari di museum" />
        {(unfinished || favorites > 0) && (
          <nav className="memory" aria-label="Kunjunganmu">
            {unfinished && (
              <Link to={`${unfinished.path}?baca`} className="pill resume">
                <span>Lanjutkan: {unfinished.name}</span>
              </Link>
            )}
            {favorites > 0 && (
              <button
                type="button"
                className="pill"
                aria-haspopup="dialog"
                onClick={() => openSearch(true)}
              >
                <span aria-hidden="true">★</span>
                Favorit {favorites}
              </button>
            )}
          </nav>
        )}
      </header>

      {/* The free space between the bars. The corridor behind it takes the pointer. */}
      <div className="viewport" ref={viewport}>
        {([-1, 1] as const).map((by) => (
          <button
            key={by}
            type="button"
            className={by < 0 ? 'pill walk back' : 'pill walk'}
            aria-label={by < 0 ? 'Ruangan sebelumnya' : 'Ruangan berikutnya'}
            disabled={by < 0 ? stop === 0 : stop === rooms.length - 1}
            onClick={() => go(stop + by)}
          >
            {by < 0 ? '‹' : '›'}
          </button>
        ))}
        {/* The greeter stands near the entrance, so the words go with those doors. */}
        {greeter && arrived && stop < 2 && (
          <div className="dialogue" role="status">
            <img
              src={assetUrl(`art/faces/${greeter.id}.webp`)}
              alt=""
              onError={(event) => (event.currentTarget.hidden = true)}
            />
            <p>
              <b>{greeter.name}</b>
              {greeting}
            </p>
          </div>
        )}
      </div>

      <div ref={setBottom}>
        <nav className="strip" aria-label="Ruangan">
          <p className="steer">Gulir atau seret untuk berjalan · klik portal untuk masuk</p>
          <ul ref={wheel}>
            {rooms.map((room, index) => (
              <li key={room.name} ref={index === stop ? reveal : undefined}>
                <button
                  type="button"
                  className="door"
                  style={{ '--door': room.color } as CSSProperties}
                  aria-current={index === stop ? 'location' : undefined}
                  disabled={!room.path}
                  onPointerEnter={(event) => {
                    // A finger that scrolls the strip must not walk the corridor.
                    if (event.pointerType === 'mouse') go(index)
                  }}
                  onFocus={() => go(index)}
                  onClick={(event) => {
                    if (!room.path) return
                    // A key press has no place of its own, so the hit goes in the middle.
                    const box = viewport.current?.getBoundingClientRect()
                    const point =
                      event.detail > 0 || !box
                        ? { x: event.clientX, y: event.clientY }
                        : { x: box.left + box.width / 2, y: box.top + box.height / 2 }
                    go(index)
                    select(room.path, point)
                  }}
                >
                  <b>{room.name}</b>
                  <small>{room.path ? room.description : 'Segera hadir'}</small>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="gallery-foot">
          <Disclaimer />
        </footer>
      </div>
    </main>
  )
}
