import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate } from 'react-router'
import type { Character } from '../lib/characters'
import type { ElementTheme } from '../lib/elements'
import { center, reveal, useInsets, type Insets } from '../lib/insets'
import { spotBefore, type Mode, type Roam, type Spot } from '../lib/roam'
import type { WalkChoice } from '../lib/walkChoice'
import { wheel } from '../lib/wheel'
import { wingsOf } from '../lib/wings'
import type { Exhibit } from '../three/WingScene'
import Disclaimer from './Disclaimer'
import LoadingOverlay from './LoadingOverlay'
import ModeSwitch from './ModeSwitch'
import SceneBoundary from './SceneBoundary'
import SearchButton from './SearchButton'
import SoundButton from './SoundButton'
import { lookAround, Stick, useWalkKeys } from './WalkControls'

/** What the 3D scene of a hall gets. */
export type HallProps<T> = {
  /** What is in the open wing, in order. */
  items: T[]
  mode: Mode
  roam: RefObject<Roam>
  hero?: Character
  insets: Insets
  /** The row nearest along the wing, and the item the visitor is at. */
  row: number
  near?: number
  /** The item whose report is open. */
  picked?: number
  /** Tells the row, the id of what the visitor is at, and whether the way out is near. */
  onPlace: (row: number, near: string | undefined, exit: boolean) => void
  onPick: (index: number) => void
  onExit: () => void
}

/** How the wings of a room are laid out and drawn. */
export type Hall<T> = {
  theme: (item: T) => ElementTheme
  /** A few words below the name of an item. */
  note: (item: T) => string
  /** Where a visitor stands to look at an item. */
  spot: (index: number, third: boolean) => Spot
  /** The row of an item along the wing, and the index of the first item of a row. */
  rowOf: (index: number) => number
  rowStart: (row: number) => number
  /**
   * For a room that holds all its wings in one, one after another. The button of a wing then
   * brings the visitor to its first item, and shows where the visitor is.
   */
  jump?: (index: number) => Spot
  Scene: ComponentType<HallProps<T>>
}

type Props<T> = {
  /** The name of the room, and the address of its page. */
  title: string
  base: string
  /** One and many of what is on show, for the words of the page. */
  noun: [string, string]
  /** Everything on show in the hall. */
  items: T[]
  /** The wing of an item, and the order of the wings. */
  wingOf: (item: T) => string
  order: readonly string[]
  /** The order of the items in a wing; without it they keep the order of "items". */
  compare?: (a: T, b: T) => number
  hall: Hall<T>
  /** The item whose report is open, from the address of the page. */
  currentId?: string
  /** Where the walk starts when no report is open. */
  startId?: string
  /** More buttons for the top bar. */
  links?: ReactNode
  walk: WalkChoice
  /** What the view without walking is called in this room. */
  still: string
  /** What the drawer says about an item. */
  report: (item: T) => ReactNode
  /** For a report without a model of its own: opening it turns the visitor to the stand. */
  face?: boolean
}

