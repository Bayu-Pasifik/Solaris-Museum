import { assetUrl } from '../lib/characters'
import type { SonataSet } from '../lib/echoes'

type Props = {
  set: SonataSet
  /** How many echoes can have the set. */
  count: number
  /** The set that the strip is filtered by. */
  chosen?: boolean
  /** Without it, the number of echoes is only told. */
  onChoose?: (id: number) => void
}

/** One Sonata set: its emblem, what it gives, and the button that shows its echoes. */
export default function SonataCard({ set, count, chosen, onChoose }: Props) {
  return (
    <article className="sonata">
      <header>
        {set.icon && <img src={assetUrl(set.icon)} alt="" loading="lazy" />}
        <h3 lang="en">{set.name}</h3>
        {onChoose ? (
          <button type="button" className="pill" aria-pressed={chosen} onClick={() => onChoose(set.id)}>
            {count} {count === 1 ? 'echo' : 'echoes'}
          </button>
        ) : (
          <small>
            {count} {count === 1 ? 'echo' : 'echoes'}
          </small>
        )}
      </header>
      <dl>
        {set.effects.map((effect) => (
          <div key={effect.pieces}>
            <dt>{effect.pieces}-piece</dt>
            <dd lang="en">{effect.text}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
