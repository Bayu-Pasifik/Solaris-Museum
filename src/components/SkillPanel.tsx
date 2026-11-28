import type { Profile } from '../lib/profiles'
import IconList from './IconList'

export default function SkillPanel({ profile }: { profile: Profile }) {
  return (
    <div className="panel">
      {profile.skills.length === 0 && <p>No skill list for this character yet.</p>}
      <IconList entries={profile.skills.map((skill) => ({ ...skill, label: skill.type }))} />
    </div>
  )
}
