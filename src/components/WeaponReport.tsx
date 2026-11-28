import type { Weapon } from '../lib/weapons'
import GameText from './GameText'

/** The numbers, the skill and the story of a weapon. */
export default function WeaponReport({ weapon }: { weapon: Weapon }) {
  return (
    <div className="panel">
      <dl className="facts">
        {/* Two stats can share a name: "ATK" as a number and as a percentage. */}
        {weapon.stats.map((stat, index) => (
          <div key={index}>
            <dt>
              <bdi lang="en">{stat.name}</bdi> · level awal → maksimum
            </dt>
            <dd>
              {stat.min} → {stat.max}
            </dd>
          </div>
        ))}
      </dl>
      {weapon.skill.name && (
        <>
          <h3 lang="en">{weapon.skill.name}</h3>
          <GameText text={weapon.skill.description} />
          <p className="ranks">Angka yang dipisah garis miring berlaku untuk rank 1 sampai 5.</p>
        </>
      )}
      {weapon.description && (
        <>
          <h4>Kisah</h4>
          <GameText text={weapon.description} />
        </>
      )}
    </div>
  )
}
