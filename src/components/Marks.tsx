import { pop } from '../lib/sakuga'
import { toggleFavorite, toggleRead, useVisits } from '../lib/visits'

type Props = {
  /** The path of the page of the entry. */
  path: string
  /** Whether the entry is a text that can be marked as read. */
  readable?: boolean
}

/** The buttons that keep an entry as a favorite, and mark a text as read. */
export default function Marks({ path, readable }: Props) {
  const favorite = useVisits((visits) => visits.favorites.includes(path))
  const read = useVisits((visits) => visits.read.includes(path))

  return (
    <p className="marks">
      <button
        type="button"
        className="pill"
        aria-pressed={favorite}
        onClick={(event) => {
          pop(event.currentTarget)
          toggleFavorite(path)
        }}
      >
        <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
        Favorit
      </button>
      {readable && (
        <button
          type="button"
          className={read ? 'pill done' : 'pill'}
          onClick={(event) => {
            pop(event.currentTarget)
            toggleRead(path)
          }}
        >
          {read ? '✓ Sudah dibaca · batalkan' : 'Tandai sudah dibaca'}
        </button>
      )}
    </p>
  )
}
