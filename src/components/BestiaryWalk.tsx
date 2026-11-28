import { useMemo } from 'react'
import type { Monster } from '../lib/bestiary'
import { themeOf } from '../lib/elements'
import type { WalkChoice } from '../lib/walkChoice'
import {
  beasts,
  densOf,
  ELEMENTS,
  spotAtDen,
  spotOnIsland,
  START,
  wingOf,
  type Beast,
} from '../lib/wilds'
import WildsScene from '../three/WildsScene'
import MonsterReport from './MonsterReport'
import WingWalk, { type Hall, type HallProps } from './WingWalk'

/** The map as a hall: every island is a wing, and all of them can be walked at once. */
function wilds(list: Beast[]): Hall<Beast> {
  const dens = densOf(list)
  return {
    theme: (beast) => themeOf(beast.record.element),
    note: (beast) => beast.record.rank,
    spot: (index, third) => spotAtDen(dens, index, third),
    // The strip has no rows here: every monster is its own.
    rowOf: (index) => index,
    rowStart: (row) => row,
    jump: (index) => spotOnIsland(dens[index].island),
    start: START,
    Scene: (props: HallProps<Beast>) => <WildsScene {...props} dens={dens} />,
  }
}

type Props = {
  /** In the order of "ordered", so that monsters of one name have their number. */
  monsters: Monster[]
  /** The monster whose report is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Bestiary that is walked through: floating islands, one for every element. */
export default function BestiaryWalk({ monsters, currentId, walk }: Props) {
  const items = useMemo(() => beasts(monsters), [monsters])
  // The scene must stay the same component, or the map would load again at every change.
  const hall = useMemo(() => wilds(items), [items])

  return (
    <WingWalk
      title="Bestiary"
      base="/bestiary"
      noun={['monster', 'monsters']}
      items={items}
      wingOf={wingOf}
      order={ELEMENTS}
      hall={hall}
      currentId={currentId}
      walk={walk}
      still="Arena"
      report={(beast) => <MonsterReport monster={beast.record} />}
    />
  )
}
