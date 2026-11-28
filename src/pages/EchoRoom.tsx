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
import { useBestiary } from '../lib/bestiary'
import { KINDS, ordered, useEchoes, type Echo, type SonataSet } from '../lib/echoes'
import { themeOf } from '../lib/elements'
import { useTerms } from '../lib/glossary'
import { reveal, useInsets } from '../lib/insets'
import { entrance, pop, strike, tint, ultimate } from '../lib/sakuga'
import { useTitle } from '../lib/title'
import AnimationTabs from '../components/AnimationTabs'
import Disclaimer from '../components/Disclaimer'
import EchoStrip from '../components/EchoStrip'
import GameText from '../components/GameText'
import LoadingOverlay from '../components/LoadingOverlay'
import Marks from '../components/Marks'
import SceneBoundary from '../components/SceneBoundary'
import SearchButton from '../components/SearchButton'
import SoundButton from '../components/SoundButton'
import SonataCard from '../components/SonataCard'
import ChamberScene from '../three/ChamberScene'
import { MONSTER_FOV } from '../three/MonsterStand'

/** 0 lets every set and every cost through. */
type Filter = { set: number; cost: number }

const ALL: Filter = { set: 0, cost: 0 }

const passes = (echo: Echo, { set, cost }: Filter) =>
  (set === 0 || echo.sets.includes(set)) && (cost === 0 || echo.cost === cost)

