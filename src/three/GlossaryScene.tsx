import type { Stage } from '../components/RingHall'
import type { ElementTheme } from '../lib/elements'
import type { Term } from '../lib/glossary'
import Observatory from './Observatory'
import RingStage from './RingStage'
import { drawTerm } from './termFace'

type Props = Stage & {
  /** The terms of one letter, in order. */
  terms: Term[]
  /** Index of the chosen term. */
  current: number
  letter: string
  theme: ElementTheme
}

/** The observatory with a ring of term panels around the chosen one. */
export default function GlossaryScene({ terms, current, letter, theme, ...stage }: Props) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 6, 5]} intensity={1.7} />
      <Observatory accent={theme.accent} />
      <RingStage
        {...stage}
        items={terms}
        current={current}
        theme={theme}
        paint={drawTerm}
        group={letter}
      />
    </>
  )
}
