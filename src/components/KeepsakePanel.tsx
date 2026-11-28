import { assetUrl } from '../lib/characters'
import { useTerms } from '../lib/glossary'
import type { Profile } from '../lib/profiles'
import GameText from './GameText'

/** The belongings of a character, shown like the pieces of a display case. */
export default function KeepsakePanel({ profile }: { profile: Profile }) {
  const keepsakes = profile.keepsakes ?? []
  const terms = useTerms()
  const seen = new Set<number>()

  return (
    <div className="panel">
      {keepsakes.length === 0 && <p>Belum ada barang kenangan untuk karakter ini.</p>}
      <ul className="keepsakes">
        {keepsakes.map((item) => (
          <li key={item.name}>
            {item.picture && <img src={assetUrl(item.picture)} alt="" loading="lazy" />}
            <h3 lang="en">{item.name}</h3>
            <GameText text={terms.link(item.text, seen)} terms={terms.byId} />
          </li>
        ))}
      </ul>
    </div>
  )
}
