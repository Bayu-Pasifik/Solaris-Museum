import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate } from 'react-router'
import { spotAtStand, wing, wingsOf } from '../lib/armory'
import { reveal, useInsets } from '../lib/insets'
import { spotBefore, type Mode, type Roam } from '../lib/roam'
import type { WalkChoice } from '../lib/walkChoice'
import { rarityTheme, type Weapon } from '../lib/weapons'
import { wheel } from '../lib/wheel'
import ArmoryScene from '../three/ArmoryScene'
import Disclaimer from './Disclaimer'
import LoadingOverlay from './LoadingOverlay'
import Marks from './Marks'
import ModeSwitch from './ModeSwitch'
import SceneBoundary from './SceneBoundary'
import SearchButton from './SearchButton'
import SoundButton from './SoundButton'
import { lookAround, Stick, useWalkKeys } from './WalkControls'
import WeaponReport from './WeaponReport'
import WeaponViewer from './WeaponViewer'

type Props = {
  weapons: Weapon[]
  /** The weapon whose report is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Armory that is walked through: one wing for every kind of weapon. */
export default function ArmoryWalk({ weapons, currentId, walk }: Props) {
  const navigate = useNavigate()
  const current = weapons.find((weapon) => weapon.id === currentId)
  const wings = wingsOf(weapons)
  const [open, setOpen] = useState(current?.type ?? wings[0])
  // A weapon from the search box can be in another wing, which stays open after it is closed.
  const [seen, setSeen] = useState(currentId)
  if (currentId !== seen) {
    setSeen(currentId)
    if (current) setOpen(current.type)
  }
  const list = wing(weapons, current?.type ?? open)
  const picked = current ? list.indexOf(current) : undefined
  const third = walk.mode === 'third'

  const [start] = useState<Roam>(() => ({
    ...(picked === undefined ? spotBefore(0) : spotAtStand(picked, third)),
    keys: new Set<string>(),
    stick: { x: 0, y: 0 },
  }))
  const roam = useRef(start)
  const [row, setRow] = useState(0)
  const [nearId, setNearId] = useState<string>()
  const found = list.findIndex((weapon) => weapon.id === nearId)
  const near = found < 0 ? undefined : found
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

  // A weapon that is chosen from afar brings the visitor to its stand.
  useEffect(() => {
    if (picked !== undefined && currentId !== here.current) {
      Object.assign(roam.current, spotAtStand(picked, third))
    }
    // A new way of looking around does not move the visitor.
  }, [picked, currentId])

  const show = (index: number) => navigate(`/armory/${list[index].id}`, { replace: true })
  const close = useCallback(() => navigate('/armory', { replace: true }), [navigate])
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

  const enterWing = (type: string) => {
    setOpen(type)
    setNearId(undefined)
    setRow(0)
    here.current = undefined
    Object.assign(roam.current, spotBefore(0))
    if (current) close()
  }

  const choose = (next: { mode?: Mode; hero?: string }) => {
    roam.current.pitch = 0
    walk.choose(next)
  }

  const colors = (weapon: Weapon) => {
    const theme = rarityTheme(weapon.rarity)
    return {
      '--el-deep': theme.deep,
      '--el-pale': theme.pale,
      '--el-accent': theme.accent,
    } as CSSProperties
  }

  return (
    <main
      className={`gallery open-hall lobby-hall armory-hall roaming${current ? ' reading' : ''}`}
    >
      <div
        className="backdrop sky"
        onPointerDown={(event) => lookAround(event, roam, walk.mode === 'third')}
      >
        <SceneBoundary message="Tampilan 3D gagal dimuat.">
          {/* Clicking a stand is a mouse shortcut. The buttons below are for keyboard and screen readers. */}
          <Canvas flat aria-hidden="true" camera={{ position: [0, 1.6, 4] }} dpr={[1, 2]}>
            <Suspense fallback={null}>
              <ArmoryScene
                weapons={list}
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
          {/* Weapons load while the visitor walks, so only the first loading is shown. */}
          <LoadingOverlay once />
        </SceneBoundary>
      </div>

      <header className="topbar" ref={setTop}>
        <Link to="/" className="pill">
          ← Lobby
        </Link>
        <div className="plate">
          <h1>Armory</h1>
          <p>{list.length} senjata di sayap ini</p>
        </div>
        <SearchButton />
        <SoundButton />
        <ModeSwitch walk={walk} onChoose={choose} still="Daftar" />
        <div className="switches">
          <div role="group" aria-label="Sayap">
            {wings.map((type) => (
              <button
                key={type}
                type="button"
                className="pill"
                lang="en"
                aria-pressed={type === list[0]?.type}
                onClick={(event) => {
                  if (event.detail > 0) event.currentTarget.blur()
                  enterWing(type)
                }}
              >
                {type}
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
            Keluar ke Lobby <kbd aria-hidden="true">E</kbd>
          </button>
        ) : (
          target &&
          near !== picked && (
            <button type="button" className="button enter" onClick={() => show(near!)}>
              Lihat <bdi lang="en">{target.name}</bdi> <kbd aria-hidden="true">E</kbd>
            </button>
          )
        )}
      </div>

      <div ref={setBottom}>
        <nav className="strip" aria-label="Senjata">
          <p className="steer">
            WASD atau panah untuk berjalan · Shift lari · seret untuk melihat · E buka senjata
          </p>
          <ul ref={wheel}>
            {list.map((weapon, index) => (
              <li
                key={weapon.id}
                ref={index === (picked ?? near ?? row * 2) ? reveal : undefined}
              >
                <button
                  type="button"
                  className="door"
                  style={{ '--door': rarityTheme(weapon.rarity).accent } as CSSProperties}
                  aria-current={index === (picked ?? near) ? 'location' : undefined}
                  onClick={() => {
                    Object.assign(roam.current, spotAtStand(index, third))
                    show(index)
                  }}
                >
                  <b lang="en">{weapon.name}</b>
                  <small>{'★'.repeat(weapon.rarity)}</small>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="gallery-foot">
          <Disclaimer />
        </footer>
      </div>

      {current && (
        <aside
          key={current.id}
          className="drawer"
          ref={setDrawer}
          style={colors(current)}
          aria-label={`Data ${current.name}`}
        >
          <div className="tools">
            <button type="button" className="pill close" onClick={close}>
              Tutup
            </button>
          </div>
          <section className="report">
            <h2 lang="en">{current.name}</h2>
            <small>
              <bdi lang="en">{current.type}</bdi> · {'★'.repeat(current.rarity)}
            </small>
            <Marks path={`/armory/${current.id}`} />
            <div className="weapon-view" role="group" aria-label={`Model 3D ${current.name}`}>
              <WeaponViewer weapon={current} />
            </div>
            <p className="ranks">
              Seret untuk memutar · gulir atau cubit untuk memperbesar · klik kanan atau dua
              jari untuk menggeser
            </p>
            <WeaponReport weapon={current} />
          </section>
        </aside>
      )}
    </main>
  )
}
