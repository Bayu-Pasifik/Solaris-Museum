import { memo, useCallback, useDeferredValue, useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import { GROUP_IDS, GROUPS, quote, search, useSearchIndex, type Group, type Hit } from '../lib/search'
import { useVisits } from '../lib/visits'
import MarkBadge from './MarkBadge'

/** Results of one group when all groups are shown. */
const PREVIEW = 5

type RowProps = { hit: Hit; query: string; onPick: (event: MouseEvent) => void }

/** Memoized: a quote reads a whole text, and a list can have hundreds of rows. */
const Row = memo(function Row({ hit, query, onPick }: RowProps) {
  const found = quote(hit, query)
  return (
    <li>
      <Link to={hit.to} className="hit" onClick={onPick}>
        <span className="thumb">
          {hit.picture && (
            <img
              // A new key, so a hidden picture does not hide the next one.
              key={hit.picture}
              src={assetUrl(hit.picture)}
              alt=""
              loading="lazy"
              onError={(event) => (event.currentTarget.hidden = true)}
            />
          )}
        </span>
        <span>
          <b>
            {hit.title}
            <MarkBadge path={hit.to} />
          </b>
          <small>{hit.detail}</small>
          {found && <q>{found}</q>}
        </span>
      </Link>
    </li>
  )
})

type Props = {
  /** Only the favorites are shown, also without a query. */
  starred: boolean
  onStarred: (starred: boolean) => void
  onClose: () => void
}

/** The inside of the search box: the field, the groups and the results. */
export default function SearchPanel({ starred, onStarred, onClose }: Props) {
  const { hits, loading, failed } = useSearchIndex()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<Group>()
  // Typing stays smooth while a long list of results is drawn.
  const sought = useDeferredValue(query)
  const favorites = useVisits((visits) => visits.favorites)
  const asked = sought.trim() !== ''
  const found = useMemo(() => {
    if (!starred) return search(hits, sought)
    const kept = hits.filter((item) => favorites.includes(item.to))
    return asked ? search(kept, sought) : kept
  }, [hits, sought, asked, starred, favorites])
  const members = (id: Group) => found.filter((item) => item.group === id)
  const listing = asked || starred
  const count = (group ? members(group) : found).length

  // A click that opens a new tab leaves the box open.
  const pick = useCallback(
    (event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) onClose()
    },
    [onClose],
  )

  return (
    <>
      <div className="search-head">
        <input
          type="search"
          aria-label="Cari di seluruh museum"
          placeholder="Cari karakter, senjata, monster, echo, cerita, dokumen"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="pill" onClick={onClose}>
          Tutup ✕
        </button>
      </div>

      <div className="search-groups" role="group" aria-label="Kategori">
        <button
          type="button"
          className="pill"
          aria-pressed={starred}
          onClick={() => onStarred(!starred)}
        >
          <span aria-hidden="true">{starred ? '★' : '☆'}</span>
          Favorit
        </button>
        {[undefined, ...GROUP_IDS].map((id) => (
          <button
            key={id ?? 'all'}
            type="button"
            className="pill"
            aria-pressed={group === id}
            onClick={() => setGroup(id)}
          >
            {id ? GROUPS[id] : 'Semua'}
            {listing && <small>{id ? members(id).length : found.length}</small>}
          </button>
        ))}
      </div>

      <p className="search-status" role="status">
        {loading
          ? 'Memuat data…'
          : !listing
            ? 'Ketik nama atau kata. Isi dokumen dan ringkasan cerita ikut dicari.'
            : count > 0
              ? `${count} hasil`
              : starred && !asked
                ? 'Belum ada favorit di sini. Buka sebuah koleksi, lalu tekan ☆ Favorit.'
                : 'Tidak ditemukan.'}
      </p>
      {failed.length > 0 && (
        <p className="search-status" role="alert">
          Data {failed.map((id) => GROUPS[id]).join(', ')} gagal dimuat. Muat ulang halaman untuk
          mencoba lagi.
        </p>
      )}

      {/* A new key starts every search at the top of the list. */}
      <div className="search-results" key={`${starred} ${group} ${sought}`}>
        {(group ? [group] : GROUP_IDS).map((id) => {
          const all = members(id)
          if (all.length === 0) return null
          const shown = group ? all : all.slice(0, PREVIEW)
          return (
            <section key={id} aria-label={GROUPS[id]}>
              <h3>{GROUPS[id]}</h3>
              <ul>
                {shown.map((item) => (
                  <Row key={item.to} hit={item} query={sought} onPick={pick} />
                ))}
              </ul>
              {shown.length < all.length && (
                <button type="button" className="pill" onClick={() => setGroup(id)}>
                  Lihat semua {all.length} →
                </button>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
