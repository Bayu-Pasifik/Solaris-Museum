import { Suspense, useCallback, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { assetUrl, type Character } from '../lib/characters'
import CharacterModel from './CharacterModel'
import Optional from './Optional'
import { useShared } from './shared'

type Props = {
  character: Character
  position: [number, number, number]
  /** The way the guard faces while nobody is near. */
  turn: number
  /** True while the visitor is at this door; the guard then turns to them and says hello. */
  active: boolean
}

function Body({ character, position, turn, active }: Props) {
  const url = assetUrl(`models/guards/${character.id}.glb`)
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  useShared(url, useGLTF(url, false, true).scene)
  const body = useRef<Group>(null)
  const idle = character.defaultAnimation ?? ''
  const [clips, setClips] = useState<string[]>([])
  const [greeted, setGreeted] = useState(false)
  const onClips = useCallback((names: string[]) => setClips(names), [])
  const onFinished = useCallback(() => setGreeted(true), [])
  // A visitor who comes back is greeted again.
  if (greeted && !active) setGreeted(false)

  // The light model of a guard holds the idle clip and one greeting.
  const greeting = clips.find((name) => name !== idle)
  const waving = active && !greeted && !window.SakugaFX?.calm
  const animation = waving && greeting ? greeting : idle

  useFrame(({ camera }, delta) => {
    if (!body.current) return
    const goal = active
      ? Math.atan2(camera.position.x - position[0], camera.position.z - position[2])
      : turn
    // Turn the shortest way.
    const left = goal - body.current.rotation.y
    const ease = window.SakugaFX?.calm ? 1 : 1 - Math.exp(-6 * Math.min(delta, 0.05))
    body.current.rotation.y += Math.atan2(Math.sin(left), Math.cos(left)) * ease
  })

  return (
    <group position={position}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 48]} />
        <meshBasicMaterial color="#1d1a4a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <CharacterModel
          url={url}
          animation={animation}
          playOnce={animation !== idle}
          onClips={onClips}
          onFinished={onFinished}
        />
      </group>
    </group>
  )
}

/** A Resonator who stands by the door of a room, or on a stand of the Resonator Hall. */
export default function Guard(props: Props) {
  return (
    <Optional>
      <Suspense fallback={null}>
        <Body {...props} />
      </Suspense>
    </Optional>
  )
}
