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
import { spotBefore, spotOutside, type Mode, type Roam, type Spot } from '../lib/roam'
import { rooms } from '../lib/rooms'
import { impact } from '../lib/sakuga'
import { openSearch } from '../lib/search'
import { useVisits } from '../lib/visits'
import { useWalkChoice } from '../lib/walkChoice'
import { wheel } from '../lib/wheel'
import { useTitle } from '../lib/title'
import LobbyScene, { LOBBY_FOV } from '../three/LobbyScene'
import SceneBoundary from '../components/SceneBoundary'
import LoadingOverlay from '../components/LoadingOverlay'
import SearchButton from '../components/SearchButton'
import SoundButton from '../components/SoundButton'
import Disclaimer from '../components/Disclaimer'
import ModeSwitch from '../components/ModeSwitch'
import { lookAround, Stick, useWalkKeys } from '../components/WalkControls'

/** Pixels of a drag that walk from one door to the next. */
const STRIDE = 220

/** The door where the visitor left, so coming back from a room starts there. */
let lastStop = 0
/** The same for a free walker, who can stand anywhere. */
let lastSpot: Spot | undefined

export default function Lobby() {
  useTitle()
  const navigate = useNavigate()
  const timer = useRef<number>(undefined)
  const rest = useRef<number>(undefined)
  const viewport = useRef<HTMLDivElement>(null)
  const walk = useRef<Walk>({ target: lastStop })
  const [stop, setStop] = useState(lastStop)
  const [hovered, setHovered] = useState<string>()
  const [entering, setEntering] = useState<string>()
  const { insets, setTop, setBottom } = useInsets()
  /** The door that a free walker stands before, and can enter. */
  const [ahead, setAhead] = useState<number>()
  const [start] = useState<Roam>(() => ({
    ...(lastSpot ?? spotBefore(lastStop)),
    keys: new Set<string>(),
    stick: { x: 0, y: 0 },
  }))
  const roam = useRef(start)

  /** The door whose guard a free walker stands near. */
  const [met, setMet] = useState<number>()
  const state = useCharacters()
  const characters = state.status === 'ready' ? state.data : []
  const walking = useWalkChoice(characters)
  const { mode, hero } = walking
  const roaming = mode !== 'tour'
  const favorites = useVisits((visits) => visits.favorites.length)
  // The story that was read last, as long as it is not finished.
  const unfinished = useVisits((visits) =>
    visits.last && !visits.read.includes(visits.last.path) ? visits.last : undefined,
  )
  // On the tour the guard of the door where the visitor stands says hello.
  const greeting = roaming ? met : stop
  const words = greeting === undefined ? undefined : rooms[greeting]?.guard
  const speaker = characters.find((character) => character.id === words?.id)

  useEffect(() => {
    const pose = roam.current
    return () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(rest.current)
      const { x, z, yaw, pitch, heading } = pose
      lastSpot = { x, z, yaw, pitch, heading }
    }
  }, [])

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
    // A free walker comes back out of the same door.
    Object.assign(roam.current, spotOutside(lastStop))
    roam.current.keys.clear()
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

  /** Enters a room from where the walker is, with the hit in the middle of the picture. */
  const walkIn = (path: string) => {
    if (entering) return
    const box = viewport.current?.getBoundingClientRect()
    if (!box) return enter(path)
    select(path, { x: box.left + box.width / 2, y: box.top + box.height / 2 })
  }
  const door = ahead === undefined ? undefined : rooms[ahead]
  // The key handler stays the same, so it reads the newest door from a ref.
  const use = useRef<() => void>(undefined)
  useEffect(() => {
    use.current = () => {
      if (door?.path) walkIn(door.path)
    }
  })
  const onUse = useCallback(() => use.current?.(), [])
  useWalkKeys(roam, roaming, onUse)

  const onPlace = useCallback(
    (at: number, near: number | undefined, guard: number | undefined) => {
      lastStop = at
      walk.current.target = at
      setStop(at)
      setAhead(near)
      setMet(guard)
    },
    [],
  )

  const choose = (next: { mode?: Mode; hero?: string }) => {
    // A walk starts where the tour stands.
    if (!roaming && next.mode && next.mode !== 'tour') {
      Object.assign(roam.current, spotBefore(stop))
    }
    roam.current.pitch = 0
    setAhead(undefined)
    setMet(undefined)
    walking.choose(next)
  }

  /** Brings the visitor to a door: to its stop on the tour, or to stand before it. */
  const visit = (index: number) => {
    if (!roaming) return go(index)
    if (!entering) Object.assign(roam.current, spotOutside(index))
  }

  useEffect(() => {
    if (roaming) return
    const onKey = (event: KeyboardEvent) => {
      const forward = event.key === 'ArrowUp' || event.key === 'ArrowRight'
      const back = event.key === 'ArrowDown' || event.key === 'ArrowLeft'
      if (!forward && !back) return
      event.preventDefault()
      go(Math.round(walk.current.target) + (forward ? 1 : -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, roaming])

  /** The wheel walks along the corridor instead of down the page. */
  const stroll = useCallback(
    (stage: HTMLDivElement | null) => {
      if (!stage) return
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        if (roaming) return
        const by =Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        go(walk.current.target + by / (STRIDE * 2))
        settle()
      }
      stage.addEventListener('wheel', onWheel, { passive: false })
      return () => stage.removeEventListener('wheel', onWheel)
    },
    [go, settle, roaming],
  )

  /**
   * On the tour a swipe up or to the left walks on, and the other way walks back. A free walker
   * looks around instead.
   */
  const grab = (event: ReactPointerEvent) => {
    if (event.button !== 0) return
    if (roaming) return lookAround(event, roam, mode === 'third')
    const { pointerId } = event
    let x = event.clientX
    let y = event.clientY
    const drag = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      go(walk.current.target + (y - next.clientY + x - next.clientX) / STRIDE)
      x = next.clientX
      y = next.clientY
    }
    const drop = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
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
    <main className={roaming ? 'gallery open-hall lobby-hall roaming' : 'gallery open-hall lobby-hall'}>
      <div
        className={pointed?.path ? 'backdrop sky pointing' : 'backdrop sky'}
        ref={stroll}
        onPointerDown={grab}
      >
        <SceneBoundary message="The 3D view failed to load.">
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
                active={hovered ?? (roaming ? door?.name : here?.name)}
                mode={mode}
                roam={roam}
                hero={hero}
                onPlace={onPlace}
                onEnter={walkIn}
                entering={entering}
                characters={characters}
                stop={stop}
                greeting={greeting}
                onHover={setHovered}
                onSelect={select}
              />
            </Suspense>
          </Canvas>
          {/* Guards load while the visitor walks, so only the first loading is shown. */}
          <LoadingOverlay once />
        </SceneBoundary>
      </div>

      <header className="topbar" ref={setTop}>
        <div className="plate">
          <h1>Solaris Museum</h1>
          <p>A fan-made 3D museum</p>
        </div>
        <SearchButton label="Search the museum" />
        <SoundButton />
        <ModeSwitch walk={walking} onChoose={choose} />
        {(unfinished || favorites > 0) && (
          <nav className="memory" aria-label="Your visit">
            {unfinished && (
              <Link to={`${unfinished.path}?baca`} className="pill resume">
                <span>
                  Continue: <bdi lang="en">{unfinished.name}</bdi>
                </span>
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
                Favorites {favorites}
              </button>
            )}
          </nav>
        )}
      </header>

      {/* The free space between the bars. The corridor behind it takes the pointer. */}
      <div className="viewport" ref={viewport}>
        {roaming && <Stick roam={roam} />}
        {door?.path && roaming && !entering && (
          <button type="button" className="button enter" onClick={() => onUse()}>
            Enter {door.name} <kbd aria-hidden="true">E</kbd>
          </button>
        )}
        {(roaming ? [] : [-1, 1]).map((by) => (
          <button
            key={by}
            type="button"
            className={by < 0 ? 'pill walk back' : 'pill walk'}
            aria-label={by < 0 ? 'Previous room' : 'Next room'}
            disabled={by < 0 ? stop === 0 : stop === rooms.length - 1}
            onClick={() => go(stop + by)}
          >
            {by < 0 ? '‹' : '›'}
          </button>
        ))}
        {speaker && words && !entering && (
          // A new guard brings a new box, which also plays its entrance again.
          <div className="dialogue" role="status" key={speaker.id}>
            <img
              src={assetUrl(`art/faces/${speaker.id}.webp`)}
              alt=""
              onError={(event) => (event.currentTarget.hidden = true)}
            />
            <p>
              <b lang="en">{speaker.name}</b>
              {words.line}
            </p>
          </div>
        )}
      </div>

      <div ref={setBottom}>
        <nav className="strip" aria-label="Rooms">
          <p className="steer">
            {roaming
              ? 'WASD or arrows to walk · Shift to run · drag to look · E to enter'
              : 'Scroll or drag to walk · click a portal to enter'}
          </p>
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
                    // A free walker is not pulled along by a pointer that passes by.
                    if (event.pointerType === 'mouse' && !roaming) go(index)
                  }}
                  onFocus={(event) => {
                    // A click also gives focus, but it enters the room anyway.
                    if (event.currentTarget.matches(':focus-visible')) visit(index)
                  }}
                  onClick={(event) => {
                    if (!room.path) return
                    // A key press has no place of its own, so the hit goes in the middle.
                    const box = viewport.current?.getBoundingClientRect()
                    const point =
                      event.detail > 0 || !box
                        ? { x: event.clientX, y: event.clientY }
                        : { x: box.left + box.width / 2, y: box.top + box.height / 2 }
                    visit(index)
                    select(room.path, point)
                  }}
                >
                  <b>{room.name}</b>
                  <small>{room.path ? room.description : 'Coming soon'}</small>
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
