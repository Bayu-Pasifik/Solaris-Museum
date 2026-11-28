import { byForge, KINDS, spotAtForge, spotAtStand, standsOf, START } from '../lib/foundry'
import type { WalkChoice } from '../lib/walkChoice'
import { rarityTheme, type Weapon } from '../lib/weapons'
import { byRank } from '../lib/wings'
import FoundryScene from '../three/FoundryScene'
import Marks from './Marks'
import WeaponReport from './WeaponReport'
import WeaponViewer from './WeaponViewer'
import WingWalk, { type Hall } from './WingWalk'

/** The order of the wings, which is that of the forges. */
const ORDER = KINDS.map((kind) => kind[0].toUpperCase() + kind.slice(1))

/** The foundry as a hall: every wing is a forge, and all of them lie around one smith. */
const foundry: Hall<Weapon> = {
  theme: (weapon) => rarityTheme(weapon.rarity),
  note: (weapon) => '★'.repeat(weapon.rarity),
  spot: (index, third, list) => spotAtStand(standsOf(list)[index], third),
  // The strip has no rows here: every weapon is its own.
  rowOf: (index) => index,
  rowStart: (row) => row,
  // The button of a kind brings the visitor to the way into its forge.
  jump: (index, list) => spotAtForge(standsOf(list)[index].forge),
  start: START,
  Scene: FoundryScene,
}

/** The forges in their order, with the best weapons by the way in. */
const racked = (a: Weapon, b: Weapon) => byForge(a, b) || byRank(a, b)

type Props = {
  weapons: Weapon[]
  /** The weapon whose report is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Armory that is walked through: a foundry with one forge for every kind of weapon. */
export default function ArmoryWalk({ weapons, currentId, walk }: Props) {
  return (
    <WingWalk
      title="Armory"
      base="/armory"
      noun={['weapon', 'weapons']}
      items={weapons}
      wingOf={(weapon) => weapon.type}
      order={ORDER}
      compare={racked}
      hall={foundry}
      currentId={currentId}
      walk={walk}
      still="List"
      report={(current) => (
        <section className="report">
          <h2 lang="en">{current.name}</h2>
          <small>
            <bdi lang="en">{current.type}</bdi> · {'★'.repeat(current.rarity)}
          </small>
          <Marks path={`/armory/${current.id}`} />
          <div className="weapon-view" role="group" aria-label={`3D model of ${current.name}`}>
            <WeaponViewer weapon={current} />
          </div>
          <p className="ranks">
            Drag to rotate · scroll or pinch to zoom · right-click or two fingers to pan
          </p>
          <WeaponReport weapon={current} />
        </section>
      )}
    />
  )
}
