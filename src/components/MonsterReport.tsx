import { rankColor, type Monster } from '../lib/bestiary'
import { useTerms } from '../lib/glossary'
import GameText from './GameText'

const number = new Intl.NumberFormat('id-ID')

/** The drawer of the Bestiary: what is known about the chosen monster. */
export default function MonsterReport({ monster }: { monster: Monster }) {
  const height = monster.model?.size[1]
  const terms = useTerms()
  const seen = new Set<number>()
  return (
    <div className="report">
      <h2>{monster.name}</h2>
      <p className="badges">
        <span style={{ background: rankColor(monster.rank) }}>{monster.rank}</span>
        <small>
          {monster.element}
          {height ? ` · tinggi sekitar ${number.format(Math.round(height * 10) / 10)} m` : ''}
        </small>
      </p>

      {monster.description && (
        <article>
          <h3>Catatan</h3>
          <GameText text={terms.link(monster.description, seen)} terms={terms.byId} />
        </article>
      )}
      {monster.rumor && (
        <article>
          <h3>Sebelum diteliti</h3>
          <GameText text={terms.link(monster.rumor, seen)} terms={terms.byId} />
        </article>
      )}

      {monster.stats.length > 0 && (
        <article>
          <h3>Status</h3>
          <table className="figures">
            <thead>
              <tr>
                <td />
                <th scope="col">Lv 1</th>
                <th scope="col">Lv 90</th>
              </tr>
            </thead>
            <tbody>
              {monster.stats.map((stat) => (
                <tr key={stat.name}>
                  <th scope="row">{stat.name}</th>
                  <td>{number.format(stat.min)}</td>
                  <td>{stat.max === undefined ? '–' : number.format(stat.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {monster.resistances.length > 0 && (
        <article>
          <h3>Ketahanan (RES)</h3>
          <ul className="resists">
            {monster.resistances.map((item) => (
              // The element of the monster usually has the highest resistance.
              <li
                key={item.name}
                className={
                  item.value > Math.min(...monster.resistances.map((other) => other.value))
                    ? 'strong'
                    : undefined
                }
              >
                {item.name} <b>{number.format(item.value)}%</b>
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  )
}
