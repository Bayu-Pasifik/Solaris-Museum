import type { Profile } from '../lib/profiles'
import IconList from './IconList'

export default function ChainPanel({ profile }: { profile: Profile }) {
  const chain = profile.chain ?? []

  return (
    <div className="panel">
      {chain.length === 0 && <p>Belum ada resonance chain untuk karakter ini.</p>}
      <IconList entries={chain.map((node, index) => ({ ...node, label: `Node ${index + 1}` }))} />
    </div>
  )
}
