import { useState } from 'react'
import { assetUrl } from '../lib/characters'

/** The still splash art, for characters without animated art. */
export default function FlatArt({ id, name }: { id: string; name: string }) {
  const [missing, setMissing] = useState(false)

  if (missing) return <p className="notice">No artwork of {name} yet.</p>
  return (
    <img
      className="flat-art"
      src={assetUrl(`art/${id}.webp`)}
      alt={`Artwork of ${name}`}
      onError={() => setMissing(true)}
    />
  )
}
