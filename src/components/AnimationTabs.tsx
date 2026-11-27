import { pop } from '../lib/sakuga'

type Props = {
  clips: string[]
  labels?: Record<string, string>
  selected: string
  onPick: (clip: string) => void
}

/** One button per clip, listed in the order of the labels. The buttons wrap onto more rows. */
export default function AnimationTabs({ clips, labels = {}, selected, onPick }: Props) {
  const order = Object.keys(labels)
  const sorted = [...clips].sort((a, b) => order.indexOf(a) - order.indexOf(b))

  return (
    <div className="acts" role="group" aria-label="Animasi">
      {sorted.map((clip) => (
        <button
          key={clip}
          type="button"
          className="pill"
          aria-pressed={clip === selected}
          onClick={(event) => {
            pop(event.currentTarget)
            onPick(clip)
          }}
        >
          {labels[clip] ?? clip}
        </button>
      ))}
    </div>
  )
}
