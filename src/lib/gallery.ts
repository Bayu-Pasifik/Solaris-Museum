import { useJson } from './characters'

/** Every picture is a path inside public/. It is absent when the API has no file for it. */
export type Namecard = { id: number; name: string; picture?: string }

/** The layers of a title plate; the name is drawn on top of them. */
export type Title = {
  id: number
  name: string
  background?: string
  /** The face of a character, on the titles that belong to one. */
  avatar?: string
  left?: string
  right?: string
}

export type Achievement = {
  id: number
  name: string
  description: string
  /** From 1 to 3; a higher one gives a bigger reward in the game. */
  level: number
  /** The game does not show these before they are reached. */
  hidden?: boolean
}

export type AchievementGroup = {
  id: number
  name: string
  icon?: string
  achievements: Achievement[]
}

export type AchievementCategory = {
  id: number
  name: string
  /** Tall key art of the category. */
  picture?: string
  groups: AchievementGroup[]
}

export type Gallery = {
  cards: Namecard[]
  titles: Title[]
  achievements: AchievementCategory[]
}

// A list from before the single achievements were copied counts as wrong.
const isGallery = (data: Gallery) =>
  [data.cards, data.titles, data.achievements].every(Array.isArray) &&
  data.achievements.every((category) =>
    category.groups.every((group) => Array.isArray(group.achievements)),
  )

export const useGallery = () => useJson<Gallery>('data/gallery.json', isGallery)
