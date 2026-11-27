import { Suspense, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Link, useParams } from 'react-router'
import { assetUrl } from '../lib/characters'
import { entrance, tint } from '../lib/sakuga'
import { rarityTheme, useWeapons, type Weapon } from '../lib/weapons'
import Disclaimer from '../components/Disclaimer'
import GameText from '../components/GameText'
import LoadingOverlay from '../components/LoadingOverlay'
import SceneBoundary from '../components/SceneBoundary'
import StageBackdrop from '../components/StageBackdrop'
import WeaponRack from '../components/WeaponRack'
import Podium from '../three/Podium'
import WeaponModel from '../three/WeaponModel'

/** One weapon on its stand, with its numbers and its story. Render it with the id as key. */
function Exhibit({ weapon }: { weapon: Weapon }) {
  const theme = rarityTheme(weapon.rarity)
  const viewport = useRef<HTMLDivElement>(null)

  useEffect(() => tint(theme), [theme])

  // The entrance plays once, when the model has loaded.
  const arrived = useRef(false)
  const onReady = useCallback(() => {
    if (arrived.current || !viewport.current) return
    arrived.current = true
    entrance(viewport.current, theme)
  }, [theme])

  const colors = {
    '--el-deep': theme.deep,
    '--el-pale': theme.pale,
    '--el-accent': theme.accent,
  } as CSSProperties

  return (
    <div className="exhibit">
      <section className="card viewer" aria-label={`Model 3D ${weapon.name}`} style={colors}>
        <h2>
          {weapon.name}
          <span>{'★'.repeat(weapon.rarity)}</span>
        </h2>
        <p className="how">{weapon.type}</p>

        <div className="viewport" ref={viewport}>
          <StageBackdrop />
          <SceneBoundary message={`Model ${weapon.name} gagal dimuat.`}>
            {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
            <Canvas flat camera={{ position: [0, 1.15, 3.65], fov: 35 }} dpr={[1, 2]}>
              <Podium theme={theme} />
              <Suspense fallback={null}>
                <WeaponModel url={assetUrl(weapon.model)} onReady={onReady} />
              </Suspense>
              <OrbitControls
                target={[0, 0.8, 0]}
                enablePan={false}
                minDistance={1.2}
                maxDistance={5}
                maxPolarAngle={Math.PI / 1.9}
                autoRotate={!window.SakugaFX?.calm}
                autoRotateSpeed={1.5}
              />
            </Canvas>
            <LoadingOverlay />
          </SceneBoundary>
        </div>
      </section>

      <section className="card dossier" aria-label={`Data ${weapon.name}`} style={colors}>
        <div className="panel">
          <dl className="facts">
            {/* Two stats can share a name: "ATK" as a number and as a percentage. */}
            {weapon.stats.map((stat, index) => (
              <div key={index}>
                <dt>{stat.name} · level awal → maksimum</dt>
                <dd>
                  {stat.min} → {stat.max}
                </dd>
              </div>
            ))}
          </dl>
          {weapon.skill.name && (
            <>
              <h3>{weapon.skill.name}</h3>
              <GameText text={weapon.skill.description} />
              <p className="ranks">Angka yang dipisah garis miring berlaku untuk rank 1 sampai 5.</p>
            </>
          )}
          {weapon.description && (
            <>
              <h4>Kisah</h4>
              <GameText text={weapon.description} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default function Armory() {
  const { id } = useParams()
  const state = useWeapons()

  const weapons = state.status === 'ready' ? state.data : []
  // Without an id, one of the best weapons is on show.
  const current = id
    ? weapons.find((item) => item.id === id)
    : [...weapons].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name))[0]

  return (
    <div className="wrap">
      <header>
        <h1>Armory</h1>
        <p className="lede">Pilih senjata, putar modelnya, lalu baca kemampuan dan kisahnya.</p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
        </p>
      </header>

      <main className="hall">
        <WeaponRack weapons={weapons} currentId={current?.id} />

        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data senjata gagal dimuat ({state.message}). Pastikan file data/weapons.json ada.
          </p>
        )}
        {state.status === 'ready' && !current && <p className="notice">Senjata tidak ditemukan.</p>}
        {current && <Exhibit key={current.id} weapon={current} />}
      </main>

      <Disclaimer />
    </div>
  )
}
