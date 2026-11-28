import { useVisits } from '../lib/visits'

/** The signs on an entry of a list: a favorite, and a text that was read. */
export default function MarkBadge({ path }: { path: string }) {
  const favorite = useVisits((visits) => visits.favorites.includes(path))
  const read = useVisits((visits) => visits.read.includes(path))
  if (!favorite && !read) return null
  const label = [favorite && 'favorite', read && 'read'].filter(Boolean).join(', ')

  return (
    <span className="mark-badge" role="img" aria-label={label} title={label}>
      {favorite && '★'}
      {read && '✓'}
    </span>
  )
}
