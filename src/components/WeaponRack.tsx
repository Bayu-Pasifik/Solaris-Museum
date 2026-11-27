import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import { pop, type SakugaInput } from '../lib/sakuga'
import { rarityTheme, type Weapon } from '../lib/weapons'
import Chips, { allows, toggled, unique } from './Chips'

type Filters = { type: string[]; rarity: number[] }

const none: Filters = { type: [], rarity: [] }

/** One weapon: the picture, or the first letter when there is none. */
function Item({ weapon, current }: { weapon: Weapon; current: boolean }) {
  const [missing, setMissing] = useState(false)

  return (
    <li>
      <Link
        to={`/armory/${weapon.id}`}
        className={weapon.rarity === 5 ? 'face five' : 'face'}
        style={{ '--el-accent': rarityTheme(weapon.rarity).accent } as CSSProperties}
        title={`${weapon.name} · ${weapon.type} · ${weapon.rarity}★`}
        aria-current={current ? 'page' : undefined}
        onClick={(event) => pop(event.currentTarget)}
      >
        <span className="portrait">
          {missing ? (
            <b aria-hidden="true">{weapon.name[0]}</b>
          ) : (
            <img
              src={assetUrl(`art/weapons/${weapon.id}.webp`)}
              alt=""
              loading="lazy"
              onError={() => setMissing(true)}
            />
          )}
        </span>
        <span className="name">{weapon.name}</span>
      </Link>
    </li>
  )
}

type Props = { weapons: Weapon[]; currentId?: string }

/** The weapon list of the Armory: search, filters and a grid of pictures, best ones first. */
export default function WeaponRack({ weapons, currentId }: Props) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(none)
  const input = useRef<SakugaInput | null>(null)

  const search = useCallback((element: SakugaInput | null) => {
    input.current = element
    if (!element) return
    const onInput = () => setQuery(element.value)
    element.addEventListener('input', onInput)
    return () => element.removeEventListener('input', onInput)
  }, [])

  const reset = () => {
    setFilters(none)
    setQuery('')
    if (input.current) input.current.value = ''
  }

  const text = query.trim().toLowerCase()
  const matches = weapons
    .filter(
      (item) =>
        item.name.toLowerCase().includes(text) &&
        allows(filters.type, item.type) &&
        allows(filters.rarity, item.rarity),
    )
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name))
  const filtering = text !== '' || Object.values(filters).some((chosen) => chosen.length > 0)

  return (
    <aside className="card roster">
      <sakuga-input type="search" placeholder="Cari senjata" label="Cari senjata" ref={search} />

      {weapons.length > 0 && (
        <>
          <Chips
            label="Jenis"
            options={unique(weapons.map((item) => item.type)).sort()}
            chosen={filters.type}
            onToggle={(value) => setFilters({ ...filters, type: toggled(filters.type, value) })}
          />
          <Chips
            label="Bintang"
            options={unique(weapons.map((item) => item.rarity)).sort((a, b) => b - a)}
            chosen={filters.rarity}
            text={(rarity) => `${rarity}★`}
            color={(rarity) => rarityTheme(rarity).accent}
            onToggle={(value) => setFilters({ ...filters, rarity: toggled(filters.rarity, value) })}
          />

          <p className="count">
            <span role="status">
              {matches.length} dari {weapons.length} senjata
            </span>
            {filtering && (
              <button type="button" className="pill" onClick={reset}>
                Reset
              </button>
            )}
          </p>
        </>
      )}

      <ul>
        {matches.map((item) => (
          <Item key={item.id} weapon={item} current={item.id === currentId} />
        ))}
      </ul>
      {weapons.length > 0 && matches.length === 0 && <p>Tidak ditemukan.</p>}
    </aside>
  )
}
