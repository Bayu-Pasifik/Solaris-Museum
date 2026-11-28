import { useMemo, type ReactNode } from 'react'
import { layOut, spotAtBay, spotAtBook } from '../lib/shelves'
import { categoryTheme, type Story } from '../lib/stories'
import type { WalkChoice } from '../lib/walkChoice'
import ShelfScene from '../three/ShelfScene'
import { unique } from './Chips'
import StoryReader from './StoryReader'
import WingWalk, { type Hall, type HallProps } from './WingWalk'

type Props = {
  stories: Story[]
  /** The story whose script is open, from the address of the page. */
  currentId?: string
  /** The story that the walk starts at when none is open. */
  startId?: string
  links: ReactNode
  walk: WalkChoice
}

/**
 * The Library that is walked through: one aisle with every story, one category after another in
 * the order of the list.
 */
export default function LibraryWalk({ stories, currentId, startId, links, walk }: Props) {
  const categories = useMemo(() => unique(stories.map((story) => story.category)), [stories])
  // The books of a category stand together.
  const sorted = useMemo(
    () =>
      [...stories].sort(
        (a, b) => categories.indexOf(a.category) - categories.indexOf(b.category),
      ),
    [stories, categories],
  )
  // A new hall would build the whole scene again, so it only changes with the stories.
  const hall = useMemo<Hall<Story>>(() => {
    const aisle = layOut(sorted.map((story) => story.category))
    const theme = (story: Story) => categoryTheme(categories, story.category)
    return {
      theme,
      note: (story) => story.group,
      spot: (index, third) => spotAtBook(aisle.books[index], third),
      rowOf: (index) => aisle.books[index].bay,
      rowStart: (row) => aisle.bays[row]?.first ?? 0,
      jump: (index) => spotAtBay(aisle.books[index].bay),
      Scene: (props: HallProps<Story>) => (
        <ShelfScene {...props} theme={theme} aisle={aisle} />
      ),
    }
  }, [sorted, categories])

  return (
    <WingWalk
      title="Library"
      base="/library"
      noun={['story', 'stories']}
      items={sorted}
      wingOf={(story) => story.category}
      order={categories}
      hall={hall}
      currentId={currentId}
      startId={startId}
      links={links}
      walk={walk}
      still="Ring"
      face
      report={(current) => <StoryReader story={current} />}
    />
  )
}
