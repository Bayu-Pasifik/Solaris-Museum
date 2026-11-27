import { useState } from 'react'

type Props = {
  clips: string[]
  labels?: Record<string, string>
  initial: string
  onPick: (clip: string) => void
}

/** The tabs read their options once, so give this component a new key when the clips change. */
export default function AnimationTabs({ clips, labels, initial, onPick }: Props) {
  // Only the starting tab is passed down. Setting it again later would skip the slide.
  const [start] = useState(() => Math.max(0, clips.indexOf(initial)))

  return (
    <sakuga-tabs
      label="Animasi"
      selected={start}
      ref={(element) => {
        if (!element) return
        const onChange = (event: Event) => {
          onPick(clips[(event as CustomEvent<{ index: number }>).detail.index])
        }
        element.addEventListener('change', onChange)
        return () => element.removeEventListener('change', onChange)
      }}
    >
      {clips.map((clip) => (
        <option key={clip} value={clip}>
          {labels?.[clip] ?? clip}
        </option>
      ))}
    </sakuga-tabs>
  )
}
