import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Link, useParams } from 'react-router'
import { assetUrl, useCharacters, type Character } from '../lib/characters'
import { themeOf } from '../lib/elements'
import { entrance, pop, strike, tint, ultimate } from '../lib/sakuga'
import { useWeapons, type Weapon } from '../lib/weapons'
import { useTitle } from '../lib/title'
import AnimationTabs from '../components/AnimationTabs'
import CharacterModel from '../three/CharacterModel'
import Podium from '../three/Podium'
import SceneBoundary from '../components/SceneBoundary'
import SearchButton from '../components/SearchButton'
import SoundButton from '../components/SoundButton'
import LoadingOverlay from '../components/LoadingOverlay'
import Disclaimer from '../components/Disclaimer'
import StageBackdrop from '../components/StageBackdrop'
import Roster from '../components/Roster'
import Dossier from '../components/Dossier'
import FlatArt from '../components/FlatArt'
import ElementParticles from '../three/ElementParticles'

// The Spine player is big, so it is only loaded when the visitor asks for the art.
const Live2dArt = lazy(() => import('../components/Live2dArt'))

type View = 'model' | 'art'

type StageProps = {
  character: Character
  view: View
  /** The weapons that this character can hold. */
  weapons: Weapon[]
}

/** The backdrop, the character and the buttons that change what the character does. */
function Stage({ character, view, weapons }: StageProps) {
  const [armed, setArmed] = useState('')
  const weapon = weapons.find((item) => item.id === armed)
  const outfits = [
    { ...character, name: character.skinName ?? 'Bawaan' },
    ...(character.skins ?? []),
  ]
  const [worn, setWorn] = useState(0)
  const outfit = outfits[worn] ?? outfits[0]
  const [clips, setClips] = useState<string[]>([])
  const [selected, setSelected] = useState(character.defaultAnimation ?? '')
  const theme = themeOf(character.element)
  const viewport = useRef<HTMLDivElement>(null)
  const [hits, setHits] = useState(0)

  useEffect(() => tint(theme), [theme])

  // The entrance plays once for each outfit, when its model has loaded.
  const arrived = useRef(false)
  const onClips = useCallback(
    (names: string[]) => {
      setClips(names)
      if (arrived.current || !viewport.current) return
      arrived.current = true
      entrance(viewport.current, theme)
    },
    [theme],
  )

  const pick = (clip: string) => {
    setSelected(clip)
    const stage = viewport.current
    const attack = /^Attack(\d+)$/.exec(clip)
    if (!stage || (!attack && !clip.startsWith('Burst'))) return
    if (attack) strike(stage, theme, Number(attack[1]))
    else ultimate(stage, theme)
    setHits((count) => count + 1)
  }
  const onFinished = useCallback(
    () => setSelected(outfit.defaultAnimation ?? ''),
    [outfit.defaultAnimation],
  )
  const wear = (index: number) => {
    if (index === worn) return
    arrived.current = false
    setWorn(index)
    setClips([])
    setSelected(outfits[index].defaultAnimation ?? '')
  }
  // The model plays its first clip when the default one is missing.
  const active = clips.includes(selected) ? selected : clips[0]

  return (
    <>
      {/* The faded splash art would only double the picture in the art view. */}
      <StageBackdrop
        key={view}
        characterId={view === 'model' ? character.id : undefined}
        hits={hits}
      />

      <div className="viewport" ref={viewport}>
        {view === 'model' && (
          <SceneBoundary message={`Model ${character.name} gagal dimuat.`}>
            {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
            <Canvas flat camera={{ position: [0, 0.98, 3.65], fov: 35 }} dpr={[1, 2]}>
              <ambientLight intensity={0.8} />
              <directionalLight position={[2, 4, 3]} intensity={1.6} />
              <Podium theme={theme} />
              <ElementParticles element={character.element} theme={theme} />
              <Suspense fallback={null}>
                <CharacterModel
                  key={outfit.model}
                  url={assetUrl(outfit.model)}
                  animation={selected}
                  onClips={onClips}
                  onFinished={onFinished}
                  weapon={
                    weapon?.held ? { url: assetUrl(weapon.held), type: weapon.type } : undefined
                  }
                />
              </Suspense>
              <OrbitControls
                target={[0, 0.62, 0]}
                enablePan={false}
                minDistance={1.2}
                maxDistance={5}
                maxPolarAngle={Math.PI / 1.9}
              />
            </Canvas>
            <LoadingOverlay />
          </SceneBoundary>
        )}
        {view === 'art' &&
          (character.l2d ? (
            <SceneBoundary message={`L2D ${character.name} gagal dimuat.`}>
              <Suspense fallback={<p className="notice">Memuat L2D…</p>}>
                <Live2dArt art={character.l2d} label={`Ilustrasi bergerak ${character.name}`} />
              </Suspense>
            </SceneBoundary>
          ) : (
            <FlatArt id={character.id} name={character.name} />
          ))}
      </div>

      {view === 'model' && (
        <div className="controls">
          {(outfits.length > 1 || weapons.length > 0) && (
            <div className="outfits">
              {outfits.length > 1 && (
                <div role="group" aria-label="Kostum">
                  {outfits.map((item, index) => (
                    <button
                      key={item.model}
                      type="button"
                      className="pill"
                      aria-pressed={index === worn}
                      onClick={(event) => {
                        pop(event.currentTarget)
                        wear(index)
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
              {weapons.length > 0 && (
                <select
                  className="pill"
                  aria-label="Senjata di tangan"
                  value={armed}
                  onChange={(event) => {
                    pop(event.currentTarget)
                    setArmed(event.target.value)
                  }}
                >
                  <option value="">Tanpa senjata</option>
                  {weapons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.rarity}★
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {clips.length > 0 && (
            <AnimationTabs
              clips={clips}
              labels={outfit.animationLabels}
              selected={active}
              onPick={pick}
            />
          )}
        </div>
      )}
    </>
  )
}

export default function ResonatorHall() {
  const { id } = useParams()
  const state = useCharacters()
  const [view, setView] = useState<View>('model')
  const [reading, setReading] = useState(false)

  const characters = state.status === 'ready' ? state.data : []
  const current = id ? characters.find((item) => item.id === id) : characters[0]
  const theme = themeOf(current?.element ?? '')
  useTitle((id && current?.name) || 'Hall Resonator')
  // The hall also works without the Armory data; there is then no weapon to choose.
  const armory = useWeapons()
  const weapons =
    armory.status === 'ready'
      ? armory.data
          .filter((item) => item.held && item.type === current?.weapon)
          .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name))
      : []

  useEffect(() => {
    if (!reading) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setReading(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reading])

  const views: { id: View; label: string }[] = [
    { id: 'model', label: '3D' },
    { id: 'art', label: current?.l2d ? 'L2D' : 'Ilustrasi' },
  ]

  return (
    <>
      <main
        className={reading && current ? 'gallery reading' : 'gallery'}
        style={
          {
            '--el-deep': theme.deep,
            '--el-pale': theme.pale,
            '--el-accent': theme.accent,
          } as CSSProperties
        }
      >
        <header className="topbar">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
          <SearchButton />
          <SoundButton />
          <div className="plate">
            <h1>
              {current?.name ?? 'Hall Resonator'}
              {current && <span>{'★'.repeat(current.rarity)}</span>}
            </h1>
            {current && (
              <p>
                {current.element} · {current.weapon}
              </p>
            )}
          </div>
          {current && (
            <div className="switches">
              <div role="group" aria-label="Tampilan">
                {views.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="pill"
                    aria-pressed={view === item.id}
                    onClick={(event) => {
                      pop(event.currentTarget)
                      setView(item.id)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="pill"
                aria-expanded={reading}
                onClick={(event) => {
                  pop(event.currentTarget)
                  setReading(!reading)
                }}
              >
                Dossier
              </button>
            </div>
          )}
        </header>

        {current ? (
          <Stage key={current.id} character={current} view={view} weapons={weapons} />
        ) : (
          <div className="viewport">
            {state.status === 'loading' && <p className="notice">Memuat data…</p>}
            {state.status === 'error' && (
              <p className="notice" role="alert">
                Data karakter gagal dimuat ({state.message}). Pastikan file data/characters.json
                ada.
              </p>
            )}
            {state.status === 'ready' && <p className="notice">Karakter tidak ditemukan.</p>}
          </div>
        )}

        <Roster characters={characters} currentId={current?.id} />

        <footer className="gallery-foot">
          <Disclaimer />
          <p className="disclaimer">
            L2D diputar dengan Spine Runtimes © Esoteric Software (
            <a href={assetUrl('spine-license.txt')}>lisensi</a>).
          </p>
        </footer>

        {reading && current && (
          <div className="drawer">
            <button type="button" className="pill close" onClick={() => setReading(false)}>
              Tutup ✕
            </button>
            <Dossier key={current.id} character={current} />
          </div>
        )}
      </main>
    </>
  )
}
