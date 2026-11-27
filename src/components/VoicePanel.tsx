import { useEffect, useRef, useState } from 'react'
import { languages, type Language, type Profile, type Voice } from '../lib/profiles'

type Playing = { id: number; state: 'loading' | 'playing' | 'failed' }

const icons = { loading: '…', playing: '■', failed: '!' }

const groups = [
  { combat: false, label: 'Obrolan' },
  { combat: true, label: 'Pertempuran' },
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
    // A line that was stopped in the meantime must not change the state.
    const report = (state: Playing['state']) => {
      if (audio.current === next) setPlaying({ id: voice.id, state })
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
        <p>Belum ada baris suara untuk karakter ini.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      {available.length === 0 ? (
        <p>Audio karakter ini belum tersedia. Teksnya tetap bisa dibaca.</p>
      ) : (
        <div className="chips" role="group" aria-label="Bahasa suara">
          <span aria-hidden="true">Bahasa</span>
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
      {profile.voiceActors[language] && <p>Pengisi suara: {profile.voiceActors[language]}</p>}

      <div className="chips" role="group" aria-label="Jenis baris suara">
        <span aria-hidden="true">Jenis</span>
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
                    <b>{voice.title}</b>
                    <span>{voice.text}</span>
                    {state === 'failed' && <b role="alert">Audio gagal diputar.</b>}
                  </span>
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
