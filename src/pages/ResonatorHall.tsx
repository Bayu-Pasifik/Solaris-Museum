import { Suspense, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Link, useParams } from 'react-router'
import { assetUrl, useCharacters, type Character } from '../lib/characters'
import { pop } from '../lib/sakuga'
import AnimationTabs from '../components/AnimationTabs'
import CharacterModel from '../three/CharacterModel'
import Podium from '../three/Podium'
import SceneBoundary from '../components/SceneBoundary'
import LoadingOverlay from '../components/LoadingOverlay'
import Disclaimer from '../components/Disclaimer'

function Stage({ character }: { character: Character }) {
  const [clips, setClips] = useState<string[]>([])
  const [selected, setSelected] = useState(character.defaultAnimation ?? '')
  const onClips = useCallback((names: string[]) => setClips(names), [])
  const active = clips.includes(selected) ? selected : clips[0]

  return (
    <section className="card viewer" aria-label={`Model 3D ${character.name}`}>
      <h2>
        {character.name}
        <span>{'★'.repeat(character.rarity)}</span>
      </h2>
      <p className="how">
        {character.element} · {character.weapon}
      </p>

      <div className="viewport">
        <SceneBoundary message={`Model ${character.name} gagal dimuat.`}>
          {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
          <Canvas flat camera={{ position: [0, 0.98, 3.65], fov: 35 }} dpr={[1, 2]}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 4, 3]} intensity={1.6} />
            <Podium />
            <Suspense fallback={null}>
              <CharacterModel
                url={assetUrl(character.model)}
                animation={selected}
                onClips={onClips}
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
        <div className="acts tabs-row">
          <AnimationTabs
            key={clips.join('|')}
            clips={clips}
            labels={character.animationLabels}
            initial={active}
            onPick={setSelected}
          />
        </div>
      )}
    </section>
  )
}

export default function ResonatorHall() {
  const { id } = useParams()
  const state = useCharacters()
  const [query, setQuery] = useState('')

  const characters = state.status === 'ready' ? state.characters : []
  const current = id ? characters.find((item) => item.id === id) : characters[0]
  const matches = characters.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="wrap">
      <header>
        <h1>Hall Resonator</h1>
        <p className="lede">Pilih karakter, putar modelnya, lalu coba animasinya.</p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
        </p>
      </header>

      <main className="hall">
        <aside className="card roster">
          <sakuga-input
            type="search"
            placeholder="Cari karakter"
            label="Cari karakter"
            ref={(element) => {
              if (!element) return
              const onInput = () => setQuery(element.value)
              element.addEventListener('input', onInput)
              return () => element.removeEventListener('input', onInput)
            }}
          />
          <ul>
            {matches.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/resonator/${item.id}`}
                  aria-current={item.id === current?.id ? 'page' : undefined}
                  onClick={(event) => pop(event.currentTarget)}
                >
                  {item.name}
                  <small>{item.element}</small>
                </Link>
              </li>
            ))}
          </ul>
          {state.status === 'ready' && matches.length === 0 && <p>Tidak ditemukan.</p>}
        </aside>

        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data karakter gagal dimuat ({state.message}). Pastikan file data/characters.json ada.
          </p>
        )}
        {state.status === 'ready' && !current && (
          <p className="notice">Karakter tidak ditemukan.</p>
        )}
        {current && <Stage key={current.id} character={current} />}
      </main>

      <Disclaimer />
    </div>
  )
}
