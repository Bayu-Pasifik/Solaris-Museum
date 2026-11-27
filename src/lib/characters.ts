import { useEffect, useState } from 'react'

export type Outfit = {
  /** Path inside public/, for example "models/yangyang.glb". */
  model: string
  defaultAnimation?: string
  /** Optional friendly labels, keyed by animation clip name. */
  animationLabels?: Record<string, string>
}

/** The fields of Outfit describe the outfit that the character starts with. */
export type Character = Outfit & {
  id: string
  name: string
  element: string
  weapon: string
  rarity: number
  /** Name of the starting outfit. Needed only when there are others. */
  skinName?: string
  skins?: (Outfit & { name: string })[]
  /** The animated splash art (Spine), as paths inside public/. Not every character has it. */
  l2d?: Live2d
}

export type Live2d = { skeleton: string; atlas: string }

export const assetUrl = (path: string) => import.meta.env.BASE_URL + path

type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

/**
 * Loads a JSON file from public/. The path must stay the same for the life of the component,
 * and isValid must be a function defined outside of it.
 */
export function useJson<T>(path: string, isValid: (data: T) => boolean): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(assetUrl(path), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<T>
      })
      .then((data) => {
        if (!isValid(data)) throw new Error('Format data salah')
        setState({ status: 'ready', data })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: error.message })
      })

    return () => controller.abort()
  }, [path, isValid])

  return state
}

export const useCharacters = () => useJson<Character[]>('data/characters.json', Array.isArray)
