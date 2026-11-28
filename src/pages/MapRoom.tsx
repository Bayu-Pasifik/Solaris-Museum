import { Suspense, useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { Link, useNavigate, useParams } from 'react-router'
import { regionColors, useWorldMap } from '../lib/map'
import { reveal, useInsets } from '../lib/insets'
import AreaReport from '../components/AreaReport'
import Disclaimer from '../components/Disclaimer'
import LoadingOverlay from '../components/LoadingOverlay'
import MapStrip from '../components/MapStrip'
import SceneBoundary from '../components/SceneBoundary'
import SearchButton from '../components/SearchButton'
import SoundButton from '../components/SoundButton'
import WorldScene, { WORLD_FOV } from '../three/WorldScene'

export default function MapRoom() {
  const params = useParams()
  const navigate = useNavigate()
  const state = useWorldMap()
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState<number>()
  const [pointing, setPointing] = useState(false)
  /** The region whose description is open. */
  const [about, setAbout] = useState<number>()
  const { insets, setTop, setBottom, setDrawer } = useInsets()

  const regions = state.status === 'ready' ? state.data.regions : []
  const region = regions.find((item) => String(item.id) === params.region)
  const area = region?.areas.find((item) => String(item.id) === params.area)
  const describing = !area && region !== undefined && about === region.id
  const colors = regionColors(region?.id)

  // A search looks through every region.
  const text = query.trim().toLowerCase()
  const found = text
    ? regions.flatMap((item) =>
        item.areas
          .filter((entry) =>
            [entry.name, ...entry.reports.flatMap((report) => [report.title, report.text])]
              .join('\n')
              .toLowerCase()
              .includes(text),
          )
          .map((entry) => ({ region: item, area: entry })),
      )
    : undefined

  // Whatever was pointed at is gone after a move, so it does not stay lit.
  const settle = useCallback(() => {
    setHovered(undefined)
    setPointing(false)
    setQuery('')
  }, [])
  const go = (path: string) => {
    settle()
    navigate(path)
  }

  const close = useCallback(() => {
    setAbout(undefined)
    if (params.area) navigate(`/map/${params.region}`)
  }, [navigate, params.area, params.region])

  const reading = Boolean(area) || describing

  useEffect(() => {
    if (!reading) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reading, close])

  const next = area && region?.areas[(region.areas.indexOf(area) + 1) % region.areas.length]

  return (
    <>
      <main
        className={reading ? 'gallery open-hall reading' : 'gallery open-hall'}
        style={
          {
            '--el-deep': colors.deep,
            '--el-pale': colors.pale,
            '--el-accent': colors.accent,
          } as CSSProperties
        }
      >
        <div className={pointing ? 'backdrop sky pointing' : 'backdrop sky'}>
          {state.status === 'ready' && (
            <SceneBoundary message="Peta 3D gagal dimuat.">
              {/* The map is a shortcut for pointers. The bars around it have the same links. */}
              <Canvas
                flat
                aria-hidden="true"
                camera={{ position: [0, 18, 36], fov: WORLD_FOV }}
                dpr={[1, 2]}
              >
                <Suspense fallback={null}>
                  <WorldScene
                    regions={regions}
                    insets={insets}
                    region={region?.id}
                    area={area?.id}
                    hovered={hovered}
                    onHover={setHovered}
                    onPointing={setPointing}
                    onRegion={(id) => go(`/map/${id}`)}
                    onArea={(id, chosen) => go(`/map/${id}/${chosen}`)}
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
            <h1>{region?.name ?? 'Ruang Peta'}</h1>
            <p>
              {region
                ? `${region.areas.length} area`
                : `${regions.length} wilayah · ${regions.flatMap((item) => item.areas).length} area`}
            </p>
          </div>
          {region?.description && !area && (
            <button
              type="button"
              className="pill"
              aria-expanded={describing}
              onClick={() => setAbout(describing ? undefined : region.id)}
            >
              Tentang
            </button>
          )}
          <nav className="switches" aria-label="Wilayah">
            <div>
              {[{ id: undefined, name: 'Seluruh peta' }, ...regions].map((item) => (
                <Link
                  key={item.id ?? 'all'}
                  to={item.id === undefined ? '/map' : `/map/${item.id}`}
                  className="pill"
                  aria-current={item.id === region?.id ? 'page' : undefined}
                  ref={item.id === region?.id ? reveal : undefined}
                  onClick={settle}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        {/* The free space between the bars. The map behind it takes the pointer. */}
        <div className="viewport">
          {state.status === 'loading' && <p className="notice">Memuat data…</p>}
          {state.status === 'error' && (
            <p className="notice" role="alert">
              Data peta gagal dimuat ({state.message}). Pastikan file data/map.json ada.
            </p>
          )}
        </div>

        <div ref={setBottom}>
          <MapStrip
            regions={regions}
            region={region}
            area={area}
            query={query}
            onQuery={setQuery}
            found={found}
            hovered={hovered}
            onHover={setHovered}
            onPick={settle}
          />
          <footer className="gallery-foot">
            <Disclaimer />
          </footer>
        </div>

        {reading && region && (
          // A new key starts every report at its top.
          <aside
            key={area?.id ?? region.id}
            className="drawer"
            aria-label="Keterangan"
            ref={setDrawer}
          >
            <p className="tools">
              {next && next !== area && (
                <Link to={`/map/${region.id}/${next.id}`} className="pill">
                  Area berikutnya →
                </Link>
              )}
              <button type="button" className="pill close" onClick={close}>
                Tutup ✕
              </button>
            </p>
            {area ? (
              <AreaReport area={area} />
            ) : (
              <div className="report">
                <h2>{region.name}</h2>
                <p>{region.description}</p>
              </div>
            )}
          </aside>
        )}
      </main>
    </>
  )
}
