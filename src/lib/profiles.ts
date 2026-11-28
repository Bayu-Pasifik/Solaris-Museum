/** One file per character in public/data/profiles/, written by scripts/profile.mjs. */
export type Profile = {
  nickname: string
  introduction: string
  birthday: string
  country: string
  faction: string
  voiceActors: Partial<Record<Language, string>>
  stories: { title: string; text: string }[]
  voices: Voice[]
  skills: Skill[]
  /** In the order of the game. Absent in profiles written by an older script. */
  chain?: ChainNode[]
  /** Personal belongings. Absent in profiles written by an older script. */
  keepsakes?: Keepsake[]
}

export type Keepsake = {
  name: string
  text: string
  /** Path inside public/, or empty. */
  picture: string
}

export type ChainNode = {
  name: string
  description: string
  /** Path inside public/, or empty. */
  icon: string
}

export type Voice = {
  id: number
  /** Spoken while playing, not as talk in the menu. */
  combat: boolean
  title: string
  text: string
  /** Audio URL per language. A language is absent when there is no file. */
  audio: Partial<Record<Language, string>>
}

export type Skill = {
  type: string
  name: string
  description: string
  /** Path inside public/, or empty. */
  icon: string
}

export const languages = { ja: 'Japanese', en: 'English', zh: 'Chinese', ko: 'Korean' }

export type Language = keyof typeof languages

export const isProfile = (data: Profile) =>
  Array.isArray(data?.stories) && Array.isArray(data.voices) && Array.isArray(data.skills)
