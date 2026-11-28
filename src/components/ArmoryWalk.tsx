import type { WalkChoice } from '../lib/walkChoice'
import { rarityTheme, type Weapon } from '../lib/weapons'
import { byRank } from '../lib/wings'
import SpinningWeapon from '../three/SpinningWeapon'
import type { Stands } from '../three/WingScene'
import Marks from './Marks'
import standHall from './standHall'
import WeaponReport from './WeaponReport'
import WeaponViewer from './WeaponViewer'
import WingWalk from './WingWalk'

/** The order of the wings. */
const ORDER = ['Broadblade', 'Sword', 'Pistols', 'Gauntlets', 'Rectifier']

const stands: Stands<Weapon> = {
  carpet: '#ffb86b',
  top: 0.48,
  sign: 2.35,
  // Farther ones are lost in the haze.
  reach: 6,
  theme: (weapon) => rarityTheme(weapon.rarity),
  show: (weapon, place) => <SpinningWeapon weapon={weapon} {...place} />,
}

const hall = standHall(stands)

type Props = {
  weapons: Weapon[]
  /** The weapon whose report is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Armory that is walked through: one wing for every kind of weapon. */
export default function ArmoryWalk({ weapons, currentId, walk }: Props) {
  return (
    <WingWalk
      title="Armory"
      base="/armory"
      noun={['weapon', 'weapons']}
      items={weapons}
      wingOf={(weapon) => weapon.type}
      order={ORDER}
      compare={byRank}
      hall={hall}
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
