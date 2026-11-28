import { useEffect, useRef, useState } from 'react'
import { duck } from '../lib/ambience'
import { languages, type Language, type Profile, type Voice } from '../lib/profiles'

type Playing = { id: number; state: 'loading' | 'playing' | 'failed' }

const icons = { loading: '…', playing: '■', failed: '!' }

const groups = [
  { combat: false, label: 'Chat' },
  { combat: true, label: 'Combat' },
]

/** The voice lines. One line plays at a time, and it stops when the panel closes. */
export default function VoicePanel({ profile }: { profile: Profile }) {
  const available = (Object.keys(languages) as Language[]).filter((language) =>
    profile.voices.some((voice) => voice.audio[language]),
  )
  const [language, setLanguage] = useState<Language>(available[0] ?? 'ja')
  const [combat, setCombat] = useState(false)
  const [playing, setPlaying] = useState<Playing | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const release = () => {
    const current = audio.current
    audio.current = null
    if (!current) return
    duck(false)
    current.onplaying = current.onended = current.onerror = null
    current.pause()
  }
  useEffect(() => release, [])

  const halt = () => {
    release()
    setPlaying(null)
  }

  const toggle = (voice: Voice) => {
    const same = playing?.id === voice.id && playing.state !== 'failed'
    halt()
    const url = voice.audio[language]
    if (same || !url) return

    const next = new Audio(url)
    audio.current = next
    duck(true)
    // A line that was stopped in the meantime must not change the state.
    const report = (state: Playing['state']) => {
      if (audio.current !== next) return
      if (state === 'failed') duck(false)
      setPlaying({ id: voice.id, state })
    }
    next.onplaying = () => report('playing')
    next.onerror = () => report('failed')
    next.onended = halt
    report('loading')
    next.play().catch(() => report('failed'))
  }

  if (profile.voices.length === 0) {
    return (
      <div className="panel">
        <p>No voice lines for this character yet.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      {available.length === 0 ? (
        <p>Audio for this character is not available yet. You can still read the lines.</p>
      ) : (
        <div className="chips" role="group" aria-label="Voice language">
          <span aria-hidden="true">Language</span>
          {available.map((option) => (
            <button
              key={option}
              type="button"
              className="pill"
              aria-pressed={option === language}
              onClick={() => {
                halt()
                setLanguage(option)
              }}
            >
              {languages[option]}
            </button>
          ))}
        </div>
      )}
      {profile.voiceActors[language] && (
        <p>
          Voice actor: <bdi lang="en">{profile.voiceActors[language]}</bdi>
        </p>
      )}

      <div className="chips" role="group" aria-label="Voice line type">
        <span aria-hidden="true">Type</span>
        {groups.map((group) => (
          <button
            key={group.label}
            type="button"
            className="pill"
            aria-pressed={group.combat === combat}
            onClick={() => {
              halt()
              setCombat(group.combat)
            }}
          >
            {group.label} ({profile.voices.filter((voice) => voice.combat === group.combat).length})
          </button>
        ))}
      </div>

      {/* The key puts the list back at the top when the group changes. */}
      <ul className="lines" key={String(combat)}>
        {profile.voices
          .filter((voice) => voice.combat === combat)
          .map((voice) => {
            const state = playing?.id === voice.id ? playing.state : null
            const silent = !voice.audio[language]
            return (
              <li key={voice.id}>
                <button
                  type="button"
                  className="line"
                  disabled={silent}
                  aria-pressed={state !== null && state !== 'failed'}
                  onClick={() => toggle(voice)}
                >
                  <i aria-hidden="true">{silent ? '—' : state ? icons[state] : '▶'}</i>
                  <span>
                    <b lang="en">{voice.title}</b>
                    <span lang="en">{voice.text}</span>
                    {state === 'failed' && <b role="alert">Audio failed to play.</b>}
                  </span>
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
