import { useTerms } from '../lib/glossary'
import type { Profile } from '../lib/profiles'
import GameText, { Struck } from './GameText'

export default function ProfilePanel({ profile }: { profile: Profile }) {
  const terms = useTerms()
  const facts = [
    ['Birthday', profile.birthday],
    ['Origin', profile.country],
    ['Affiliation', profile.faction],
  ]

  return (
    <div className="panel">
      {profile.nickname && <h3 className="nickname" lang="en">
          {profile.nickname}
        </h3>}
      <GameText text={terms.link(profile.introduction, new Set())} terms={terms.byId} />

      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd lang={value ? 'en' : undefined}>
              <Struck>{value || 'Unknown'}</Struck>
            </dd>
          </div>
        ))}
      </dl>

      <h3>Stories</h3>
      {profile.stories.length === 0 && <p>No stories for this character yet.</p>}
      {profile.stories.map((story) => (
        <details key={story.title}>
          <summary lang="en">{story.title}</summary>
          {/* A story opens on its own, so it explains its own terms. */}
          <GameText text={terms.link(story.text, new Set())} terms={terms.byId} />
        </details>
      ))}
    </div>
  )
}
