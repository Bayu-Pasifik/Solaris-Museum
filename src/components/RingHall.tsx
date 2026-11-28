import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ElementTheme } from '../lib/elements'
import { useInsets, type Insets } from '../lib/insets'
import { RING_FOV } from '../three/RingStage'
import Disclaimer from './Disclaimer'
import LoadingOverlay from './LoadingOverlay'
import SceneBoundary from './SceneBoundary'
import SearchButton from './SearchButton'
import SoundButton from './SoundButton'

/** Pixels at the foot of the hall that the name of the chosen panel covers. */
const CAPTION = 80
/** Pixels of a drag, or of a turn of the wheel, that bring the next panel to the middle. */
const STRIDE = 130

/** What the 3D scene needs from the page around it. */
export type Stage = {
  insets: Insets
  /** A click on a panel: another one is chosen, and the chosen one is opened. */
  onSelect: (id: string) => void
  onHover: (over: boolean) => void
}

type Props = {
  /** Class of the room, next to the classes that every ring hall has. */
  name: string
  theme: ElementTheme
  /** The address of the room; a chosen panel adds its id. */
  base: string
  back: { to: string; label: string }
  title: string
  subtitle: ReactNode
  /** Buttons beside the title. */
  links?: ReactNode
  /** The groups to choose from, as pills at the right of the top bar. */
  switches?: { label: string; children: ReactNode }
  /** Ids of the panels in the ring, in order. */
  ids: string[]
  current?: string
  /** What one panel is, for the labels of the arrows. */
  noun: string
  /** Shown while the data loads, or when there is nothing to show. */
  notice?: ReactNode
  /** The title is text of the game. */
  caption?: { title: string; detail: ReactNode; action: string }
  scene: (stage: Stage) => ReactNode
  /** The strip below the hall. "pick" is called when a link in it is used. */
  strip: (pick: () => void) => ReactNode
  /** The content of the drawer. */
  report?: ReactNode
  reportLabel: string
}

/**
 * A room that fills the screen: a ring of panels in a 3D hall, a strip with all of them below
 * and a drawer for the chosen one.
 */
export default function RingHall({
  name,
  theme,
  base,
  back,
  title,
  subtitle,
  links,
  switches,
  ids,
  current,
  noun,
  notice,
  caption,
  scene,
  strip,
  report,
  reportLabel,
}: Props) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [pointing, setPointing] = useState(false)
  const { insets, setTop, setBottom, setDrawer } = useInsets()

  const index = current === undefined ? -1 : ids.indexOf(current)
  // The address says whether the drawer is open, so the back button closes it.
  const reading = current !== undefined && search.has('baca')

  const open = (next: string, read = reading) => {
    setPointing(false)
    navigate(`${base}/${next}${read ? '?baca' : ''}`, { replace: next !== current })
  }
  const close = () => navigate(`${base}/${current}`, { replace: true })
  const move = (by: number) => {
    const next = ids[index + by]
    if (index >= 0 && next !== undefined) open(next)
  }

  // The listeners of a drag and of the wheel live longer than one panel, so they read the
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

  /** A swipe to the left brings the next panel; the other way brings the one before. */
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

  /** The wheel walks along the ring instead of down the page. */
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
      className={`gallery open-hall ring-hall ${name}${reading ? ' reading' : ''}`}
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
        <SceneBoundary message="The 3D view failed to load.">
          {/* Clicking a panel is a mouse shortcut. The strip and the buttons do the same. */}
          <Canvas
            flat
            aria-hidden="true"
            camera={{ position: [0, 2.5, 9], fov: RING_FOV }}
            dpr={[1, 2]}
          >
            {scene({
              insets: reading ? insets : { ...insets, bottom: insets.bottom + CAPTION },
              onSelect: (next) => open(next, reading || next === current),
              onHover: setPointing,
            })}
          </Canvas>
          <LoadingOverlay />
        </SceneBoundary>
      </div>

      <header className="topbar" ref={setTop}>
        <Link to={back.to} className="pill">
          ← {back.label}
        </Link>
        <SearchButton />
        <SoundButton />
        <div className="plate">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {links}
        {switches && (
          <nav className="switches" aria-label={switches.label}>
            <div>{switches.children}</div>
          </nav>
        )}
      </header>

      {/* The free space between the bars. The hall behind it takes the pointer. */}
      <div className="viewport">
        {notice}
        {index >= 0 &&
          ([-1, 1] as const).map((by) => (
            <button
              key={by}
              type="button"
              className={by < 0 ? 'pill walk back' : 'pill walk'}
              aria-label={`${by < 0 ? 'Previous' : 'Next'} ${noun.toLowerCase()}`}
              disabled={ids[index + by] === undefined}
              onClick={() => move(by)}
            >
              {by < 0 ? '‹' : '›'}
            </button>
          ))}
        {caption && current !== undefined && !reading && (
          <div className="caption">
            <p role="status">
              <b lang="en">{caption.title}</b>
              {caption.detail}
            </p>
            <button type="button" className="button" onClick={() => open(current, true)}>
              {caption.action}
            </button>
          </div>
        )}
      </div>

      <div ref={setBottom}>
        {strip(() => setPointing(false))}
        <footer className="gallery-foot">
          <Disclaimer />
        </footer>
      </div>

      {reading && report && (
        // A new key starts every report at its top.
        <aside key={current} className="drawer" aria-label={reportLabel} ref={setDrawer}>
          <p className="tools">
            <button type="button" className="pill" disabled={index <= 0} onClick={() => move(-1)}>
              ← Previous
            </button>
            <button
              type="button"
              className="pill"
              disabled={index < 0 || index >= ids.length - 1}
              onClick={() => move(1)}
            >
              Next →
            </button>
            <button type="button" className="pill close" onClick={close}>
              Close ✕
            </button>
          </p>
          {report}
        </aside>
      )}
    </main>
  )
}
