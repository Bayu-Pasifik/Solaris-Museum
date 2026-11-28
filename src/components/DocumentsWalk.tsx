import { useMemo } from 'react'
import type { Shelved } from '../lib/documents'
import { useTitle } from '../lib/title'
import {
  colorsOf,
  layOut,
  papersOf,
  spotAtStand,
  START,
  wingOf,
  WINGS,
  type Paper,
} from '../lib/trench'
import type { WalkChoice } from '../lib/walkChoice'
import TrenchScene from '../three/TrenchScene'
import DocumentReader from './DocumentReader'
import WingWalk, { type Hall } from './WingWalk'

/** The floor of the sea as a hall: every kind of document has its own depth. */
const ARCHIVE: Hall<Paper> = {
  theme: colorsOf,
  note: ({ document, kind }) => document.place ?? document.region ?? wingOf({ kind }),
  spot: (index, third, list) => spotAtStand(layOut(list).stands[index], third),
  // The strip has no rows here: every document is its own.
  rowOf: (index) => index,
  rowStart: (row) => row,
  start: START,
  Scene: TrenchScene,
}

type Props = {
  documents: Shelved[]
  /** The document from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Document Archive that is walked through, on the floor of the sea. */
export default function DocumentsWalk({ documents, currentId, walk }: Props) {
  const papers = useMemo(() => papersOf(documents), [documents])
  useTitle(papers.find((paper) => paper.id === currentId)?.name ?? 'Documents')

  return (
    <WingWalk
      title="Document Archive"
      base="/documents"
      noun={['document', 'documents']}
      items={papers}
      wingOf={wingOf}
      order={WINGS}
      hall={ARCHIVE}
      currentId={currentId}
      walk={walk}
      still="Ring"
      report={({ document }) => <DocumentReader document={document} />}
    />
  )
}
