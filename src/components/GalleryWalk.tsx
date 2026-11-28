import { useMemo } from 'react'
import { pieceId, pieceName, pieces, SECTIONS, type Choosable, type SectionId } from '../lib/exhibits'
import type { Gallery } from '../lib/gallery'
import {
  colorsOf,
  hangUp,
  spotAtStand,
  spotBeforeArch,
  START,
  wingOf,
  WINGS,
  type Show,
} from '../lib/mobius'
import { useTitle } from '../lib/title'
import type { WalkChoice } from '../lib/walkChoice'
import MobiusScene from '../three/MobiusScene'
import PieceReport from './PieceReport'
import WingWalk, { type Hall } from './WingWalk'

/** The ribbon as a hall: every collection hangs on it, one after another. */
const SALON: Hall<Show> = {
  theme: colorsOf,
  note: (show) =>
    show.record.kind === 'group' ? show.record.category.name : wingOf(show),
  spot: (index, third, list) => spotAtStand(hangUp(list).stands[index], third),
  // The strip has no rows here: every piece is its own.
  rowOf: (index) => index,
  rowStart: (row) => row,
  jump: (index, list) =>
    spotBeforeArch(hangUp(list).gates.find((gate) => gate.section === list[index].section)!),
  start: START,
  Scene: MobiusScene,
}

type Props = {
  data: Gallery
  /** The collection and the piece from the address of the page. */
  section?: string
  item?: string
  walk: WalkChoice
}

/** The Gallery that is walked through: a ribbon with a half twist that never ends. */
export default function GalleryWalk({ data, section, item, walk }: Props) {
  const shows = useMemo(
    () =>
      SECTIONS.flatMap(({ id }) =>
        pieces(data, id, '')
          .filter((piece): piece is Choosable => piece.kind !== 'banner')
          .map(
            (record): Show => ({
              id: `${id}/${pieceId(record)}`,
              name: pieceName(record),
              section: id as SectionId,
              record,
            }),
          ),
      ),
    [data],
  )
  const currentId = section && item ? `${section}/${item}` : undefined
  useTitle(shows.find((show) => show.id === currentId)?.name ?? 'Gallery')

  return (
    <WingWalk
      title="Gallery"
      base="/gallery"
      noun={['piece', 'pieces']}
      items={shows}
      wingOf={wingOf}
      order={WINGS}
      hall={SALON}
      currentId={currentId}
      // The address of a collection starts the walk at its first piece.
      startId={shows.find((show) => show.section === section)?.id}
      walk={walk}
      still="Wall"
      report={({ record }) => <PieceReport piece={record} text="" />}
    />
  )
}
