import { useEffect, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import { LoopOnce, LoopRepeat, type AnimationAction, type Group } from 'three'

// These clips end in another pose than they start in, so repeating them makes a visible jump.
const PLAY_ONCE = /^(Jump|Dodge|Attack\d+|Burst\d+|StandChange)$/

type Props = {
  url: string
  animation: string
  /** Plays the current clip once, also when it could loop. */
  playOnce?: boolean
  onClips: (names: string[]) => void
  /** Called when a clip that plays once has ended. */
  onFinished: () => void
}

export default function CharacterModel({
  url,
  animation,
  playOnce = false,
  onClips,
  onFinished,
}: Props) {
  const root = useRef<Group>(null)
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { scene, animations } = useGLTF(url, false, true)
  const { actions, mixer } = useAnimations(animations, root)

  useEffect(() => {
    // Skinned meshes move away from their bind-pose bounds, so skip frustum culling.
    scene.traverse((object) => {
      object.frustumCulled = false
    })
    onClips(animations.map((clip) => clip.name))
  }, [scene, animations, onClips])

  const previous = useRef<AnimationAction>(null)

  useEffect(() => {
    const action = actions[animation] ?? actions[animations[0]?.name]
    if (!action) return
    action.reset()
    // Crossfade only between clips: fading in the first one blends from the T-pose.
    if (previous.current && previous.current !== action) action.fadeIn(0.3)
    previous.current = action
    const once = playOnce || PLAY_ONCE.test(action.getClip().name)
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity)
    // Hold the last pose, so the crossfade to the next clip starts from it.
    action.clampWhenFinished = once
    const finished = (event: { action: AnimationAction }) => {
      if (event.action === action) onFinished()
    }
    mixer.addEventListener('finished', finished)
    action.play()
    return () => {
      mixer.removeEventListener('finished', finished)
      action.fadeOut(0.3)
    }
  }, [actions, mixer, animations, animation, playOnce, onFinished])

  return (
    <group ref={root}>
      <primitive object={scene} />
    </group>
  )
}
