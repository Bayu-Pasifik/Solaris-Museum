import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { assetUrl } from '../lib/characters'
import { useGallery, type AchievementCategory, type Namecard, type Title } from '../lib/gallery'
import Disclaimer from '../components/Disclaimer'

const SECTIONS = [
  { id: 'namecard', label: 'Namecard' },
  { id: 'title', label: 'Title' },
  { id: 'achievement', label: 'Achievement' },
]

/** A picture that loads when it comes near. Without a file it takes no room. */
function Picture({ path, className }: { path?: string; className?: string }) {
  if (!path) return null
  return <img className={className} src={assetUrl(path)} alt="" loading="lazy" />
}

function Cards({ cards }: { cards: Namecard[] }) {
  return (
    <ul className="collection cards">
      {cards.map((card) => (
        <li key={card.id}>
          {/* The link opens the picture at its full size. */}
          <a href={card.picture && assetUrl(card.picture)} target="_blank" rel="noreferrer">
            <Picture path={card.picture} />
            <span>{card.name}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function Titles({ titles }: { titles: Title[] }) {
  return (
    <ul className="collection titles">
      {titles.map((title) => (
        <li key={title.id} className="title-plate">
          <Picture path={title.background} className="background" />
          <Picture path={title.left} className="left" />
          <Picture path={title.right} className="right" />
          <Picture path={title.avatar} className="avatar" />
          <span>{title.name}</span>
        </li>
      ))}
    </ul>
  )
}

function Achievements({ categories }: { categories: AchievementCategory[] }) {
  return (
    <>
      {categories.map((category) => (
        <section key={category.id} className="achievements">
          <Picture path={category.picture} className="keyart" />
          <div>
            <h2>{category.name}</h2>
            <ul className="collection groups">
              {category.groups.map((group) => (
                <li key={group.id}>
                  <Picture path={group.icon} />
                  <p>
                    <b>{group.name}</b>
                    {group.count} achievement
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </>
  )
}

export default function Gallery() {
  const { section = SECTIONS[0].id } = useParams()
  const state = useGallery()
  const [query, setQuery] = useState('')

  const text = query.trim().toLowerCase()
  const matching = <T extends { name: string }>(items: T[]) =>
    items.filter((item) => item.name.toLowerCase().includes(text))

  const data = state.status === 'ready' ? state.data : undefined
  const cards = matching(data?.cards ?? [])
  const titles = matching(data?.titles ?? [])
  // A category stays when one of its groups matches.
  const achievements = (data?.achievements ?? [])
    .map((category) => ({ ...category, groups: matching(category.groups) }))
    .filter((category) => category.groups.length > 0)
  const view =
    section === 'title'
      ? { found: titles.length, list: <Titles titles={titles} /> }
      : section === 'achievement'
        ? { found: achievements.length, list: <Achievements categories={achievements} /> }
        : { found: cards.length, list: <Cards cards={cards} /> }

  return (
    <div className="wrap">
      <header>
        <h1>Galeri</h1>
        <p className="lede">Koleksi namecard, title, dan achievement.</p>
        <p className="links">
          <Link to="/" className="pill">
            ← Lobby
          </Link>
        </p>
      </header>

      <main>
        <div className="toolbar">
          <nav className="links" aria-label="Jenis koleksi">
            {SECTIONS.map((item) => (
              <Link
                key={item.id}
                to={`/gallery/${item.id}`}
                className="pill"
                aria-current={item.id === section ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <input
            type="search"
            aria-label="Cari nama"
            placeholder="Cari nama"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data galeri gagal dimuat ({state.message}). Pastikan file data/gallery.json ada.
          </p>
        )}
        {data && view.found === 0 && <p className="notice">Tidak ditemukan.</p>}
        {view.list}
      </main>

      <Disclaimer />
    </div>
  )
}
