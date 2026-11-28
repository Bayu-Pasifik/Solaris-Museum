import { useMemo } from 'react'
import { colorsOf, landsOf, spotAtSite, START, wingOf, type Land } from '../lib/atlas'
import type { Region } from '../lib/map'
import { useTitle } from '../lib/title'
import type { WalkChoice } from '../lib/walkChoice'
import AtlasScene from '../three/AtlasScene'
import AreaReport from './AreaReport'
import WingWalk, { type Hall } from './WingWalk'

/** The little planets as a hall: every region is one, and its areas stand on it. */
const ATLAS: Hall<Land> = {
  theme: colorsOf,
  note: ({ area }) => `${area.reports.length} ${area.reports.length === 1 ? 'report' : 'reports'}`,
  spot: spotAtSite,
  // The strip has no rows here: every area is its own.
  rowOf: (index) => index,
  rowStart: (row) => row,
  start: START,
  Scene: AtlasScene,
}

type Props = {
  regions: Region[]
  /** The region and the area from the address of the page. */
  regionId?: string
  areaId?: string
  walk: WalkChoice
}

/** The Map room that is walked through, over one little planet for every region. */
export default function MapWalk({ regions, regionId, areaId, walk }: Props) {
  const lands = useMemo(() => landsOf(regions), [regions])
  const order = useMemo(() => regions.map((region) => region.name), [regions])
  const currentId = areaId ? `${regionId}/${areaId}` : undefined
  const region = regions.find((item) => String(item.id) === regionId)
  useTitle(lands.find((land) => land.id === currentId)?.name ?? region?.name ?? 'Map Room')

  return (
    <WingWalk
      title="Map Room"
      base="/map"
      noun={['area', 'areas']}
      items={lands}
      wingOf={wingOf}
      order={order}
      hall={ATLAS}
      currentId={currentId}
      startId={region?.areas[0] && `${region.id}/${region.areas[0].id}`}
      walk={walk}
      still="Atlas"
      report={({ area }) => <AreaReport area={area} />}
    />
  )
}
