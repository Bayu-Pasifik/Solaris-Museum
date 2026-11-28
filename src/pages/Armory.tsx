import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { useCharacters } from '../lib/characters'
import { entrance, tint } from '../lib/sakuga'
import { rarityTheme, useWeapons, type Weapon } from '../lib/weapons'
import { useTitle } from '../lib/title'
import { useWalkChoice } from '../lib/walkChoice'
import ArmoryWalk from '../components/ArmoryWalk'
import Disclaimer from '../components/Disclaimer'
import LoadingOverlay from '../components/LoadingOverlay'
import Marks from '../components/Marks'
import ModeSwitch from '../components/ModeSwitch'
import SearchButton from '../components/SearchButton'
import SoundButton from '../components/SoundButton'
import StageBackdrop from '../components/StageBackdrop'
import WeaponRack from '../components/WeaponRack'
import WeaponReport from '../components/WeaponReport'
import WeaponViewer from '../components/WeaponViewer'

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
        <h2 lang="en">
          {weapon.name}
          <span>{'★'.repeat(weapon.rarity)}</span>
        </h2>
        <p className="how" lang="en">
          {weapon.type}
        </p>
        <Marks path={`/armory/${weapon.id}`} />

        <div className="viewport" ref={viewport}>
          <StageBackdrop />
          <WeaponViewer weapon={weapon} onReady={onReady} />
          <LoadingOverlay />
        </div>
      </section>

      <section className="card dossier" aria-label={`Data ${weapon.name}`} style={colors}>
        <WeaponReport weapon={weapon} />
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
  useTitle((id && current?.name) || 'Armory')
  const characters = useCharacters()
  const walk = useWalkChoice(characters.status === 'ready' ? characters.data : [])

  if (walk.mode !== 'tour' && state.status !== 'error') {
    if (state.status === 'loading') return <p className="notice">Memuat data…</p>
    return <ArmoryWalk weapons={weapons} currentId={id} walk={walk} />
  }

  return (
    <div className="wrap">
      <header>
        <h1>Armory</h1>
        <p className="lede">Pilih senjata, putar modelnya, lalu baca kemampuan dan kisahnya.</p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
          <SearchButton />
          <SoundButton />
        </p>
        <ModeSwitch walk={walk} onChoose={walk.choose} still="Daftar" />
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
