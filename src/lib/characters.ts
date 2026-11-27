import { useEffect, useState } from 'react'

export type Character = {
  id: string
  name: string
  element: string
  weapon: string
  rarity: number
  /** Path inside public/, for example "models/yangyang.glb". */
  model: string
  defaultAnimation?: string
  /** Optional friendly labels, keyed by animation clip name. */
  animationLabels?: Record<string, string>
}

export const assetUrl = (path: string) => import.meta.env.BASE_URL + path

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; characters: Character[] }

export function useCharacters(): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(assetUrl('data/characters.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<Character[]>
      })
      .then((characters) => {
        if (!Array.isArray(characters)) throw new Error('Format data salah')
        setState({ status: 'ready', characters })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: error.message })
      })

    return () => controller.abort()
  }, [])

  return state
}
