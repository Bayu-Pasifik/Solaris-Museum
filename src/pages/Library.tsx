import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { reveal } from '../lib/insets'
import { categoryTheme, useStories } from '../lib/stories'
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
  const current = id ? stories.find((story) => story.id === id) : stories[0]
  const shelf = stories.filter((story) => story.category === current?.category)
  const index = shelf.findIndex((story) => story.id === current?.id)
  const theme = categoryTheme(categories, current?.category ?? '')
  const groups = unique(shelf.map((story) => story.group))

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
      title="Perpustakaan"
      subtitle={current ? `${shelf.length} cerita · ${current.category}` : 'Arsip cerita'}
      links={
        <>
          <Link to="/glossary" className="pill">
            Glosarium
          </Link>
          <Link to="/messages" className="pill">
            Pesan
          </Link>
          <Link to="/documents" className="pill">
            Dokumen
          </Link>
        </>
      }
      switches={{
        label: 'Kategori',
        children: categories.map((category) => {
          const first = stories.find((story) => story.category === category)!
          const chosen = category === current?.category
          return (
            <Link
              key={category}
              to={`/library/${first.id}`}
              className="pill"
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
      noun="Cerita"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Memuat data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Data cerita gagal dimuat ({state.message}). Pastikan file data/story.json ada.
          </p>
        ) : (
          !current && <p className="notice">Cerita tidak ditemukan.</p>
        )
      }
      caption={
        current && {
          title: current.name,
          detail: `${current.group} · ${index + 1} dari ${shelf.length}`,
          action: 'Baca cerita',
        }
      }
      scene={(stage) => (
        <LibraryScene {...stage} stories={shelf} current={index} theme={theme} />
      )}
      // The search stays open after a pick, so another result is one click away.
      strip={(pick) => (
        <RingStrip
          label="Daftar cerita"
          search="Cari cerita"
          base="/library"
          entries={matches.map((story) => ({
            id: story.id,
            title: story.name,
            detail: text ? `${story.category} · ${story.group}` : story.group,
            picture: story.picture,
          }))}
          current={current?.id}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} dari ${stories.length} cerita`}
          list={text || (current?.category ?? '')}
          hint="Seret atau gulir untuk menyusuri · klik panel untuk membaca"
        >
          {!text && groups.length > 1 && (
            <GroupSelect
              label="Bab"
              groups={groups}
              value={current?.group}
              to={(group) => `/library/${shelf.find((story) => story.group === group)!.id}`}
            />
          )}
        </RingStrip>
      )}
      report={current && <StoryReader story={current} />}
      reportLabel="Naskah"
    />
  )
}
