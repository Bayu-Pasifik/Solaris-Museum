import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { rooms } from '../lib/rooms'
import RoomCard from '../components/RoomCard'
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
        {rooms.map((room) => (
          <RoomCard key={room.name} room={room} onEnter={enter} />
        ))}
      </main>

      <Disclaimer />
    </div>
  )
}
