import { useState, type CSSProperties } from 'react'
import { useJson, type Character } from '../lib/characters'
import { themeOf } from '../lib/elements'
import { isProfile, type Profile } from '../lib/profiles'
import { pop } from '../lib/sakuga'
import ChainPanel from './ChainPanel'
import KeepsakePanel from './KeepsakePanel'
import Marks from './Marks'
import ProfilePanel from './ProfilePanel'
import SkillPanel from './SkillPanel'
import VoicePanel from './VoicePanel'

const tabs = [
  { name: 'Profil', Panel: ProfilePanel },
  { name: 'Suara', Panel: VoicePanel },
  { name: 'Skill', Panel: SkillPanel },
  { name: 'Resonance', Panel: ChainPanel },
  { name: 'Kenangan', Panel: KeepsakePanel },
]

/** Everything about a character apart from the model. Render it with the character id as key. */
export default function Dossier({ character }: { character: Character }) {
  const state = useJson<Profile>(`data/profiles/${character.id}.json`, isProfile)
  const [open, setOpen] = useState(tabs[0].name)
  const theme = themeOf(character.element)
  const { Panel } = tabs.find((tab) => tab.name === open) ?? tabs[0]

  return (
    <section
      className="card dossier"
      aria-label={`Data ${character.name}`}
      style={
        {
          '--el-deep': theme.deep,
          '--el-pale': theme.pale,
          '--el-accent': theme.accent,
        } as CSSProperties
      }
    >
      <Marks path={`/resonator/${character.id}`} />
      <div className="tabs" role="group" aria-label="Bagian data">
        {tabs.map((tab) => (
          <button
            key={tab.name}
            type="button"
            className="pill"
            aria-pressed={tab.name === open}
            onClick={(event) => {
              pop(event.currentTarget)
              setOpen(tab.name)
            }}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <p className="notice">Memuat profil…</p>}
      {state.status === 'error' && (
        <p className="notice" role="alert">
          Profil karakter ini belum tersedia.
        </p>
      )}
      {state.status === 'ready' && <Panel profile={state.data} />}
    </section>
  )
}
