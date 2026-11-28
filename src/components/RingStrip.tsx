import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import { wheel } from '../lib/wheel'
import MarkBadge from './MarkBadge'

export type Entry = {
  id: string
  title: string
  detail: ReactNode
  /** Path inside public/. */
  picture?: string
  /** Shown above the title instead of a picture. */
  lead?: ReactNode
}

type ThumbProps = { entry: Entry; to: string; current: boolean; onPick: () => void }

function Thumb({ entry, to, current, onPick }: ThumbProps) {
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen entry is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={to}
        className="volume"
        title={entry.title}
        aria-current={current ? 'page' : undefined}
        onClick={onPick}
      >
        {entry.lead}
        {entry.picture && (
          <img
            src={assetUrl(entry.picture)}
            alt=""
            loading="lazy"
            onError={(event) => (event.currentTarget.hidden = true)}
          />
        )}
        <b lang="en">{entry.title}</b>
        <MarkBadge path={to} />
        <small>{entry.detail}</small>
      </Link>
    </li>
  )
}

type Props = {
  /** Name of the list for screen readers. */
  label: string
  /** Label of the search field. */
  search: string
  base: string
  entries: Entry[]
  current?: string
  query: string
  onQuery: (query: string) => void
  onPick: () => void
  count: string
  /** Names the list; a new name starts it at its beginning. */
  list: string
  hint: string
  /** More controls under the search. */
  children?: ReactNode
}

/** The bar under a ring hall: the search, and every entry of the open group. */
export default function RingStrip({
  label,
  search,
  base,
  entries,
  current,
  query,
  onQuery,
  onPick,
  count,
  list,
  hint,
  children,
}: Props) {
  return (
    <nav className="strip" aria-label={label}>
      <p className="steer">{hint}</p>
      <div className="finder">
        <input
          type="search"
          aria-label={search}
          placeholder={search}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {children}
        <span role="status">{count}</span>
      </div>

      <ul key={list} ref={wheel}>
        {entries.map((entry) => (
          <Thumb
            key={entry.id}
            entry={entry}
            to={`${base}/${entry.id}`}
            current={entry.id === current}
            onPick={onPick}
          />
        ))}
        {entries.length === 0 && <li>Nothing found.</li>}
      </ul>
    </nav>
  )
}
