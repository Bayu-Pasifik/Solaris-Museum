import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { assetUrl, type Character } from '../lib/characters'
import { elementNames, themeOf } from '../lib/elements'
import { pop, type SakugaInput } from '../lib/sakuga'
import { wheel } from '../lib/wheel'
import Chips, { allows, toggled, unique } from './Chips'
import MarkBadge from './MarkBadge'

type Filters = { element: string[]; weapon: string[]; rarity: number[] }

const none: Filters = { element: [], weapon: [], rarity: [] }

type FaceProps = { character: Character; current: boolean }

/** One character: the face, or the first letter when there is no picture. */
function Face({ character, current }: FaceProps) {
  const [missing, setMissing] = useState(false)
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen face is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={`/resonator/${character.id}`}
        className={character.rarity === 5 ? 'face five' : 'face'}
        style={{ '--el-accent': themeOf(character.element).accent } as CSSProperties}
        title={`${character.name} · ${character.element} · ${character.weapon} · ${character.rarity}★`}
        aria-current={current ? 'page' : undefined}
        onClick={(event) => pop(event.currentTarget)}
      >
        <span className="portrait">
          {missing ? (
            <b aria-hidden="true">{character.name[0]}</b>
          ) : (
            <img
              src={assetUrl(`art/faces/${character.id}.webp`)}
              alt=""
              loading="lazy"
              onError={() => setMissing(true)}
            />
          )}
        </span>
        <span className="name">{character.name}</span>
        <MarkBadge path={`/resonator/${character.id}`} />
      </Link>
    </li>
  )
}

type Props = { characters: Character[]; currentId?: string }

/** The character list of the Resonator hall: search, filters and a strip of faces. */
export default function Roster({ characters, currentId }: Props) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(none)
  const [open, setOpen] = useState(false)
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
  const matches = characters.filter(
    (item) =>
      item.name.toLowerCase().includes(text) &&
      allows(filters.element, item.element) &&
      allows(filters.weapon, item.weapon) &&
      allows(filters.rarity, item.rarity),
  )
  const chosen = Object.values(filters).flat().length
  const filtering = text !== '' || chosen > 0

  // Known elements keep a fixed order; unknown ones come last.
  const elements = unique(characters.map((item) => item.element)).sort(
    (a, b) => (elementNames.indexOf(a) >>> 0) - (elementNames.indexOf(b) >>> 0),
  )

  return (
    <nav className="strip" aria-label="Daftar karakter">
      <div className="finder">
        <sakuga-input type="search" placeholder="Cari karakter" label="Cari karakter" ref={search} />
        <p className="count">
          <button
            type="button"
            className="pill"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            Filter{chosen > 0 && ` (${chosen})`}
          </button>
          <span role="status">
            {matches.length}/{characters.length}
          </span>
          {filtering && (
            <button type="button" className="pill" onClick={reset}>
              Reset
            </button>
          )}
        </p>
      </div>

      {open && characters.length > 0 && (
        <div className="filters">
          <Chips
            label="Elemen"
            options={elements}
            chosen={filters.element}
            color={(element) => themeOf(element).accent}
            onToggle={(value) =>
              setFilters({ ...filters, element: toggled(filters.element, value) })
            }
          />
          <Chips
            label="Senjata"
            options={unique(characters.map((item) => item.weapon)).sort()}
            chosen={filters.weapon}
            onToggle={(value) => setFilters({ ...filters, weapon: toggled(filters.weapon, value) })}
          />
          <Chips
            label="Bintang"
            options={unique(characters.map((item) => item.rarity)).sort((a, b) => b - a)}
            chosen={filters.rarity}
            text={(rarity) => `${rarity}★`}
            onToggle={(value) => setFilters({ ...filters, rarity: toggled(filters.rarity, value) })}
          />
        </div>
      )}

      <ul ref={wheel}>
        {matches.map((item) => (
          <Face key={item.id} character={item} current={item.id === currentId} />
        ))}
        {characters.length > 0 && matches.length === 0 && <li>Tidak ditemukan.</li>}
      </ul>
    </nav>
  )
}
