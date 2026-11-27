import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useNavigate } from 'react-router'
import { rooms, type Room } from '../lib/rooms'
import SceneBoundary from '../components/SceneBoundary'
import Disclaimer from '../components/Disclaimer'

type PortalProps = {
  room: Room
  highlighted: boolean
  onHighlight: (name: string | null) => void
}

function Portal({ room, highlighted, onHighlight }: PortalProps) {
  const navigate = useNavigate()
  const open = Boolean(room.path)

  return (
    <group
      scale={highlighted ? 1.08 : 1}
      onClick={() => room.path && navigate(room.path)}
      onPointerOver={() => open && onHighlight(room.name)}
      onPointerOut={() => onHighlight(null)}
    >
      <mesh>
        <torusGeometry args={[0.7, 0.05, 16, 64]} />
        <meshBasicMaterial color={open ? room.color : '#4a5066'} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[0.66, 64]} />
        <meshBasicMaterial
          color={room.color}
          transparent
          opacity={highlighted ? 0.35 : open ? 0.18 : 0.04}
        />
      </mesh>
    </group>
  )
}

function Portals(props: Pick<PortalProps, 'onHighlight'> & { highlighted: string | null }) {
  // Shrink the row so all portals stay visible on narrow screens. Each portal sits in the
  // middle of one of three equal columns, matching the labels below the canvas.
  const width = useThree((state) => state.viewport.width)
  const column = width / rooms.length
  const scale = Math.min(1, column / 1.7)

  return (
    <>
      {rooms.map((room, index) => (
        <group
          key={room.name}
          position={[(index - (rooms.length - 1) / 2) * column, 0, 0]}
          scale={scale}
        >
          <Portal
            room={room}
            highlighted={props.highlighted === room.name}
            onHighlight={props.onHighlight}
          />
        </group>
      ))}
    </>
  )
}

export default function Lobby() {
  const navigate = useNavigate()
  const [highlighted, setHighlighted] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.cursor = highlighted ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [highlighted])

  return (
    <main className="lobby">
      <header className="lobby-header">
        <h1>Solaris Museum</h1>
        <p>Pilih portal untuk masuk ruangan.</p>
      </header>
      <div className="lobby-stage">
        <SceneBoundary message="Tampilan 3D gagal dimuat. Pakai tombol di bawah.">
          <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 2]}>
            <Portals highlighted={highlighted} onHighlight={setHighlighted} />
            <gridHelper args={[20, 40, '#2c3348', '#1d2232']} position={[0, -1.1, 0]} />
          </Canvas>
        </SceneBoundary>
      </div>
      <nav className="lobby-nav" aria-label="Ruangan">
        {rooms.map((room) => (
          <button
            type="button"
            key={room.name}
            disabled={!room.path}
            onClick={() => room.path && navigate(room.path)}
            onPointerEnter={() => room.path && setHighlighted(room.name)}
            onPointerLeave={() => setHighlighted(null)}
            onFocus={() => room.path && setHighlighted(room.name)}
            onBlur={() => setHighlighted(null)}
          >
            <strong>{room.name}</strong>
            <span>{room.path ? room.description : 'Segera hadir'}</span>
          </button>
        ))}
      </nav>
      <Disclaimer />
    </main>
  )
}
