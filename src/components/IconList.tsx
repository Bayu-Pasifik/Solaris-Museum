import { assetUrl } from '../lib/characters'
import GameText from './GameText'

export type Entry = {
  /** Small line above the name. */
  label: string
  name: string
  description: string
  /** Path inside public/, or empty. */
  icon: string
}

/** A list of game entries with an icon. The description opens on click. */
export default function IconList({ entries }: { entries: Entry[] }) {
  return (
    <ul className="skills">
      {entries.map((entry) => (
        <li key={`${entry.label} ${entry.name}`}>
          <details>
            <summary>
              <span className="skill-icon">
                {entry.icon && <img src={assetUrl(entry.icon)} alt="" loading="lazy" />}
              </span>
              <span lang="en">
                <small>{entry.label}</small>
                {entry.name}
              </span>
            </summary>
            <GameText text={entry.description} />
          </details>
        </li>
      ))}
    </ul>
  )
}
