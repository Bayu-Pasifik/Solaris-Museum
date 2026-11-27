import { useEffect, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { AnimationAction, Group } from 'three'

type Props = {
  url: string
  animation: string
  onClips: (names: string[]) => void
}

export default function CharacterModel({ url, animation, onClips }: Props) {
  const root = useRef<Group>(null)
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { scene, animations } = useGLTF(url, false, true)
  const { actions } = useAnimations(animations, root)

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
    action.play()
    return () => {
      action.fadeOut(0.3)
    }
  }, [actions, animations, animation])

  return (
    <group ref={root}>
      <primitive object={scene} />
    </group>
  )
}
