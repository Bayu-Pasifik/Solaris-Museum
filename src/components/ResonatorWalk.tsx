import { Link } from 'react-router'
import type { Character } from '../lib/characters'
import { elementNames, themeOf } from '../lib/elements'
import type { WalkChoice } from '../lib/walkChoice'
import { byRank } from '../lib/wings'
import Guard from '../three/Guard'
import type { Stands } from '../three/WingScene'
import Dossier from './Dossier'
import standHall from './standHall'
import WingWalk from './WingWalk'

const stands: Stands<Character> = {
  carpet: '#ff9cc8',
  top: 0.3,
  sign: 2.45,
  // Characters are much heavier than weapons, so fewer of them are loaded.
  reach: 3,
  theme: (character) => themeOf(character.element),
  show: (character, place) => <Guard character={character} {...place} />,
}

const hall = standHall(stands)

type Props = {
  characters: Character[]
  /** The Resonator whose dossier is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Resonator Hall that is walked through: one wing for every element. */
export default function ResonatorWalk({ characters, currentId, walk }: Props) {
  return (
    <WingWalk
      title="Resonator Hall"
      base="/resonator"
      noun={['Resonator', 'Resonators']}
      items={characters}
      wingOf={(character) => character.element}
      order={elementNames}
      compare={byRank}
      hall={hall}
      currentId={currentId}
      walk={walk}
      still="Stage"
      face
      report={(current) => (
        <>
          <section className="report">
            <h2 lang="en">{current.name}</h2>
            <small>
              <bdi lang="en">
                {current.element} · {current.weapon}
              </bdi>{' '}
              · {'★'.repeat(current.rarity)}
            </small>
            <p>
              <Link to={`/resonator/${current.id}?stage`} className="button">
                View on stage
              </Link>
            </p>
          </section>
          <Dossier character={current} />
        </>
      )}
    />
  )
}
