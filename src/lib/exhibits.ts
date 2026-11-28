import type { AchievementCategory, AchievementGroup, Gallery, Namecard, Title } from './gallery'

/** One thing that hangs on the wall of the Gallery. */
export type Piece =
  | { kind: 'card'; key: string; card: Namecard }
  | { kind: 'title'; key: string; title: Title }
  | { kind: 'group'; key: string; group: AchievementGroup; category: AchievementCategory }
  /** The key art in front of the groups of a category. It cannot be chosen. */
  | { kind: 'banner'; key: string; category: AchievementCategory }

export type Choosable = Exclude<Piece, { kind: 'banner' }>

export const SECTIONS = [
  {
    id: 'namecard',
    label: 'Namecard',
    unit: 'namecard',
    colors: { deep: '#0f6f63', accent: '#4fd1b5', pale: '#d8f7f0' },
  },
  {
    id: 'title',
    label: 'Title',
    unit: 'title',
    colors: { deep: '#8a4b00', accent: '#ffb02e', pale: '#fff0cf' },
  },
  {
    id: 'achievement',
    label: 'Achievement',
    unit: 'grup achievement',
    colors: { deep: '#a02565', accent: '#ff5fa8', pale: '#ffe1ee' },
  },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export const pieceName = (piece: Choosable) =>
  piece.kind === 'card'
    ? piece.card.name
    : piece.kind === 'title'
      ? piece.title.name
      : piece.group.name

export const pieceId = (piece: Choosable) =>
  piece.kind === 'card' ? piece.card.id : piece.kind === 'title' ? piece.title.id : piece.group.id

/** The achievements of a group that have the text in their name or description. */
export const matches = (group: AchievementGroup, text: string) =>
  group.achievements.filter((item) =>
    `${item.name}\n${item.description}`.toLowerCase().includes(text),
  )

/** What hangs on the wall: the whole collection of a section, or what a search finds in it. */
export function pieces(data: Gallery, section: SectionId, text: string): Piece[] {
  const named = (name: string) => name.toLowerCase().includes(text)
  if (section === 'namecard') {
    return data.cards
      .filter((card) => named(card.name))
      .map((card) => ({ kind: 'card', key: `card-${card.id}`, card }))
  }
  if (section === 'title') {
    return data.titles
      .filter((title) => named(title.name))
      .map((title) => ({ kind: 'title', key: `title-${title.id}`, title }))
  }
  return data.achievements.flatMap((category): Piece[] => {
    const groups = category.groups.filter(
      (group) => named(group.name) || matches(group, text).length > 0,
    )
    if (groups.length === 0) return []
    return [
      { kind: 'banner', key: `banner-${category.id}`, category },
      ...groups.map(
        (group): Piece => ({ kind: 'group', key: `group-${group.id}`, group, category }),
      ),
    ]
  })
}

/** A piece with its place on the wall. "x" runs along the wall, "y" up from its middle. */
export type Hung = { piece: Piece; x: number; y: number; width: number; height: number }

const SIZES = {
  card: { width: 3.5, height: 2.1, gap: 0.3, rows: { wide: 3, narrow: 4 } },
  title: { width: 3.7, height: 0.9, gap: 0.22, rows: { wide: 5, narrow: 7 } },
  group: { width: 2.4, height: 2.9, gap: 0.3, rows: { wide: 2, narrow: 3 } },
}
/** The key art is 408 x 1100. */
const BANNER = 408 / 1100

/**
 * Hangs the pieces in columns, from the left to the right. A banner takes a column of its own,
 * as high as the rows beside it. It also returns the height of the whole wall.
 */
export function hang(list: Piece[], narrow: boolean) {
  const kind = list.find((piece): piece is Choosable => piece.kind !== 'banner')?.kind ?? 'card'
  const size = SIZES[kind]
  const most = size.rows[narrow ? 'narrow' : 'wide']
  // A short list, such as the result of a search, takes fewer rows.
  const rows = Math.min(most, Math.max(1, Math.ceil(list.length / 3)))
  const step = size.height + size.gap
  const tall = rows * step - size.gap

  const wall: Hung[] = []
  let left = 0
  let row = 0
  const close = () => {
    if (row === 0) return
    left += size.width + size.gap
    row = 0
  }
  for (const piece of list) {
    if (piece.kind === 'banner') {
      close()
      const height = Math.max(tall, step * 1.6)
      const width = height * BANNER
      wall.push({ piece, x: left + width / 2, y: 0, width, height })
      left += width + size.gap
      continue
    }
    wall.push({
      piece,
      x: left + size.width / 2,
      y: ((rows - 1) / 2 - row) * step,
      width: size.width,
      height: size.height,
    })
    row += 1
    if (row === rows) close()
  }
  // The room keeps its framing even when only one row of results is left.
  return { wall, height: Math.max(tall, (most > 2 ? 3 : 2) * step - size.gap) }
}
