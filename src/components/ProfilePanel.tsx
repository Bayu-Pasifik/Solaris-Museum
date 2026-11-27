import type { Profile } from '../lib/profiles'
import GameText, { Struck } from './GameText'

export default function ProfilePanel({ profile }: { profile: Profile }) {
  const facts = [
    ['Ulang tahun', profile.birthday],
    ['Asal', profile.country],
    ['Afiliasi', profile.faction],
  ]

  return (
    <div className="panel">
      {profile.nickname && <h3 className="nickname">{profile.nickname}</h3>}
      <GameText text={profile.introduction} />

      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Struck>{value || 'Tidak diketahui'}</Struck>
            </dd>
          </div>
        ))}
      </dl>

      <h3>Cerita</h3>
      {profile.stories.length === 0 && <p>Belum ada cerita untuk karakter ini.</p>}
      {profile.stories.map((story) => (
        <details key={story.title}>
          <summary>{story.title}</summary>
          <GameText text={story.text} />
        </details>
      ))}
    </div>
  )
}
