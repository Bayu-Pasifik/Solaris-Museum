import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { pop, type SakugaInput } from '../lib/sakuga'
import { categoryTheme, type Story } from '../lib/stories'

type Props = { stories: Story[]; categories: string[]; current?: Story }

/** The catalog of the Library: categories, search and the stories under their chapters. */
export default function StoryList({ stories, categories, current }: Props) {
  const [query, setQuery] = useState('')
  const list = useRef<HTMLDivElement>(null)

  const search = useCallback((element: SakugaInput | null) => {
    if (!element) return
    const onInput = () => setQuery(element.value)
    element.addEventListener('input', onInput)
    return () => element.removeEventListener('input', onInput)
  }, [])

  const text = query.trim().toLowerCase()
  // A search looks through every category.
  const matches = stories.filter((story) =>
    text
      ? `${story.name} ${story.subtitle} ${story.group}`.toLowerCase().includes(text)
      : story.category === current?.category,
  )
  const groups = new Map<string, Story[]>()
  for (const story of matches) {
    const key = text ? `${story.category} · ${story.group}` : story.group
    groups.set(key, [...(groups.get(key) ?? []), story])
  }

  // The chosen story stays in view when it is picked in the 3D room.
  useEffect(() => {
    const box = list.current
    const item = box?.querySelector<HTMLElement>('[aria-current]')
    if (!box || !item) return
    const top = item.offsetTop - box.offsetTop
    if (top < box.scrollTop || top + item.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = top - box.clientHeight / 3
    }
  }, [current?.id, matches.length])

  return (
    <aside className="card roster catalog">
      <sakuga-input type="search" placeholder="Cari cerita" label="Cari cerita" ref={search} />

      <div className="chips" role="group" aria-label="Kategori">
        <span aria-hidden="true">Kategori</span>
        {categories.map((category) => {
          const first = stories.find((story) => story.category === category)
          return (
            <Link
              key={category}
              to={`/library/${first?.id}`}
              className="pill"
              aria-current={!text && category === current?.category ? 'true' : undefined}
              onClick={(event) => pop(event.currentTarget)}
            >
              <i style={{ background: categoryTheme(categories, category).accent }} />
              {category}
            </Link>
          )
        })}
      </div>

      <p className="count" role="status">
        {matches.length} dari {stories.length} cerita
      </p>

      <div className="entries" ref={list}>
        {[...groups].map(([group, items]) => (
          <section key={group}>
            <h3>{group}</h3>
            <ul>
              {items.map((story) => (
                <li key={story.id}>
                  <Link
                    to={`/library/${story.id}`}
                    aria-current={story.id === current?.id ? 'page' : undefined}
                    onClick={(event) => pop(event.currentTarget)}
                  >
                    <b>{story.name}</b>
                    {/* Side quests have no subtitle, only their summary. */}
                    {story.subtitle && <span>{story.subtitle}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {stories.length > 0 && matches.length === 0 && <p>Tidak ditemukan.</p>}
    </aside>
  )
}
