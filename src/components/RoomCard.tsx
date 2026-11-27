import { useState } from 'react'
import type { Room } from '../lib/rooms'
import { impact } from '../lib/sakuga'
import Portal from '../three/Portal'
import SceneBoundary from './SceneBoundary'

type Props = {
  room: Room
  onEnter: (path: string) => void
}

export default function RoomCard({ room, onEnter }: Props) {
  const [active, setActive] = useState(false)
  const { path } = room

  return (
    <section
      className="card"
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <h2>
        {room.name}
        {!path && <span>Segera hadir</span>}
      </h2>
      <p className="how">{room.description}</p>
      <div className="stage">
        <SceneBoundary message="Tampilan 3D gagal dimuat.">
          {/* Clicking is a mouse shortcut. The button below is for keyboard and screen readers. */}
          <div
            className={path ? 'portal open' : 'portal'}
            aria-hidden="true"
            onClick={
              path
                ? (event) => {
                    impact(event.currentTarget)
                    onEnter(path)
                  }
                : undefined
            }
          >
            <Portal color={room.color} open={Boolean(path)} active={active} />
          </div>
        </SceneBoundary>
      </div>
      <div className="acts">
        {path ? (
          <sakuga-button onClick={() => onEnter(path)}>Masuk ruangan</sakuga-button>
        ) : (
          <sakuga-button variant="secondary" disabled>
            Belum dibuka
          </sakuga-button>
        )}
      </div>
    </section>
  )
}