/** A hall that is walked through, with one wing for every kind of what is on show. */
export default function WingWalk<T extends Exhibit>({
  title,
  base,
  noun: [one, many],
  items,
  wingOf,
  order,
  compare,
  hall,
  currentId,
  startId,
  links,
  walk,
  still,
  report,
  face = false,
}: Props<T>) {
  const navigate = useNavigate()
  const current = items.find((item) => item.id === currentId)
  const wings = wingsOf(items.map(wingOf), order)
  const first = current ?? items.find((item) => item.id === startId)
  const [open, setOpen] = useState(first ? wingOf(first) : wings[0])
  // An item from the search box can be in another wing, which stays open after it is closed.
  const [seen, setSeen] = useState(currentId)
  if (currentId !== seen) {
    setSeen(currentId)
    if (current) setOpen(wingOf(current))
  }
  const openWing = current ? wingOf(current) : open
  /** What stands in the room now. */
  const list = items.filter((item) => hall.jump || wingOf(item) === openWing)
  if (compare) list.sort(compare)
  const picked = current ? list.indexOf(current) : undefined
  const third = walk.mode === 'third'
  const begin = first ? list.indexOf(first) : -1
  const { Scene } = hall

  const [start] = useState<Roam>(() => ({
    ...(begin < 0 ? spotBefore(0) : hall.spot(begin, third)),
    keys: new Set<string>(),
    stick: { x: 0, y: 0 },
  }))
  const roam = useRef(start)
  // The row is known before the first frame, so a walk that starts far down is drawn at once.
  const [row, setRow] = useState(() => (begin < 0 ? 0 : hall.rowOf(begin)))
  const [nearId, setNearId] = useState<string>()
  const found = list.findIndex((item) => item.id === nearId)
  const near = found < 0 ? undefined : found
  /** The item that says where in the room the visitor is. */
  const place = list[picked ?? near ?? hall.rowStart(row)]
  const shownWing = hall.jump && place ? wingOf(place) : openWing
  const [atExit, setAtExit] = useState(false)
  const { insets, setTop, setBottom, setDrawer } = useInsets()
  /** The same as "nearId", at once. */
  const here = useRef<string>(undefined)

  const onPlace = useCallback((at: number, id: string | undefined, exit: boolean) => {
    here.current = id
    setRow(at)
    setNearId(id)
    setAtExit(exit)
  }, [])

  // An item that is chosen from afar brings the visitor to it.
  useEffect(() => {
    if (picked !== undefined && currentId !== here.current) {
      Object.assign(roam.current, hall.spot(picked, third))
    }
    // A new way of looking around does not move the visitor.
  }, [picked, currentId])

  const show = (index: number) => {
    if (face) Object.assign(roam.current, hall.spot(index, third))
    navigate(`${base}/${list[index].id}`, { replace: true })
  }
  const close = useCallback(() => navigate(base, { replace: true }), [navigate, base])
  const leave = () => navigate('/')

  const target = near === undefined ? undefined : list[near]
  // The key handler stays the same, so it reads the newest place from a ref.
  const use = useRef<() => void>(undefined)
  useEffect(() => {
    use.current = () => {
      if (atExit) leave()
      else if (near === undefined) return
      else if (near === picked) close()
      else show(near)
    }
  })
  const onUse = useCallback(() => use.current?.(), [])
  useWalkKeys(roam, true, onUse)

  useEffect(() => {
    if (!current) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, close])

  const enterWing = (name: string) => {
    const start = hall.jump ? list.findIndex((item) => wingOf(item) === name) : 0
    setOpen(name)
    setNearId(undefined)
    setRow(hall.jump ? hall.rowOf(start) : 0)
    here.current = undefined
    Object.assign(roam.current, hall.jump?.(start) ?? spotBefore(0))
    if (current) close()
  }

  const choose = (next: { mode?: Mode; hero?: string }) => {
    roam.current.pitch = 0
    walk.choose(next)
  }

  const theme = current && hall.theme(current)

  return (
    <main className={`gallery open-hall lobby-hall wing-hall roaming${current ? ' reading' : ''}`}>
      <div
        className="backdrop sky"
        onPointerDown={(event) => lookAround(event, roam, walk.mode === 'third')}
      >
        <SceneBoundary message="The 3D view failed to load.">
          {/* Clicking a stand is a mouse shortcut. The buttons below are for keyboard and screen readers. */}
          <Canvas flat aria-hidden="true" camera={{ position: [0, 1.6, 4] }} dpr={[1, 2]}>
            <Suspense fallback={null}>
              <Scene
                items={list}
                mode={walk.mode}
                roam={roam}
                hero={walk.hero}
                insets={insets}
                row={row}
                near={near}
                picked={picked}
                onPlace={onPlace}
                onPick={show}
                onExit={leave}
              />
            </Suspense>
          </Canvas>
          {/* Models load while the visitor walks, so only the first loading is shown. */}
          <LoadingOverlay once />
        </SceneBoundary>
      </div>

      <header className="topbar" ref={setTop}>
        <Link to="/" className="pill">
          ← Lobby
        </Link>
        <div className="plate">
          <h1>{title}</h1>
          <p>
            {list.length} {list.length === 1 ? one : many}
            {!hall.jump && ' in this wing'}
          </p>
        </div>
        <SearchButton />
        <SoundButton />
        {links}
        <ModeSwitch walk={walk} onChoose={choose} still={still} />
        <div className="switches">
          <div role="group" aria-label="Wings">
            {wings.map((name) => (
              <button
                key={name}
                type="button"
                className="pill"
                lang="en"
                aria-pressed={name === shownWing}
                ref={name === shownWing ? reveal : undefined}
                onClick={(event) => {
                  if (event.detail > 0) event.currentTarget.blur()
                  enterWing(name)
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* The free space between the bars. The hall behind it takes the pointer. */}
      <div className="viewport">
        <Stick roam={roam} />
        {atExit ? (
          <button type="button" className="button enter" onClick={leave}>
            Exit to Lobby <kbd aria-hidden="true">E</kbd>
          </button>
        ) : (
          target &&
          near !== picked && (
            <button type="button" className="button enter" onClick={() => show(near!)}>
              View <bdi lang="en">{target.name}</bdi> <kbd aria-hidden="true">E</kbd>
            </button>
          )
        )}
      </div>

      <div ref={setBottom}>
        <nav className="strip" aria-label={`${title} stands`}>
          <p className="steer">
            WASD or arrows to walk · Shift to run · drag to look · E to open a {one}
          </p>
          <ul ref={wheel}>
            {list.map((item, index) => (
              <li
                key={item.id}
                ref={index === (picked ?? near ?? hall.rowStart(row)) ? center : undefined}
              >
                <button
                  type="button"
                  className="door"
                  style={{ '--door': hall.theme(item).accent } as CSSProperties}
                  aria-current={index === (picked ?? near) ? 'location' : undefined}
                  onClick={() => {
                    Object.assign(roam.current, hall.spot(index, third))
                    show(index)
                  }}
                >
                  <b lang="en">{item.name}</b>
                  <small lang="en">{hall.note(item)}</small>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="gallery-foot">
          <Disclaimer />
        </footer>
      </div>

      {current && theme && (
        <aside
          key={current.id}
          className="drawer"
          ref={setDrawer}
          style={
            {
              '--el-deep': theme.deep,
              '--el-pale': theme.pale,
              '--el-accent': theme.accent,
            } as CSSProperties
          }
          aria-label={`${current.name} details`}
        >
          <div className="tools">
            <button type="button" className="pill close" onClick={close}>
              Close
            </button>
          </div>
          {report(current)}
        </aside>
      )}
    </main>
  )
}
