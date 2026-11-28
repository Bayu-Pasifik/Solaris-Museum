import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { assetUrl } from '../lib/characters'
import type { Story } from '../lib/stories'
import { wheel } from '../lib/wheel'
import { unique } from './Chips'

type ThumbProps = { story: Story; current: boolean; place: string; onPick: () => void }

/** One story in the strip, with the chapter it belongs to. */
function Thumb({ story, current, place, onPick }: ThumbProps) {
  const item = useRef<HTMLLIElement>(null)

  // The strip is long, so the chosen story is brought into sight.
  useEffect(() => {
    if (current) item.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [current])

  return (
    <li ref={item}>
      <Link
        to={`/library/${story.id}`}
        className="volume"
        title={story.name}
        aria-current={current ? 'page' : undefined}
        onClick={onPick}
      >
        {story.picture && (
          <img
            src={assetUrl(story.picture)}
            alt=""
            loading="lazy"
            onError={(event) => (event.currentTarget.hidden = true)}
          />
        )}
        <b>{story.name}</b>
        <small>{place}</small>
      </Link>
    </li>
  )
}

type Props = {
  stories: Story[]
  current?: Story
  query: string
  onQuery: (query: string) => void
  /** A story was chosen in the strip. */
  onPick: () => void
  /** Another chapter was chosen; the argument is its first story. */
  onChapter: (id: string) => void
}

/** The bar under the hall: the search, the chapters, and the stories of the open category. */
export default function StoryStrip({
  stories,
  current,
  query,
  onQuery,
  onPick,
  onChapter,
}: Props) {
  const text = query.trim().toLowerCase()
  const shelf = stories.filter((story) => story.category === current?.category)
  const groups = unique(shelf.map((story) => story.group))
  // A search looks through every category.
  const matches = text
    ? stories.filter((story) =>
        `${story.name} ${story.subtitle} ${story.group}`.toLowerCase().includes(text),
      )
    : shelf

  return (
    <nav className="strip" aria-label="Daftar cerita">
      <p className="steer">Seret atau gulir untuk menyusuri · klik panel untuk membaca</p>
      <div className="finder">
        <input
          type="search"
          aria-label="Cari cerita"
          placeholder="Cari cerita"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {!text && groups.length > 1 && (
          <select
            aria-label="Bab"
            value={current?.group}
            onChange={(event) =>
              onChapter(shelf.find((story) => story.group === event.target.value)!.id)
            }
          >
            {groups.map((group) => (
              <option key={group}>{group}</option>
            ))}
          </select>
        )}
        <span role="status">
          {matches.length} dari {stories.length} cerita
        </span>
      </div>

      {/* A new key starts every list at its beginning. */}
      <ul key={text || current?.category} ref={wheel}>
        {matches.map((story) => (
          <Thumb
            key={story.id}
            story={story}
            current={story.id === current?.id}
            place={text ? `${story.category} · ${story.group}` : story.group}
            onPick={onPick}
          />
        ))}
        {matches.length === 0 && <li>Tidak ditemukan.</li>}
      </ul>
    </nav>
  )
}
