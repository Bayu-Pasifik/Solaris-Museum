import { useMemo } from 'react'
import { ordered as orderedMonsters, useBestiary } from './bestiary'
import { useCharacters } from './characters'
import { KINDS as SHELVES, useDocuments } from './documents'
import { KINDS as ECHO_KINDS, ordered as orderedEchoes, useEchoes } from './echoes'
import { useStories } from './stories'
import { useWeapons } from './weapons'

/** What the search looks through, in the order of the results. */
export const GROUPS = {
  character: 'Resonator',
  weapon: 'Senjata',
  monster: 'Monster',
  echo: 'Echo',
  story: 'Cerita',
  document: 'Dokumen',
}

export type Group = keyof typeof GROUPS

export const GROUP_IDS = Object.keys(GROUPS) as Group[]

/** Opens the search box from anywhere. The box listens for this event on the window. */
export const OPEN_SEARCH = 'museum:search'
/** With "starred" the box shows the favorites. */
export const openSearch = (starred = false) =>
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH, { detail: starred }))

export type Hit = {
  group: Group
  /** The page of the entry. */
  to: string
  title: string
  /** Words of the museum before the detail, such as the name of a shelf. */
  label?: string
  /** Words of the game. */
  detail: string
  /** Path inside public/. */
  picture?: string
  /** Long text that is also searched. A match in it is quoted in the result. */
  body: string
  /** The title, and everything else that is searched, ready to compare. */
  name: string
  rest: string
}

/**
 * Lower case without accents. The length stays the same, so a position in the result is
 * also a position in the text.
 */
const fold = (text: string) =>
  text.replace(/[À-ɏ]/g, (letter) => letter.normalize('NFD')[0]).toLowerCase()

/** The text of the game without its marks, on one line. */
const plain = (text: string) =>
  text
    .replace(/<\/?s>/g, '')
    .replace(/^# /gm, '')
    .replace(/\s+/g, ' ')
    .trim()

type Source = Omit<Hit, 'name' | 'rest' | 'body'> & { also?: string[]; body?: string }

function hit({ also = [], body = '', ...shown }: Source): Hit {
  const text = plain(body)
  return {
    ...shown,
    body: text,
    name: fold(shown.title),
    rest: fold([shown.label ?? '', shown.detail, ...also, text].join('\n')),
  }
}

/** The entries that have every word of the query, the best matches first. */
export function search(hits: Hit[], query: string) {
  const text = fold(query.trim())
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  // 0: the title starts with the query; 1: a word of it does; 2: the title has all words;
  // 3: some words are only found elsewhere.
  const rank = ({ name, rest }: Hit) => {
    if (words.every((word) => name.includes(word))) {
      if (name.startsWith(text)) return 0
      return name.includes(` ${text}`) ? 1 : 2
    }
    return words.every((word) => name.includes(word) || rest.includes(word)) ? 3 : undefined
  }

  return hits
    .flatMap((item) => {
      const score = rank(item)
      return score === undefined ? [] : [{ item, score }]
    })
    .sort((a, b) => a.score - b.score)
    .map(({ item }) => item)
}

/** The words around the first match in the long text, when the title does not explain it. */
export function quote({ name, body }: Hit, query: string) {
  const folded = fold(body)
  for (const word of fold(query).split(/\s+/).filter(Boolean)) {
    if (name.includes(word)) continue
    const at = folded.indexOf(word)
    if (at < 0) continue
    const start = Math.max(at - 40, 0)
    const end = at + word.length + 60
    return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`
  }
}

/** Every entry of the museum, from the lists that have loaded so far. */
export function useSearchIndex() {
  const characters = useCharacters()
  const weapons = useWeapons()
  const monsters = useBestiary()
  const echoes = useEchoes()
  const stories = useStories()
  const { state: documentState, documents } = useDocuments()

  const characterHits = useMemo(
    () =>
      characters.status !== 'ready'
        ? []
        : characters.data.map((item) =>
            hit({
              group: 'character',
              to: `/resonator/${item.id}`,
              title: item.name,
              detail: `${item.element} · ${item.weapon} · ${item.rarity}★`,
              picture: `art/faces/${item.id}.webp`,
            }),
          ),
    [characters],
  )
  const weaponHits = useMemo(
    () =>
      weapons.status !== 'ready'
        ? []
        : weapons.data.map((item) =>
            hit({
              group: 'weapon',
              to: `/armory/${item.id}`,
              title: item.name,
              detail: `${item.type} · ${item.rarity}★`,
              picture: `art/weapons/${item.id}.webp`,
              also: [item.skill.name],
            }),
          ),
    [weapons],
  )
  const monsterHits = useMemo(
    () =>
      monsters.status !== 'ready'
        ? []
        : orderedMonsters(monsters.data).map((item) =>
            hit({
              group: 'monster',
              to: `/bestiary/${item.id}`,
              title: item.name,
              detail: `${item.rank} · ${item.element}`,
              picture: item.icon,
            }),
          ),
    [monsters],
  )
  const echoHits = useMemo(() => {
    if (echoes.status !== 'ready') return []
    const sets = new Map(echoes.data.sets.map((set) => [set.id, set.name]))
    return orderedEchoes(echoes.data.echoes).map((item) =>
      hit({
        group: 'echo',
        to: `/echo/${item.id}`,
        title: item.name,
        label: ECHO_KINDS.find((kind) => kind.id === item.kind)?.label,
        detail: `Cost ${item.cost} · ${item.element}`,
        picture: item.icon,
        also: [item.rank, ...item.sets.map((id) => sets.get(id) ?? '')],
      }),
    )
  }, [echoes])
  const storyHits = useMemo(
    () =>
      stories.status !== 'ready'
        ? []
        : stories.data.map((item) =>
            hit({
              group: 'story',
              to: `/library/${item.id}`,
              title: item.name,
              detail: `${item.category} · ${item.group}`,
              picture: item.picture,
              also: [item.subtitle],
              body: item.summary,
            }),
          ),
    [stories],
  )
  const documentHits = useMemo(
    () =>
      documents.map((item) =>
        hit({
          group: 'document',
          to: `/documents/${item.id}`,
          title: item.title,
          label: SHELVES[item.kind],
          detail: item.place ?? item.region ?? '',
          picture: item.picture,
          also: [item.region ?? '', item.source ?? ''],
          body: item.text,
        }),
      ),
    [documents],
  )

  const hits = useMemo(
    () => [
      ...characterHits,
      ...weaponHits,
      ...monsterHits,
      ...echoHits,
      ...storyHits,
      ...documentHits,
    ],
    [characterHits, weaponHits, monsterHits, echoHits, storyHits, documentHits],
  )

  // In the order of GROUPS.
  const states = [characters, weapons, monsters, echoes, stories, documentState]
  return {
    hits,
    loading: states.some((state) => state.status === 'loading'),
    failed: GROUP_IDS.filter((_, index) => states[index].status === 'error'),
  }
}
