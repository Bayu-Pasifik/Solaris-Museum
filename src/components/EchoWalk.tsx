import { useMemo } from 'react'
import type { Monster } from '../lib/bestiary'
import type { Echo, SonataSet } from '../lib/echoes'
import { themeOf } from '../lib/elements'
import type { WalkChoice } from '../lib/walkChoice'
import { climbing, spotAtStand, standOf, START, WINGS, wingOf, type Voice } from '../lib/spire'
import SpireScene from '../three/SpireScene'
import EchoReport from './EchoReport'
import SonataCard from './SonataCard'
import WingWalk, { type Hall, type HallProps } from './WingWalk'

/** The spire as a hall: every kind of echo has the whole road to itself. */
function spire(sets: Map<number, SonataSet>): Hall<Voice> {
  return {
    theme: ({ record }) => themeOf(record.element),
    note: ({ record }) => `Cost ${record.cost} · ${record.element}`,
    spot: (index, third, list) =>
      spotAtStand(standOf(list[index], index, list.length), third),
    // The strip has no rows here: every echo is its own.
    rowOf: (index) => index,
    rowStart: (row) => row,
    start: START,
    Scene: (props: HallProps<Voice>) => <SpireScene {...props} sets={sets} />,
  }
}

type Props = {
  /** In the order of "ordered", so that echoes of one name have their number. */
  echoes: Echo[]
  sets: SonataSet[]
  /** The Bestiary, which lends the models; empty if it cannot be read. */
  monsters: Monster[]
  /** The echo whose report is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Echo room that is walked through: a road of keys up to a tuning fork. */
export default function EchoWalk({ echoes, sets, monsters, currentId, walk }: Props) {
  const items = useMemo(() => {
    const lenders = new Map(monsters.map((monster) => [monster.id, monster]))
    return echoes.map((record) => ({
      id: String(record.id),
      name: record.name,
      record,
      lender: record.monster === undefined ? undefined : lenders.get(record.monster),
    }))
  }, [echoes, monsters])
  const byId = useMemo(() => new Map(sets.map((set) => [set.id, set])), [sets])
  // The scene must stay the same component, or the map would load again at every change.
  const hall = useMemo(() => spire(byId), [byId])

  return (
    <WingWalk
      title="Echo Room"
      base="/echo"
      noun={['echo', 'echoes']}
      items={items}
      wingOf={wingOf}
      order={WINGS}
      compare={climbing}
      hall={hall}
      currentId={currentId}
      walk={walk}
      still="Chamber"
      report={({ record, lender }) => (
        <EchoReport
          echo={record}
          lender={lender}
          sets={record.sets.flatMap((id) => byId.get(id) ?? [])}
        >
          {(set) => (
            <SonataCard
              key={set.id}
              set={set}
              count={echoes.filter((echo) => echo.sets.includes(set.id)).length}
            />
          )}
        </EchoReport>
      )}
    />
  )
}
