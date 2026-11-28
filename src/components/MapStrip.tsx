import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import type { Area, Region } from '../lib/map'
import { wheel } from '../lib/wheel'

export type Found = { region: Region; area: Area }

type PlaceProps = {
  to: string
  name: string
  note?: string
  picture?: string
  /** The picture is the white emblem of a region. */
  emblem?: boolean
  current?: boolean
  lit?: boolean
  onHover?: (over: boolean) => void
  onPick: () => void
}

/** One card of the strip: a region or an area. */
function Place({ to, name, note, picture, emblem, current, lit, onHover, onPick }: PlaceProps) {
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen area is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={to}
        className={lit ? 'place lit' : 'place'}
        title={name}
        aria-current={current ? 'page' : undefined}
        onClick={onPick}
        onPointerEnter={() => onHover?.(true)}
        onPointerLeave={() => onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
      >
        {picture && (
          <img
            src={assetUrl(picture)}
            className={emblem ? 'emblem' : undefined}
            alt=""
            loading="lazy"
          />
        )}
        <b>{name}</b>
        {note && <small>{note}</small>}
      </Link>
    </li>
  )
}

type Props = {
  regions: Region[]
  region?: Region
  area?: Area
  query: string
  onQuery: (query: string) => void
  /** The areas that match the search. It is absent when nothing is searched. */
  found?: Found[]
  hovered?: number
  onHover: (area: number | undefined) => void
  /** Called when a card is chosen. */
  onPick: () => void
}

/** The bar under the map: the search, and the cards of the regions or of the areas. */
export default function MapStrip({
  regions,
  region,
  area,
  query,
  onQuery,
  found,
  hovered,
  onHover,
  onPick,
}: Props) {
  const places = found ?? (region ? region.areas.map((item) => ({ region, area: item })) : undefined)

  return (
    <nav className="strip" aria-label="Daftar tempat">
      <p className="steer">Seret untuk memutar · gulir atau cubit untuk memperbesar</p>
      <div className="finder">
        <input
          type="search"
          aria-label="Cari area atau isi laporan"
          placeholder="Cari area atau isi laporan"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <span role="status">
          {places ? `${places.length} area` : regions.length > 0 && `${regions.length} wilayah`}
        </span>
      </div>

      {/* A new key starts every list at its beginning. */}
      <ul key={found ? 'search' : (region?.id ?? 'all')} ref={wheel}>
        {places
          ? places.map((item) => (
              <Place
                key={item.area.id}
                to={`/map/${item.region.id}/${item.area.id}`}
                name={item.area.name}
                note={found ? item.region.name : undefined}
                picture={item.area.picture}
                current={item.area.id === area?.id}
                lit={item.area.id === hovered}
                onHover={(over) => onHover(over ? item.area.id : undefined)}
                onPick={onPick}
              />
            ))
          : regions.map((item) => (
              <Place
                key={item.id}
                to={`/map/${item.id}`}
                name={item.name}
                note={`${item.areas.length} area`}
                picture={item.logo}
                emblem
                onPick={onPick}
              />
            ))}
        {places?.length === 0 && <li>Tidak ditemukan.</li>}
      </ul>
    </nav>
  )
}
