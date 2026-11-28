import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate, useParams } from 'react-router'
import { assetUrl } from '../lib/characters'
import { ordered, useBestiary } from '../lib/bestiary'
import { themeOf } from '../lib/elements'
import { reveal, useInsets } from '../lib/insets'
import { entrance, pop, strike, tint, ultimate } from '../lib/sakuga'
import AnimationTabs from '../components/AnimationTabs'
import Disclaimer from '../components/Disclaimer'
import LoadingOverlay from '../components/LoadingOverlay'
import MonsterReport from '../components/MonsterReport'
import MonsterStrip from '../components/MonsterStrip'
import SceneBoundary from '../components/SceneBoundary'
import ArenaScene from '../three/ArenaScene'
import { MONSTER_FOV } from '../three/MonsterStand'

export default function Bestiary() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useBestiary()
  const [query, setQuery] = useState('')
  const [reading, setReading] = useState(false)
  const { insets, setTop, setBottom, setDrawer } = useInsets()
  const stage = useRef<HTMLDivElement>(null)

  const monsters = useMemo(() => (state.status === 'ready' ? ordered(state.data) : []), [state])
  const current = id
    ? monsters.find((item) => String(item.id) === id)
    : (monsters.find((item) => item.model) ?? monsters[0])
  const ranks = useMemo(() => [...new Set(monsters.map((item) => item.rank))], [monsters])
  const rank = current?.rank ?? ranks[0]
  const round = monsters.filter((item) => item.rank === rank)
  const text = query.trim().toLowerCase()
  // A search looks through every rank.
  const shown = text ? monsters.filter((item) => item.name.toLowerCase().includes(text)) : round

  const element = current?.element ?? ''
  const theme = themeOf(element)
  useEffect(() => tint(theme), [theme])

  // The chosen clip belongs to one monster; the next one starts with its idle clip.
  const [picked, setPicked] = useState<{ monster: number; clip: string }>()
  const model = current?.model
  const animation =
    picked && picked.monster === current?.id ? picked.clip : (model?.defaultAnimation ?? '')
  const clips = Object.keys(model?.animationLabels ?? {})

  const pick = (clip: string) => {
    if (!current) return
    setPicked({ monster: current.id, clip })
    if (!stage.current) return
    const attack = /^Attack(\d+)$/.exec(clip)
    if (attack) strike(stage.current, theme, Number(attack[1]))
    else if (clip === 'Born') ultimate(stage.current, theme)
  }
  const onFinished = useCallback(() => setPicked(undefined), [])
  const currentId = current?.id
  // A new function for every monster, so each one gets its entrance.
  const onLoaded = useCallback(() => {
    if (currentId !== undefined && stage.current) entrance(stage.current, theme)
  }, [currentId, theme])

  const move = (by: number) => {
    const at = round.findIndex((item) => item.id === current?.id)
    const next = round[(at + by + round.length) % round.length]
    if (next) navigate(`/bestiary/${next.id}`)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'Escape') setReading(false)
      else if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <main
        className={
          reading && current ? 'gallery open-hall bestiary reading' : 'gallery open-hall bestiary'
        }
        style={
          {
            '--el-deep': theme.deep,
            '--el-pale': theme.pale,
            '--el-accent': theme.accent,
          } as CSSProperties
        }
      >
        <div className="backdrop sky">
          {current && (
            <SceneBoundary key={model?.url} message={`Model ${current.name} gagal dimuat.`}>
              {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
              <Canvas
                flat
                aria-hidden="true"
                camera={{ position: [0, 3, 10], fov: MONSTER_FOV }}
                dpr={[1, 2]}
              >
                <Suspense fallback={null}>
                  <ArenaScene
                    element={element}
                    theme={theme}
                    model={model}
                    subject={current.id}
                    animation={animation}
                    insets={insets}
                    onLoaded={onLoaded}
                    onFinished={onFinished}
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
          <div className="plate">
            <h1>{current?.name ?? 'Bestiary'}</h1>
            <p>{current ? `${current.rank} · ${current.element}` : 'Catatan monster'}</p>
          </div>
          {current && (
            <div className="switches">
              <nav aria-label="Kelas monster">
                <div>
                  {ranks.map((item) => {
                    const first = monsters.find((monster) => monster.rank === item)
                    return (
                      <Link
                        key={item}
                        to={`/bestiary/${first?.id}`}
                        className="pill"
                        aria-current={item === rank ? 'true' : undefined}
                        ref={item === rank ? reveal : undefined}
                        onClick={() => setQuery('')}
                      >
                        {item} {monsters.filter((monster) => monster.rank === item).length}
                      </Link>
                    )
                  })}
                </div>
              </nav>
              <button
                type="button"
                className="pill"
                aria-expanded={reading}
                onClick={(event) => {
                  pop(event.currentTarget)
                  setReading(!reading)
                }}
              >
                Catatan
              </button>
            </div>
          )}
        </header>

        {/* The free space between the bars. The arena behind it takes the pointer. */}
        <div className="viewport" ref={stage}>
          {state.status === 'loading' && <p className="notice">Memuat data…</p>}
          {state.status === 'error' && (
            <p className="notice" role="alert">
              Data bestiary gagal dimuat ({state.message}). Pastikan file data/bestiary.json ada.
            </p>
          )}
          {state.status === 'ready' && !current && (
            <p className="notice">Monster tidak ditemukan.</p>
          )}
          {current && !model && (
            <figure className="no-model">
              {current.icon && <img src={assetUrl(current.icon)} alt="" />}
              <figcaption>Monster ini belum punya model 3D.</figcaption>
            </figure>
          )}
          {model && (
            <div className="controls">
              <AnimationTabs
                clips={clips}
                labels={model.animationLabels}
                selected={animation}
                onPick={pick}
              />
            </div>
          )}
        </div>

        <div ref={setBottom}>
          <MonsterStrip
            monsters={shown}
            currentId={current?.id}
            query={query}
            onQuery={setQuery}
          />
          <footer className="gallery-foot">
            <Disclaimer />
          </footer>
        </div>

        {reading && current && (
          // A new key starts every report at its top.
          <aside key={current.id} className="drawer" aria-label="Catatan monster" ref={setDrawer}>
            <p className="tools">
              <button type="button" className="pill" onClick={() => move(-1)}>
                ← Sebelumnya
              </button>
              <button type="button" className="pill" onClick={() => move(1)}>
                Berikutnya →
              </button>
              <button type="button" className="pill close" onClick={() => setReading(false)}>
                Tutup ✕
              </button>
            </p>
            <MonsterReport monster={current} />
          </aside>
        )}
      </main>
    </>
  )
}
