import { useJson } from './characters'
import type { ElementTheme } from './elements'

/** One entry of public/data/story.json, written by scripts/add-story.mjs. */
export type Story = {
  id: string
  category: string
  group: string
  name: string
  subtitle: string
  summary: string
  /** Path inside public/. Many quests have no picture. */
  picture?: string
}

export type StoryLine = {
  speaker?: string
  text: string
  /** The answers that the game offers after this line. */
  choices?: string[]
  /** Text on screen instead of speech. */
  note?: boolean
}

export type Section = { title?: string; lines: StoryLine[] }

/** The file public/data/story/<id>.json. */
export type StoryText = { id: string; sections: Section[] }

export const useStories = () => useJson<Story[]>('data/story.json', Array.isArray)

export const isStoryText = (data: StoryText) => Array.isArray(data.sections)

const themes: ElementTheme[] = [
  { deep: '#4a47b8', pale: '#e6e5ff', accent: '#8f8df7' },
  { deep: '#a82a68', pale: '#ffe0ee', accent: '#ff5fa8' },
  { deep: '#1f63c4', pale: '#d8f0ff', accent: '#4fb3ff' },
  { deep: '#1c7a4c', pale: '#dcf8e6', accent: '#45d38a' },
  { deep: '#a86a00', pale: '#fff3c4', accent: '#ffc21c' },
  { deep: '#5b2aa8', pale: '#ecdcff', accent: '#b47aff' },
]

/** Every category gets its own color, in the order of the list. */
export const categoryTheme = (categories: string[], category: string) =>
  themes[Math.max(categories.indexOf(category), 0) % themes.length]

/** Lines on one page of the reader. A section is cut only when it is longer than this. */
const PAGE = 60

/** Splits a story into pages of about the same length. */
export function pagesOf(sections: Section[]) {
  const pages: Section[][] = []
  let size = 0
  for (const section of sections) {
    for (let start = 0; start === 0 || start < section.lines.length; start += PAGE) {
      const part = {
        title: start === 0 ? section.title : undefined,
        lines: section.lines.slice(start, start + PAGE),
      }
      // A story can start with a title that has no lines under it.
      if (pages.length === 0 || size + part.lines.length > PAGE) {
        pages.push([])
        size = 0
      }
      pages[pages.length - 1].push(part)
      size += part.lines.length
    }
  }
  return pages
}
