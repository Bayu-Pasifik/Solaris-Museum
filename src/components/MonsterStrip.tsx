import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import { wheel } from '../lib/wheel'
import type { Monster } from '../lib/bestiary'

function Head({ monster, current }: { monster: Monster; current: boolean }) {
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen monster is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={`/bestiary/${monster.id}`}
        className="face"
        title={monster.model ? monster.name : `${monster.name} (tanpa model 3D)`}
        aria-current={current ? 'page' : undefined}
      >
        <span className={monster.model ? 'portrait' : 'portrait flat'}>
          {monster.icon ? (
            <img src={assetUrl(monster.icon)} alt="" loading="lazy" />
          ) : (
            <b>{monster.name[0]}</b>
          )}
        </span>
        <span className="name">{monster.name}</span>
      </Link>
    </li>
  )
}

type Props = {
  monsters: Monster[]
  currentId?: number
  query: string
  onQuery: (query: string) => void
}

/** The bar under the arena: the search, and every monster of the open rank. */
export default function MonsterStrip({ monsters, currentId, query, onQuery }: Props) {
  return (
    <nav className="strip" aria-label="Daftar monster">
      <p className="steer">Seret untuk memutar · gulir untuk mendekat · panah untuk ganti monster</p>
      <div className="finder">
        <input
          type="search"
          aria-label="Cari nama"
          placeholder="Cari nama"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <span role="status">{monsters.length} monster</span>
      </div>

      {/* A new key starts every search at its beginning. */}
      <ul key={query} ref={wheel}>
        {monsters.map((monster) => (
          <Head key={monster.id} monster={monster} current={monster.id === currentId} />
        ))}
        {monsters.length === 0 && <li>Tidak ditemukan.</li>}
      </ul>
    </nav>
  )
}
