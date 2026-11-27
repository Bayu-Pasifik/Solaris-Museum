import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useNavigate } from 'react-router'
import { assetUrl, useCharacters } from '../lib/characters'
import { rooms } from '../lib/rooms'
import { impact } from '../lib/sakuga'
import LobbyScene, { LOBBY_FOV } from '../three/LobbyScene'
import SceneBoundary from '../components/SceneBoundary'
import Disclaimer from '../components/Disclaimer'

const GREETINGS = [
  'Selamat datang di Solaris Museum!',
  'Halo! Koleksi Resonator ada di balik portal ini.',
  'Kamu datang juga. Ayo, masuk lewat portal ini.',
  'Hai! Mau lihat-lihat? Aku tunggu di dalam.',
]

export default function Lobby() {
  const navigate = useNavigate()
  const timer = useRef<number>(undefined)
  const viewport = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string>()
  const [focused, setFocused] = useState<string>()
  const [entering, setEntering] = useState<string>()
  const [arrived, setArrived] = useState(false)
  const onArrive = useCallback(() => setArrived(true), [])

  // One roll per visit decides who greets and what they say.
  const [roll] = useState(() => [Math.random(), Math.random()])
  const state = useCharacters()
  const characters = state.status === 'ready' ? state.data : []
  const greeter = characters[Math.floor(roll[0] * characters.length)]
  const greeting = GREETINGS[Math.floor(roll[1] * GREETINGS.length)]

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Wait a moment before leaving, so the hit and the walk into the portal can be seen.
  const enter = (path: string) => {
    setEntering(path)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => navigate(path), window.SakugaFX?.calm ? 0 : 500)
  }

  // A click on a portal in the room also gets the big hit, where it was clicked.
  const select = (path: string, pointer: { x: number; y: number }) => {
    const element = viewport.current
    if (element) {
      const box = element.getBoundingClientRect()
      impact(element, (pointer.x - box.left) / box.width, (pointer.y - box.top) / box.height)
    }
    enter(path)
  }

  const pointed = rooms.find((room) => room.name === hovered)

  return (
    <div className="wrap">
      <header>
        <h1>Solaris Museum</h1>
        <p className="lede">Museum 3D buatan penggemar. Pilih portal untuk masuk ruangan.</p>
      </header>

      <main>
        <div className={pointed?.path ? 'lobby pointing' : 'lobby'} ref={viewport}>
          <SceneBoundary message="Tampilan 3D gagal dimuat.">
            {/* Clicking a portal is a mouse shortcut. The buttons below are for keyboard and screen readers. */}
            <Canvas
              flat
              aria-hidden="true"
              camera={{ position: [0, 2.6, 9.5], fov: LOBBY_FOV }}
              dpr={[1, 2]}
            >
              <LobbyScene
                rooms={rooms}
                active={hovered ?? focused}
                entering={entering}
                greeter={greeter}
                onHover={setHovered}
                onSelect={select}
                onArrive={onArrive}
              />
            </Canvas>
          </SceneBoundary>

          {greeter && arrived && (
            <div className="dialogue" role="status">
              <img
                src={assetUrl(`art/faces/${greeter.id}.webp`)}
                alt=""
                onError={(event) => (event.currentTarget.hidden = true)}
              />
              <p>
                <b>{greeter.name}</b>
                {greeting}
              </p>
            </div>
          )}
        </div>

        <div className="grid">
          {rooms.map((room) => {
            const { path } = room
            return (
              <section
                key={room.name}
                className="card"
                onPointerEnter={() => setFocused(room.name)}
                onPointerLeave={() => setFocused(undefined)}
                onFocus={() => setFocused(room.name)}
                onBlur={() => setFocused(undefined)}
              >
                <h2>
                  {room.name}
                  {!path && <span>Segera hadir</span>}
                </h2>
                <p className="how">{room.description}</p>
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
        </div>
      </main>

      <Disclaimer />
    </div>
  )
}
