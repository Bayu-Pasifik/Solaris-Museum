import type { Profile } from '../lib/profiles'
import IconList from './IconList'

export default function SkillPanel({ profile }: { profile: Profile }) {
  return (
    <div className="panel">
      {profile.skills.length === 0 && <p>Belum ada daftar skill untuk karakter ini.</p>}
      <IconList entries={profile.skills.map((skill) => ({ ...skill, label: skill.type }))} />
    </div>
  )
}
