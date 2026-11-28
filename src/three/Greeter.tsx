import { Suspense, useCallback, useState } from 'react'
import { assetUrl, type Character } from '../lib/characters'
import CharacterModel from './CharacterModel'
import Optional from './Optional'

/** Clips that work as a greeting, in order of preference. */
const GREETINGS = [/^Stand1_Action/, /^Team_Stand/]

type Props = {
  character: Character
  position: [number, number, number]
  turn: number
  /** Called when the model is in the room. */
  onArrive: () => void
}

function Body({ character, position, turn, onArrive }: Props) {
  const idle = character.defaultAnimation ?? ''
  const [animation, setAnimation] = useState(idle)

  // Greet once on arrival, then stand and wait.
  const onClips = useCallback(
    (names: string[]) => {
      onArrive()
      if (window.SakugaFX?.calm) return
      for (const pattern of GREETINGS) {
        const found = names.filter((name) => pattern.test(name))
        if (!found.length) continue
        setAnimation(found[Math.floor(Math.random() * found.length)])
        return
      }
    },
    [onArrive],
  )
  const onFinished = useCallback(() => setAnimation(idle), [idle])

  return (
    <group position={position} rotation={[0, turn, 0]}>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 48]} />
        <meshBasicMaterial color="#1d1a4a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <CharacterModel
        url={assetUrl(character.model)}
        animation={animation}
        playOnce={animation !== idle}
        onClips={onClips}
        onFinished={onFinished}
      />
    </group>
  )
}

/** The character who stands beside the open portal and says hello. */
export default function Greeter(props: Props) {
  return (
    <Optional>
      <Suspense fallback={null}>
        <Body {...props} />
      </Suspense>
    </Optional>
  )
}
