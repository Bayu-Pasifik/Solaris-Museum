import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { reveal } from '../lib/insets'
import { categoryTheme, useStories } from '../lib/stories'
import { useTitle } from '../lib/title'
import { getVisits, useVisits } from '../lib/visits'
import { unique } from '../components/Chips'
import GroupSelect from '../components/GroupSelect'
import RingHall from '../components/RingHall'
import RingStrip from '../components/RingStrip'
import StoryReader from '../components/StoryReader'
import LibraryScene from '../three/LibraryScene'

export default function Library() {
  const { id } = useParams()
  const state = useStories()
  const [query, setQuery] = useState('')

  const stories = state.status === 'ready' ? state.data : []
  const categories = unique(stories.map((story) => story.category))
  // Without an id, the hall opens at the story that was read last.
  const [last] = useState(() => getVisits().last?.path)
  const current = id
    ? stories.find((story) => story.id === id)
    : (stories.find((story) => `/library/${story.id}` === last) ?? stories[0])
  useTitle((id && current?.name) || 'Library')
  const shelf = stories.filter((story) => story.category === current?.category)
  const index = shelf.findIndex((story) => story.id === current?.id)
  const theme = categoryTheme(categories, current?.category ?? '')
  const groups = unique(shelf.map((story) => story.group))
  const place = useVisits((visits) => visits.pages[`/library/${current?.id}`] ?? 0)
  const done = useVisits(
    (visits) => shelf.filter((story) => visits.read.includes(`/library/${story.id}`)).length,
  )

  const text = query.trim().toLowerCase()
  // A search looks through every category.
  const matches = text
    ? stories.filter((story) =>
        `${story.name} ${story.subtitle} ${story.group}`.toLowerCase().includes(text),
      )
    : shelf

  return (
    <RingHall
      name="archive-hall"
      theme={theme}
      base="/library"
      back={{ to: '/', label: 'Lobby' }}
      title="Library"
      subtitle={
        current ? (
          <>
            {shelf.length} {shelf.length === 1 ? 'story' : 'stories'}
            {done ? ` · ${done} read` : ''} ·{' '}
            <bdi lang="en">{current.category}</bdi>
          </>
        ) : (
          'Story archive'
        )
      }
      links={
        <>
          <Link to="/glossary" className="pill">
            Glossary
          </Link>
          <Link to="/messages" className="pill">
            Messages
          </Link>
          <Link to="/documents" className="pill">
            Documents
          </Link>
        </>
      }
      switches={{
        label: 'Category',
        children: categories.map((category) => {
          const first = stories.find((story) => story.category === category)!
          const chosen = category === current?.category
          return (
            <Link
              key={category}
              to={`/library/${first.id}`}
              className="pill"
              lang="en"
              aria-current={chosen ? 'page' : undefined}
              ref={chosen ? reveal : undefined}
              onClick={() => setQuery('')}
            >
              {category}
            </Link>
          )
        }),
      }}
      ids={shelf.map((story) => story.id)}
      current={current?.id}
      noun="Story"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Loading data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Could not load story data ({state.message}). Check that data/story.json exists.
          </p>
        ) : (
          !current && <p className="notice">Story not found.</p>
        )
      }
      caption={
        current && {
          title: current.name,
          detail: (
            <>
              <bdi lang="en">{current.group}</bdi> · {index + 1} of {shelf.length}
            </>
          ),
          action: place ? `Continue · p. ${place + 1}` : 'Read story',
        }
      }
      scene={(stage) => (
        <LibraryScene {...stage} stories={shelf} current={index} theme={theme} />
      )}
      // The search stays open after a pick, so another result is one click away.
      strip={(pick) => (
        <RingStrip
          label="Story list"
          search="Search stories"
          base="/library"
          entries={matches.map((story) => ({
            id: story.id,
            title: story.name,
            detail: (
              <bdi lang="en">{text ? `${story.category} · ${story.group}` : story.group}</bdi>
            ),
            picture: story.picture,
          }))}
          current={current?.id}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} of ${stories.length} stories`}
          list={text || (current?.category ?? '')}
          hint="Drag or scroll to browse · click a panel to read"
        >
          {!text && groups.length > 1 && (
            <GroupSelect
              label="Chapter"
              groups={groups}
              value={current?.group}
              to={(group) => `/library/${shelf.find((story) => story.group === group)!.id}`}
            />
          )}
        </RingStrip>
      )}
      report={current && <StoryReader story={current} />}
      reportLabel="Script"
    />
  )
}
