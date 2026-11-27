import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Link, useParams } from 'react-router'
import { assetUrl, useCharacters, type Character } from '../lib/characters'
import { themeOf } from '../lib/elements'
import { entrance, strike, tint, ultimate } from '../lib/sakuga'
import AnimationTabs from '../components/AnimationTabs'
import CharacterModel from '../three/CharacterModel'
import Podium from '../three/Podium'
import SceneBoundary from '../components/SceneBoundary'
import LoadingOverlay from '../components/LoadingOverlay'
import Disclaimer from '../components/Disclaimer'
import StageBackdrop from '../components/StageBackdrop'
import Roster from '../components/Roster'
import Dossier from '../components/Dossier'
import ElementParticles from '../three/ElementParticles'

function Stage({ character }: { character: Character }) {
  const [clips, setClips] = useState<string[]>([])
  const [selected, setSelected] = useState(character.defaultAnimation ?? '')
  const theme = themeOf(character.element)
  const viewport = useRef<HTMLDivElement>(null)
  const [hits, setHits] = useState(0)

  useEffect(() => tint(theme), [theme])

  // The entrance plays once, when the model has loaded.
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
    () => setSelected(character.defaultAnimation ?? ''),
    [character.defaultAnimation],
  )
  // The model plays its first clip when the default one is missing.
  const active = clips.includes(selected) ? selected : clips[0]

  return (
    <section
      className="card viewer"
      aria-label={`Model 3D ${character.name}`}
      style={
        {
          '--el-deep': theme.deep,
          '--el-pale': theme.pale,
          '--el-accent': theme.accent,
        } as CSSProperties
      }
    >
      <h2>
        {character.name}
        <span>{'★'.repeat(character.rarity)}</span>
      </h2>
      <p className="how">
        {character.element} · {character.weapon}
      </p>

      <div className="viewport" ref={viewport}>
        <StageBackdrop characterId={character.id} hits={hits} />
        <SceneBoundary message={`Model ${character.name} gagal dimuat.`}>
          {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
          <Canvas flat camera={{ position: [0, 0.98, 3.65], fov: 35 }} dpr={[1, 2]}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 4, 3]} intensity={1.6} />
            <Podium theme={theme} />
            <ElementParticles element={character.element} theme={theme} />
            <Suspense fallback={null}>
              <CharacterModel
                url={assetUrl(character.model)}
                animation={selected}
                onClips={onClips}
                onFinished={onFinished}
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
      </div>

      {clips.length > 0 && (
        <AnimationTabs
          clips={clips}
          labels={character.animationLabels}
          selected={active}
          onPick={pick}
        />
      )}
    </section>
  )
}

export default function ResonatorHall() {
  const { id } = useParams()
  const state = useCharacters()

  const characters = state.status === 'ready' ? state.data : []
  const current = id ? characters.find((item) => item.id === id) : characters[0]

  return (
    <div className="wrap">
      <header>
        <h1>Hall Resonator</h1>
        <p className="lede">Pilih karakter, putar modelnya, coba animasinya, lalu dengarkan suaranya.</p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
        </p>
      </header>

      <main className="hall">
        <Roster characters={characters} currentId={current?.id} />

        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data karakter gagal dimuat ({state.message}). Pastikan file data/characters.json ada.
          </p>
        )}
        {state.status === 'ready' && !current && (
          <p className="notice">Karakter tidak ditemukan.</p>
        )}
        {current && (
          <div className="exhibit" key={current.id}>
            <Stage character={current} />
            <Dossier character={current} />
          </div>
        )}
      </main>

      <Disclaimer />
    </div>
  )
}
