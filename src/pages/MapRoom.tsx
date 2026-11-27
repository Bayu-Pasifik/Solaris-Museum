import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { assetUrl } from '../lib/characters'
import { useWorldMap, type Area } from '../lib/map'
import Disclaimer from '../components/Disclaimer'
import GameText from '../components/GameText'

/** One area: its picture and name, and below them the reports that a click opens. */
function AreaCard({ area }: { area: Area }) {
  const [open, setOpen] = useState(false)

  return (
    <li>
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          {area.picture && <img src={assetUrl(area.picture)} alt="" loading="lazy" />}
          <b>{area.name}</b>
        </summary>
        {/* The long texts are only put on the page when they are read. */}
        {open &&
          area.reports.map((report) => (
            <article key={report.id}>
              <h3>{report.title}</h3>
              <small>Terbuka di game pada eksplorasi {report.unlock}%</small>
              <GameText text={report.text} />
            </article>
          ))}
      </details>
    </li>
  )
}

export default function MapRoom() {
  const { region: id } = useParams()
  const state = useWorldMap()
  const [query, setQuery] = useState('')

  const regions = state.status === 'ready' ? state.data.regions : []
  const region = regions.find((item) => String(item.id) === id) ?? regions[0]

  // A search looks through every region; without one, only the chosen region is shown.
  const text = query.trim().toLowerCase()
  const areas = text
    ? regions
        .flatMap((item) => item.areas)
        .filter((area) =>
          [area.name, ...area.reports.flatMap((report) => [report.title, report.text])]
            .join('\n')
            .toLowerCase()
            .includes(text),
        )
    : (region?.areas ?? [])

  return (
    <div className="wrap">
      <header>
        <h1>Ruang Peta</h1>
        <p className="lede">Wilayah Solaris, areanya, dan laporan eksplorasi.</p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
        </p>
      </header>

      <main>
        <div className="toolbar">
          <nav className="links" aria-label="Wilayah">
            {regions.map((item) => (
              <Link
                key={item.id}
                to={`/map/${item.id}`}
                className="pill"
                aria-current={!text && item === region ? 'page' : undefined}
                onClick={() => setQuery('')}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          <input
            type="search"
            aria-label="Cari area atau isi laporan"
            placeholder="Cari area atau isi laporan"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data peta gagal dimuat ({state.message}). Pastikan file data/map.json ada.
          </p>
        )}

        {region && !text && (
          <section className="region">
            {region.logo && <img src={assetUrl(region.logo)} alt="" />}
            <div>
              <h2>{region.name}</h2>
              {region.description && <p>{region.description}</p>}
              <small>{region.areas.length} area</small>
            </div>
          </section>
        )}
        {state.status === 'ready' && areas.length === 0 && (
          <p className="notice">Tidak ditemukan.</p>
        )}
        <ul className="collection areas">
          {areas.map((area) => (
            <AreaCard key={area.id} area={area} />
          ))}
        </ul>
      </main>

      <Disclaimer />
    </div>
  )
}
