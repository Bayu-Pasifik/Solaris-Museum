import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import { wheel } from '../lib/wheel'
import MarkBadge from './MarkBadge'
import type { Echo } from '../lib/echoes'

function Head({ echo, current }: { echo: Echo; current: boolean }) {
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen echo is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={`/echo/${echo.id}`}
        className="face"
        title={echo.monster ? echo.name : `${echo.name} (tanpa model 3D)`}
        aria-current={current ? 'page' : undefined}
      >
        <span className={echo.monster ? 'portrait' : 'portrait flat'}>
          {echo.icon ? (
            <img src={assetUrl(echo.icon)} alt="" loading="lazy" />
          ) : (
            <b>{echo.name[0]}</b>
          )}
        </span>
        <span className="name" lang="en">
          {echo.name}
        </span>
        <MarkBadge path={`/echo/${echo.id}`} />
      </Link>
    </li>
  )
}

type Props = {
  echoes: Echo[]
  currentId?: number
  query: string
  onQuery: (query: string) => void
  /** Names the list; a new name starts it at its beginning. */
  list: string
  /** The filters under the search. */
  children: ReactNode
}

/** The bar under the chamber: the search, the filters, and the echoes that pass them. */
export default function EchoStrip({ echoes, currentId, query, onQuery, list, children }: Props) {
  return (
    <nav className="strip" aria-label="Daftar echo">
      <p className="steer">Seret untuk memutar · gulir untuk mendekat · panah untuk ganti echo</p>
      <div className="finder">
        <input
          type="search"
          aria-label="Cari nama"
          placeholder="Cari nama"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {children}
        <span role="status">{echoes.length} echo</span>
      </div>

      <ul key={list} ref={wheel}>
        {echoes.map((echo) => (
          <Head key={echo.id} echo={echo} current={echo.id === currentId} />
        ))}
        {echoes.length === 0 && <li>Tidak ditemukan.</li>}
      </ul>
    </nav>
  )
}
