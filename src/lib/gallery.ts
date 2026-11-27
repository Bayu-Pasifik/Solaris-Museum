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

export type AchievementCategory = {
  id: number
  name: string
  /** Tall key art of the category. */
  picture?: string
  groups: { id: number; name: string; icon?: string; count: number }[]
}

export type Gallery = {
  cards: Namecard[]
  titles: Title[]
  achievements: AchievementCategory[]
}

const isGallery = (data: Gallery) =>
  [data.cards, data.titles, data.achievements].every(Array.isArray)

export const useGallery = () => useJson<Gallery>('data/gallery.json', isGallery)
