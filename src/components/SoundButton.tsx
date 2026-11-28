import { toggleSound, useSound } from '../lib/ambience'

/** Turns the music and the sound of the rooms on and off. */
export default function SoundButton() {
  const on = useSound()
  const label = on ? 'Turn off room music and sound' : 'Turn on room music and sound'
  return (
    <button
      type="button"
      className="pill sound-toggle"
      aria-label={label}
      title={label}
      onClick={toggleSound}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
    </button>
  )
}
