import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { assetUrl, type Character } from '../lib/characters'
import { elementNames, themeOf } from '../lib/elements'
import { pop, type SakugaInput } from '../lib/sakuga'

type Filters = { element: string[]; weapon: string[]; rarity: number[] }

const none: Filters = { element: [], weapon: [], rarity: [] }

/** An empty choice lets every value through. */
const allows = <T,>(chosen: T[], value: T) => chosen.length === 0 || chosen.includes(value)

const toggled = <T,>(chosen: T[], value: T) =>
  chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value]

const unique = <T,>(values: T[]) => [...new Set(values)]

function Chips<T extends string | number>({
  label,
  options,
  chosen,
  onToggle,
  text = String,
  color,
}: {
  label: string
  options: T[]
  chosen: T[]
  onToggle: (value: T) => void
  text?: (value: T) => string
  /** Color of the dot in front of the text. */
  color?: (value: T) => string
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <span aria-hidden="true">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="pill"
          aria-pressed={chosen.includes(option)}
          onClick={() => onToggle(option)}
        >
          {color && <i style={{ background: color(option) }} />}
          {text(option)}
        </button>
      ))}
    </div>
  )
}

/** One character: the face, or the first letter when there is no picture. */
function Face({ character, current }: { character: Character; current: boolean }) {
  const [missing, setMissing] = useState(false)

  return (
    <li>
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
      </Link>
    </li>
  )
}

type Props = {
  characters: Character[]
  currentId?: string
}

/** The character list of the hall: search, filters and a grid of faces. */
export default function Roster({ characters, currentId }: Props) {
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
  const matches = characters.filter(
    (item) =>
      item.name.toLowerCase().includes(text) &&
      allows(filters.element, item.element) &&
      allows(filters.weapon, item.weapon) &&
      allows(filters.rarity, item.rarity),
  )
  const filtering = text !== '' || Object.values(filters).some((chosen) => chosen.length > 0)

  // Known elements keep a fixed order; unknown ones come last.
  const elements = unique(characters.map((item) => item.element)).sort(
    (a, b) => (elementNames.indexOf(a) >>> 0) - (elementNames.indexOf(b) >>> 0),
  )

  return (
    <aside className="card roster">
      <sakuga-input type="search" placeholder="Cari karakter" label="Cari karakter" ref={search} />

      {characters.length > 0 && (
        <>
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

          <p className="count">
            <span role="status">
              {matches.length} dari {characters.length} karakter
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
          <Face key={item.id} character={item} current={item.id === currentId} />
        ))}
      </ul>
      {characters.length > 0 && matches.length === 0 && <p>Tidak ditemukan.</p>}
    </aside>
  )
}
