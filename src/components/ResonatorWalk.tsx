import { Link } from 'react-router'
import type { Character } from '../lib/characters'
import { elementNames, themeOf } from '../lib/elements'
import { byCar, spotAtCar, spotAtStand, START, trainOf } from '../lib/express'
import type { WalkChoice } from '../lib/walkChoice'
import { byRank } from '../lib/wings'
import ExpressScene from '../three/ExpressScene'
import Dossier from './Dossier'
import WingWalk, { type Hall } from './WingWalk'

/** The train as a hall: every wing is a carriage, and all of them are coupled in one. */
const express: Hall<Character> = {
  theme: (character) => themeOf(character.element),
  note: (character) => '★'.repeat(character.rarity),
  spot: (index, third, list) => spotAtStand(trainOf(list).stands[index], third),
  // The strip has no rows here: every Resonator is its own.
  rowOf: (index) => index,
  rowStart: (row) => row,
  // The button of an element brings the visitor to the way into its carriage.
  jump: (index, list) => {
    const { cars } = trainOf(list)
    return spotAtCar(cars.filter((car) => car.first <= index).at(-1) ?? cars[0])
  },
  start: START,
  Scene: ExpressScene,
}

/** The carriages in their order, with the best Resonators nearest the end of the train. */
const seating = (a: Character, b: Character) => byCar(a, b) || byRank(a, b)

type Props = {
  characters: Character[]
  /** The Resonator whose dossier is open, from the address of the page. */
  currentId?: string
  walk: WalkChoice
}

/** The Resonator Hall that is walked through: a train with one carriage for every element. */
export default function ResonatorWalk({ characters, currentId, walk }: Props) {
  return (
    <WingWalk
      title="Resonator Hall"
      base="/resonator"
      noun={['Resonator', 'Resonators']}
      items={characters}
      wingOf={(character) => character.element}
      order={elementNames}
      compare={seating}
      hall={express}
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