export default function EchoRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useEchoes()
  const bestiary = useBestiary()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(ALL)
  const [reading, setReading] = useState<'echo' | 'sets'>()
  const { insets, setTop, setBottom, setDrawer } = useInsets()
  const stage = useRef<HTMLDivElement>(null)

  const echoes = useMemo(() => (state.status === 'ready' ? ordered(state.data.echoes) : []), [state])
  const sets = useMemo(
    () => new Map<number, SonataSet>(
      state.status === 'ready' ? state.data.sets.map((set) => [set.id, set]) : [],
    ),
    [state],
  )
  const current = id
    ? echoes.find((item) => String(item.id) === id)
    : (echoes.find((item) => item.kind === 'echo' && item.monster) ?? echoes[0])
  useTitle((id && current?.name) || 'Ruang Echo')
  const kind = current?.kind ?? 'echo'
  const round = echoes.filter((item) => item.kind === kind && passes(item, filter))
  const text = query.trim().toLowerCase()
  // A search looks through every kind, set and cost.
  const shown = text ? echoes.filter((item) => item.name.toLowerCase().includes(text)) : round

  const own = current?.sets.flatMap((set) => sets.get(set) ?? []) ?? []
  const terms = useTerms()
  const seen = new Set<number>()

  const element = current?.element ?? ''
  const theme = themeOf(element)
  useEffect(() => tint(theme), [theme])

  // The model is the one of a Bestiary monster; without that list the echo shows its picture.
  const lender =
    bestiary.status === 'ready'
      ? bestiary.data.find((item) => item.id === current?.monster)
      : undefined
  const model = lender?.model

  // The chosen clip belongs to one echo; the next one starts with its idle clip.
  const [picked, setPicked] = useState<{ echo: number; clip: string }>()
  const animation =
    picked && picked.echo === current?.id ? picked.clip : (model?.defaultAnimation ?? '')
  const clips = Object.keys(model?.animationLabels ?? {})

  const pick = (clip: string) => {
    if (!current) return
    setPicked({ echo: current.id, clip })
    if (!stage.current) return
    const attack = /^Attack(\d+)$/.exec(clip)
    if (attack) strike(stage.current, theme, Number(attack[1]))
    else if (clip === 'Born') ultimate(stage.current, theme)
  }
  const onFinished = useCallback(() => setPicked(undefined), [])
  const currentId = current?.id
  // A new function for every echo, so each one gets its entrance.
  const onLoaded = useCallback(() => {
    if (currentId !== undefined && stage.current) entrance(stage.current, theme)
  }, [currentId, theme])

  const move = (by: number) => {
    const at = round.findIndex((item) => item.id === current?.id)
    const next = round[(at + by + round.length) % round.length]
    if (next) navigate(`/echo/${next.id}`)
  }

  /** Filters the strip, and opens the first echo that passes if the open one does not. */
  const choose = (next: Filter) => {
    setQuery('')
    setFilter(next)
    if (current && passes(current, next)) return
    // The open kind can have none, so the other kinds are the second choice.
    const found =
      echoes.find((item) => item.kind === kind && passes(item, next)) ??
      echoes.find((item) => passes(item, next))
    if (found) navigate(`/echo/${found.id}`)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.target instanceof HTMLSelectElement) return
      if (event.key === 'Escape') setReading(undefined)
      else if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const inSet = (set: number) => echoes.filter((item) => item.sets.includes(set)).length
  const chooseSet = (set: number) => choose({ set: set === filter.set ? 0 : set, cost: 0 })

  return (
    <>
      <main
        className={
          reading
            ? 'gallery open-hall bestiary echo-room reading'
            : 'gallery open-hall bestiary echo-room'
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
                  <ChamberScene
                    element={element}
                    theme={theme}
                    emblems={own.flatMap((set) => set.icon ?? [])}
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
          <SearchButton />
          <SoundButton />
          <div className="plate">
            <h1>{current?.name ?? 'Ruang Echo'}</h1>
            <p>
              {current
                ? `Cost ${current.cost} · ${current.rank} · ${current.element}`
                : 'Echo dan set Sonata'}
            </p>
          </div>
          {current && (
            <div className="switches">
              <nav aria-label="Jenis echo">
                <div>
                  {KINDS.map((item) => {
                    const members = echoes.filter((echo) => echo.kind === item.id)
                    const first = members.find((echo) => passes(echo, filter)) ?? members[0]
                    if (!first) return null
                    return (
                      <Link
                        key={item.id}
                        to={`/echo/${first.id}`}
                        className="pill"
                        aria-current={item.id === kind ? 'true' : undefined}
                        ref={item.id === kind ? reveal : undefined}
                        onClick={() => {
                          setQuery('')
                          // A filter that leaves this kind empty is dropped.
                          if (!passes(first, filter)) setFilter(ALL)
                        }}
                      >
                        {item.label} {members.length}
                      </Link>
                    )
                  })}
                </div>
              </nav>
              <div>
                {(['echo', 'sets'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="pill"
                    aria-expanded={reading === item}
                    onClick={(event) => {
                      pop(event.currentTarget)
                      setReading(reading === item ? undefined : item)
                    }}
                  >
                    {item === 'echo' ? 'Catatan' : `Set Sonata ${sets.size}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* The free space between the bars. The chamber behind it takes the pointer. */}
        <div className="viewport" ref={stage}>
          {state.status === 'loading' && <p className="notice">Memuat data…</p>}
          {state.status === 'error' && (
            <p className="notice" role="alert">
              Data echo gagal dimuat ({state.message}). Pastikan file data/echo.json ada.
            </p>
          )}
          {state.status === 'ready' && !current && <p className="notice">Echo tidak ditemukan.</p>}
          {current && !model && bestiary.status !== 'loading' && (
            <figure className="no-model">
              {current.icon && <img src={assetUrl(current.icon)} alt="" />}
              <figcaption>Echo ini belum punya model 3D.</figcaption>
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
          <EchoStrip
            echoes={shown}
            currentId={current?.id}
            query={query}
            onQuery={setQuery}
            list={`${kind} ${filter.set} ${filter.cost} ${query}`}
          >
            <div className="filters-row">
              <select
                aria-label="Set Sonata"
                value={filter.set}
                onChange={(event) => choose({ ...filter, set: Number(event.target.value) })}
              >
                <option value={0}>Semua set</option>
                {[...sets.values()].map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Cost"
                value={filter.cost}
                onChange={(event) => choose({ ...filter, cost: Number(event.target.value) })}
              >
                <option value={0}>Cost</option>
                {[4, 3, 1].map((cost) => (
                  <option
                    key={cost}
                    value={cost}
                    // A cost that the chosen set does not have cannot be picked.
                    disabled={!echoes.some((echo) => passes(echo, { ...filter, cost }))}
                  >
                    Cost {cost}
                  </option>
                ))}
              </select>
            </div>
          </EchoStrip>
          <footer className="gallery-foot">
            <Disclaimer />
          </footer>
        </div>

        {reading && current && (
          // A new key starts every report at its top.
          <aside
            key={reading === 'echo' ? current.id : reading}
            className="drawer"
            aria-label={reading === 'echo' ? 'Catatan echo' : 'Set Sonata'}
            ref={setDrawer}
          >
            <p className="tools">
              {reading === 'echo' && (
                <>
                  <button type="button" className="pill" onClick={() => move(-1)}>
                    ← Sebelumnya
                  </button>
                  <button type="button" className="pill" onClick={() => move(1)}>
                    Berikutnya →
                  </button>
                </>
              )}
              <button type="button" className="pill close" onClick={() => setReading(undefined)}>
                Tutup ✕
              </button>
            </p>
            <div className="report">
              <h2>{reading === 'echo' ? current.name : 'Set Sonata'}</h2>
              {reading === 'echo' && <Marks path={`/echo/${current.id}`} />}
              {reading === 'echo' && (
                <>
                  <p className="badges">
                    <span>Cost {current.cost}</span>
                    <small>
                      {current.rank} · {current.element}
                    </small>
                  </p>
                  {current.skill.text && (
                    <article>
                      <h3 className="skill">
                        {current.skill.icon && <img src={assetUrl(current.skill.icon)} alt="" />}
                        Skill Echo (level tertinggi)
                      </h3>
                      <GameText text={terms.link(current.skill.text, seen)} terms={terms.byId} />
                    </article>
                  )}
                  {lender && (
                    <article>
                      <h3>Model 3D</h3>
                      <p>
                        Dipinjam dari{' '}
                        <Link to={`/bestiary/${lender.id}`}>{lender.name} di Bestiary</Link>.
                      </p>
                    </article>
                  )}
                </>
              )}
              {(reading === 'echo' ? own : [...sets.values()]).map((set) => (
                <SonataCard
                  key={set.id}
                  set={set}
                  count={inSet(set.id)}
                  chosen={set.id === filter.set}
                  onChoose={chooseSet}
                />
              ))}
            </div>
          </aside>
        )}
      </main>
    </>
  )
}
