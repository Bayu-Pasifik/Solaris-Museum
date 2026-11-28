import { MODES, type Mode } from '../lib/roam'
import type { WalkChoice } from '../lib/walkChoice'

type Props = {
  walk: WalkChoice
  onChoose: WalkChoice['choose']
  /** What the view without walking is called in this room. */
  still?: string
}

/** The buttons for the ways to look around, and the choice of the Resonator who walks. */
export default function ModeSwitch({ walk, onChoose, still = MODES.tour }: Props) {
  const { mode, hero, walkers } = walk

  return (
    <div className="modes" role="group" aria-label="Ways to look around">
      {(Object.keys(MODES) as Mode[]).map((key) => (
        <button
          key={key}
          type="button"
          className="pill"
          aria-pressed={mode === key}
          onClick={(event) => {
            // The focus leaves the button, so Enter and Space do not press it again.
            if (event.detail > 0) event.currentTarget.blur()
            onChoose({ mode: key })
          }}
        >
          {key === 'tour' ? still : MODES[key]}
        </button>
      ))}
      {mode === 'third' && hero && (
        <select
          className="pill"
          aria-label="Walking Resonator"
          lang="en"
          value={hero.id}
          onChange={(event) => {
            // The arrows then walk again instead of changing the Resonator.
            event.target.blur()
            onChoose({ hero: event.target.value })
          }}
        >
          {walkers.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
