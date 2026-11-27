import { useEffect, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { rooms } from '../lib/rooms'
import { impact } from '../lib/sakuga'
import Disclaimer from '../components/Disclaimer'

export default function Lobby() {
  const navigate = useNavigate()
  const timer = useRef<number>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Wait a moment before leaving, so the hit can be seen.
  const enter = (path: string) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => navigate(path), window.SakugaFX?.calm ? 0 : 500)
  }

  return (
    <div className="wrap">
      <header>
        <h1>Solaris Museum</h1>
        <p className="lede">Museum 3D buatan penggemar. Pilih portal untuk masuk ruangan.</p>
      </header>

      <main className="grid">
        {rooms.map((room) => {
          const style = { '--portal': room.color } as CSSProperties
          const { path } = room

          return (
            <section className="card" key={room.name}>
              <h2>
                {room.name}
                {!path && <span>Segera hadir</span>}
              </h2>
              <p className="how">{room.description}</p>
              <div className="stage">
                {path ? (
                  // Mouse shortcut only: the button below is the keyboard and screen reader target.
                  <button
                    type="button"
                    className="portal"
                    style={style}
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={(event) => {
                      impact(event.currentTarget)
                      enter(path)
                    }}
                  />
                ) : (
                  <div className="portal" style={style} aria-hidden="true" />
                )}
              </div>
              <div className="acts">
                {path ? (
                  <sakuga-button onClick={() => enter(path)}>Masuk ruangan</sakuga-button>
                ) : (
                  <sakuga-button variant="secondary" disabled>
                    Belum dibuka
                  </sakuga-button>
                )}
              </div>
            </section>
          )
        })}
      </main>

      <Disclaimer />
    </div>
  )
}
