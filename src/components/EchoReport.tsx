import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Monster } from '../lib/bestiary'
import { assetUrl } from '../lib/characters'
import type { Echo, SonataSet } from '../lib/echoes'
import { useTerms } from '../lib/glossary'
import GameText from './GameText'
import Marks from './Marks'

type Props = {
  echo: Echo
  /** The monster that lends the echo its model. */
  lender?: Monster
  /** The Sonata sets of the echo. */
  sets: SonataSet[]
  /** How the card of one set is drawn. */
  children: (set: SonataSet) => ReactNode
}

/** What the drawer says about one echo, in the chamber and on the walk. */
export default function EchoReport({ echo, lender, sets, children }: Props) {
  const terms = useTerms()
  const seen = new Set<number>()

  return (
    <div className="report echo-report">
      <h2 lang="en">{echo.name}</h2>
      <Marks path={`/echo/${echo.id}`} />
      <p className="badges">
        <span>Cost {echo.cost}</span>
        <small lang="en">
          {echo.rank} · {echo.element}
        </small>
      </p>
      {echo.skill.text && (
        <article>
          <h3 className="skill">
            {echo.skill.icon && <img src={assetUrl(echo.skill.icon)} alt="" />}
            Echo skill (highest level)
          </h3>
          <GameText text={terms.link(echo.skill.text, seen)} terms={terms.byId} />
        </article>
      )}
      {lender && (
        <article>
          <h3>3D model</h3>
          <p>
            Borrowed from{' '}
            <Link to={`/bestiary/${lender.id}`}>
              <bdi lang="en">{lender.name}</bdi> in the Bestiary
            </Link>
            .
          </p>
        </article>
      )}
      {sets.map(children)}
    </div>
  )
}
