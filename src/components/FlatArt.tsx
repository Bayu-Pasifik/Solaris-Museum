import { useState } from 'react'
import { assetUrl } from '../lib/characters'

/** The still splash art, for characters without animated art. */
export default function FlatArt({ id, name }: { id: string; name: string }) {
  const [missing, setMissing] = useState(false)

  if (missing) return <p className="notice">Ilustrasi {name} belum tersedia.</p>
  return (
    <img
      className="flat-art"
      src={assetUrl(`art/${id}.webp`)}
      alt={`Ilustrasi ${name}`}
      onError={() => setMissing(true)}
    />
  )
}
