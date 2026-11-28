import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import { pieceId, pieceName, type Choosable, type SectionId } from '../lib/exhibits'
import { wheel } from '../lib/wheel'
import TitlePlate from './TitlePlate'

type ThumbProps = {
  piece: Choosable
  to: string
  current: boolean
  lit: boolean
  onHover: (over: boolean) => void
}

/** One small copy of a piece. */
function Thumb({ piece, to, current, lit, onHover }: ThumbProps) {
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen piece is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={to}
        className={lit ? 'place lit' : 'place'}
        title={pieceName(piece)}
        aria-current={current ? 'page' : undefined}
        onPointerEnter={() => onHover(true)}
        onPointerLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
      >
        {piece.kind === 'title' ? (
          <TitlePlate title={piece.title} />
        ) : piece.kind === 'card' ? (
          piece.card.picture && (
            <img src={assetUrl(piece.card.picture)} alt="" loading="lazy" />
          )
        ) : (
          piece.group.icon && (
            <img className="emblem" src={assetUrl(piece.group.icon)} alt="" loading="lazy" />
          )
        )}
        <b lang="en">{pieceName(piece)}</b>
        {piece.kind === 'group' && <small lang="en">{piece.category.name}</small>}
      </Link>
    </li>
  )
}

type Props = {
  section: SectionId
  unit: string
  pieces: Choosable[]
  /** Key of the chosen piece. */
  picked?: string
  hovered?: string
  onHover: (key: string | undefined) => void
  query: string
  onQuery: (query: string) => void
}

/** The bar under the hall: the search, and every piece of the open collection. */
export default function GalleryStrip({
  section,
  unit,
  pieces,
  picked,
  hovered,
  onHover,
  query,
  onQuery,
}: Props) {
  const label = section === 'achievement' ? 'Cari nama atau deskripsi' : 'Cari nama'

  return (
    <nav className="strip" aria-label="Daftar koleksi">
      <p className="steer">Seret atau gulir untuk menyusuri · klik untuk melihat</p>
      <div className="finder">
        <input
          type="search"
          aria-label={label}
          placeholder={label}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <span role="status">
          {pieces.length} {unit}
        </span>
      </div>

      {/* A new key starts every list at its beginning. */}
      <ul key={`${section}-${query}`} ref={wheel}>
        {pieces.map((piece) => (
          <Thumb
            key={piece.key}
            piece={piece}
            to={`/gallery/${section}/${pieceId(piece)}`}
            current={piece.key === picked}
            lit={piece.key === hovered}
            onHover={(over) => onHover(over ? piece.key : undefined)}
          />
        ))}
        {pieces.length === 0 && <li>Tidak ditemukan.</li>}
      </ul>
    </nav>
  )
}
