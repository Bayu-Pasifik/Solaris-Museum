import { Suspense, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Link, useParams } from 'react-router'
import { assetUrl, useCharacters, type Character } from '../lib/characters'
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
    <section className="stage" aria-label={`Model 3D ${character.name}`}>
      <SceneBoundary message={`Model ${character.name} gagal dimuat.`}>
        {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
        <Canvas flat camera={{ position: [0, 1.1, 3.4], fov: 35 }} dpr={[1, 2]}>
          <color attach="background" args={['#10131c']} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 4, 3]} intensity={1.6} />
          <Podium />
          <Suspense fallback={null}>
            <CharacterModel url={assetUrl(character.model)} animation={selected} onClips={onClips} />
          </Suspense>
          <OrbitControls
            target={[0, 0.8, 0]}
            enablePan={false}
            minDistance={1.2}
            maxDistance={5}
            maxPolarAngle={Math.PI / 1.9}
          />
        </Canvas>
        <LoadingOverlay />
      </SceneBoundary>

      <div className="stage-info">
        <h2>{character.name}</h2>
        <p>
          {'★'.repeat(character.rarity)} · {character.element} · {character.weapon}
        </p>
      </div>

      {clips.length > 0 && (
        <div className="animation-bar" role="group" aria-label="Animasi">
          {clips.map((clip) => (
            <button
              type="button"
              key={clip}
              aria-pressed={clip === active}
              onClick={() => setSelected(clip)}
            >
              {character.animationLabels?.[clip] ?? clip}
            </button>
          ))}
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
    <main className="hall">
      <aside className="sidebar">
        <Link to="/" className="back">
          ← Lobby
        </Link>
        <h1>Hall Resonator</h1>
        <input
          type="search"
          placeholder="Cari karakter"
          aria-label="Cari karakter"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul>
          {matches.map((item) => (
            <li key={item.id}>
              <Link
                to={`/resonator/${item.id}`}
                aria-current={item.id === current?.id ? 'page' : undefined}
              >
                {item.name}
                <small>{item.element}</small>
              </Link>
            </li>
          ))}
        </ul>
        {state.status === 'ready' && matches.length === 0 && <p>Tidak ditemukan.</p>}
        <Disclaimer />
      </aside>

      {state.status === 'loading' && <p className="notice">Memuat data…</p>}
      {state.status === 'error' && (
        <p className="notice" role="alert">
          Data karakter gagal dimuat ({state.message}). Pastikan file data/characters.json ada.
        </p>
      )}
      {state.status === 'ready' && !current && <p className="notice">Karakter tidak ditemukan.</p>}
      {current && <Stage key={current.id} character={current} />}
    </main>
  )
}
