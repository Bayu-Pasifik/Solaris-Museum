import { assetUrl } from '../lib/characters'
import type { Profile } from '../lib/profiles'
import GameText from './GameText'

export default function SkillPanel({ profile }: { profile: Profile }) {
  return (
    <div className="panel">
      {profile.skills.length === 0 && <p>Belum ada daftar skill untuk karakter ini.</p>}
      <ul className="skills">
        {profile.skills.map((skill) => (
          <li key={`${skill.type} ${skill.name}`}>
            <details>
              <summary>
                <span className="skill-icon">
                  {skill.icon && <img src={assetUrl(skill.icon)} alt="" loading="lazy" />}
                </span>
                <span>
                  <small>{skill.type}</small>
                  {skill.name}
                </span>
              </summary>
              <GameText text={skill.description} />
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
