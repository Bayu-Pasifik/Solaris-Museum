import type { Stage } from '../components/RingHall'
import type { ElementTheme } from '../lib/elements'
import type { Story } from '../lib/stories'
import ArchiveHall from './ArchiveHall'
import Drift from './Drift'
import RingStage from './RingStage'
import { drawCover } from './storyCover'

type Props = Stage & {
  /** The stories of one category, in order. */
  stories: Story[]
  /** Index of the chosen story. */
  current: number
  theme: ElementTheme
}

/** The archive room: a library hall with a ring of story panels around the chosen one. */
export default function LibraryScene({ stories, current, theme, ...stage }: Props) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-3, 6, 5]} intensity={1.6} />
      <pointLight position={[0, 5, -5]} intensity={30} color="#ffd9a0" />
      <ArchiveHall accent={theme.accent} />
      <Drift />
      <RingStage
        {...stage}
        items={stories}
        current={current}
        theme={theme}
        paint={drawCover}
        group={stories[0]?.category ?? ''}
      />
    </>
  )
}
