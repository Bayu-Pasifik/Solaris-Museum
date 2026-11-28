import type { Stage } from '../components/RingHall'
import type { Shelved } from '../lib/documents'
import type { ElementTheme } from '../lib/elements'
import ArchiveHall from './ArchiveHall'
import { drawDocument } from './documentFace'
import Drift from './Drift'
import RingStage from './RingStage'

type Props = Stage & {
  /** The documents of one shelf, in order. */
  documents: Shelved[]
  /** Index of the chosen document. */
  current: number
  theme: ElementTheme
}

/** The archive hall of the Library, with a ring of documents around the chosen one. */
export default function DocumentsScene({ documents, current, theme, ...stage }: Props) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-3, 6, 5]} intensity={1.6} />
      <pointLight position={[0, 5, -5]} intensity={30} color="#ffd9a0" />
      <ArchiveHall accent={theme.accent} />
      <Drift />
      <RingStage
        {...stage}
        items={documents}
        current={current}
        theme={theme}
        paint={drawDocument}
        group={documents[0]?.kind ?? ''}
      />
    </>
  )
}
