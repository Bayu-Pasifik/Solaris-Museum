/** Colors of the stage, one set per element. */
export type ElementTheme = {
  /** Top of the sky, podium side and outlines. */
  deep: string
  /** Bottom of the sky. */
  pale: string
  /** Podium ring, particles and effects. */
  accent: string
}

const themes: Record<string, ElementTheme> = {
  Glacio: { deep: '#1f63c4', pale: '#d8f3ff', accent: '#46bdff' },
  Fusion: { deep: '#c92f2a', pale: '#ffe2b0', accent: '#ff7438' },
  Electro: { deep: '#4b1fa8', pale: '#ecd6ff', accent: '#b061ff' },
  Aero: { deep: '#087c72', pale: '#dcfce9', accent: '#35dcab' },
  Spectro: { deep: '#b97800', pale: '#fff6cc', accent: '#ffd02e' },
  Havoc: { deep: '#43103a', pale: '#f4b6cd', accent: '#e0407c' },
}

export const elementNames = Object.keys(themes)

const fallback: ElementTheme = { deep: '#5a4fd8', pale: '#f4f3fc', accent: '#ff5fa8' }

export const themeOf = (element: string) => themes[element] ?? fallback
