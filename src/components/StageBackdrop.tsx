import { useState } from 'react'
import { assetUrl } from '../lib/characters'

type Props = {
  characterId: string
  /** Goes up on every hit, which plays the speed line flare again. */
  hits: number
}

/** The painted layers behind the 3D scene: sky, halftone, speed lines and splash art. */
export default function StageBackdrop({ characterId, hits }: Props) {
  const [hasArt, setHasArt] = useState(true)

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="halftone" />
      <div key={hits} className={hits ? 'speedlines flare' : 'speedlines'} />
      {hasArt && (
        <img
          className="splash"
          src={assetUrl(`art/${characterId}.webp`)}
          alt=""
          onError={() => setHasArt(false)}
        />
      )}
    </div>
  )
}
