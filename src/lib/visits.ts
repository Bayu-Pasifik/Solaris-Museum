import { useSyncExternalStore } from 'react'

/**
 * What the museum remembers about the visitor, kept in this browser only. An entry is named by
 * the path of its page, for example "/library/139000001".
 */
export type Visits = {
  favorites: string[]
  read: string[]
  /** The page of the script where the reader stopped, counted from 0, by story path. */
  pages: Record<string, number>
  /** The story that was open last. */
  last?: { path: string; name: string }
}

const KEY = 'solaris-museum:visits'
const EMPTY: Visits = { favorites: [], read: [], pages: {} }

const paths = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** The saved text can be old, broken or edited by hand, so every field is checked. */
function parse(text: string | null): Visits {
  try {
    const data = JSON.parse(text ?? '{}') as Partial<Visits> | null
    const { path, name } = data?.last ?? {}
    return {
      favorites: paths(data?.favorites),
      read: paths(data?.read),
      pages: Object.fromEntries(
        Object.entries(data?.pages ?? {}).filter(
          ([, page]) => Number.isInteger(page) && page > 0,
        ),
      ),
      last: typeof path === 'string' && typeof name === 'string' ? { path, name } : undefined,
    }
  } catch {
    return EMPTY
  }
}

// A browser can forbid the storage. The museum then remembers until the page is closed.
function load() {
  try {
    return parse(localStorage.getItem(KEY))
  } catch {
    return EMPTY
  }
}

let visits = load()
const listeners = new Set<() => void>()

function show(next: Visits) {
  visits = next
  listeners.forEach((listener) => listener())
}

function save(next: Visits) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // A full or forbidden storage; see "load".
  }
  show(next)
}

// Another tab of the museum has saved.
window.addEventListener('storage', (event) => {
  if (event.key === KEY || event.key === null) show(load())
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getVisits = () => visits

/**
 * One value out of the memory. The component only renders again when that value changes, so
 * "pick" must return the same value for the same memory.
 */
export const useVisits = <T>(pick: (visits: Visits) => T) =>
  useSyncExternalStore(subscribe, () => pick(visits))

const toggled = (list: string[], path: string) =>
  list.includes(path) ? list.filter((item) => item !== path) : [...list, path]

const without = (pages: Visits['pages'], path: string) => {
  const rest = { ...pages }
  delete rest[path]
  return rest
}

export const toggleFavorite = (path: string) =>
  save({ ...visits, favorites: toggled(visits.favorites, path) })

/** A story that is marked as read starts at its first page the next time. */
export const toggleRead = (path: string) =>
  save({
    ...visits,
    read: toggled(visits.read, path),
    pages: visits.read.includes(path) ? visits.pages : without(visits.pages, path),
  })

/** Remembers the open page of a story, and that it was the last one. */
export function keepPlace(path: string, name: string, page: number) {
  const { last, pages } = visits
  if (last?.path === path && (pages[path] ?? 0) === page) return
  save({
    ...visits,
    pages: page > 0 ? { ...pages, [path]: page } : without(pages, path),
    last: { path, name },
  })
}
