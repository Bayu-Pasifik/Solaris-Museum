import { useMemo } from 'react'
import { useJson } from './characters'

export type DocumentKind = 'text' | 'picture' | 'record' | 'foreign'

/** One entry of public/data/documents.json, written by scripts/add-document.mjs. */
export type GameDocument = {
  id: number
  kind: DocumentKind
  title: string
  /** Empty for a few pictures. */
  text: string
  /** The map where it can be found. Most documents do not record it. */
  region?: string
  place?: string
  /** The thing that holds the text, when it has a name of its own. */
  source?: string
  /** Paths inside public/. */
  pictures?: string[]
}

/** A document with its first picture, which the ring and the strip show. */
export type Shelved = GameDocument & { picture?: string }

/** The shelves, in the order of the page. */
export const KINDS: Record<DocumentKind, string> = {
  text: 'Dokumen',
  picture: 'Foto & gambar',
  record: 'Rekaman',
  foreign: 'Teks asing',
}

export const regionOf = (document: GameDocument) => document.region ?? 'Wilayah tidak tercatat'

const NONE: Shelved[] = []

/** All documents, the ones of one region together and those without a region at the end. */
export function useDocuments() {
  const state = useJson<GameDocument[]>('data/documents.json', Array.isArray)
  const data = state.status === 'ready' ? state.data : undefined
  const documents = useMemo(() => {
    if (!data) return NONE
    // A region stands where its first document is.
    const regions = [...new Set(data.flatMap((item) => item.region ?? []))]
    const rank = (item: GameDocument) =>
      item.region ? regions.indexOf(item.region) : regions.length
    return data
      .map((item): Shelved => ({ ...item, picture: item.pictures?.[0] }))
      .sort((a, b) => rank(a) - rank(b) || a.id - b.id)
  }, [data])
  return { state, documents }
}
