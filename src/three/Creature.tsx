import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { LoopOnce, LoopRepeat, MathUtils, Mesh, Texture, type Group, type Object3D } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { assetUrl } from '../lib/characters'
import type { MonsterModel } from '../lib/bestiary'
import type { Roam } from '../lib/roam'
import type { Den } from '../lib/wilds'
import { fit } from './MonsterStand'

/** How close a walker must be before a monster turns to look. */
const NOTICE = 13

/** How many monsters on the map use a model. */
const users = new Map<string, number>()

function dispose(scene: Object3D) {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    for (const material of [object.material].flat()) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

/**
 * A walk passes hundreds of monsters, so a model is dropped when the last one that uses it is
 * out of sight.
 */
function useShared(url: string, scene: Object3D) {
  useEffect(() => {
    users.set(url, (users.get(url) ?? 0) + 1)
    return () => {
      users.set(url, users.get(url)! - 1)
      // Later, because a new user can come in the same moment.
      setTimeout(() => {
        if (users.get(url) !== 0) return
        users.delete(url)
        dispose(scene)
        useGLTF.clear(url)
      })
    }
  }, [url, scene])
}

type Props = {
  model: MonsterModel
  den: Den
  roam: RefObject<Roam>
  /** True while the visitor stands at this den. */
  active: boolean
}

/** A monster that lives on the map: it watches a walker who is close, and greets one. */
export default function Creature({ model, den, roam, active }: Props) {
  const url = assetUrl(model.url)
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { scene, animations } = useGLTF(url, false, true)
  useShared(url, scene)
  // Several monsters can share a model, and each needs bones of its own.
  const body = useMemo(() => {
    const copy = clone(scene)
    // Skinned meshes move away from their bind-pose bounds, so skip frustum culling.
    copy.traverse((object) => {
      object.frustumCulled = false
    })
    return copy
  }, [scene])
  const root = useRef<Group>(null)
  const { actions, mixer } = useAnimations(animations, root)

  const idle = model.defaultAnimation
  const greeting = ['Born', 'Attack1'].find((name) => animations.some((clip) => clip.name === name))
  const [greets, setGreets] = useState(false)
  const [was, setWas] = useState(false)
  if (active !== was) {
    setWas(active)
    setGreets(active && Boolean(greeting) && !window.SakugaFX?.calm)
  }
  const wanted = greets ? greeting! : idle

  const previous = useRef('')
  useEffect(() => {
    const action = actions[wanted] ?? actions[animations[0]?.name]
    if (!action) return
    const once = greets
    action.reset()
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity)
    action.clampWhenFinished = once
    // Fading in the first clip would blend from the T-pose.
    if (previous.current && previous.current !== wanted) action.fadeIn(0.3)
    previous.current = wanted
    const finished = (event: { action: unknown }) => {
      if (once && event.action === action) setGreets(false)
    }
    mixer.addEventListener('finished', finished)
    action.play()
    return () => {
      mixer.removeEventListener('finished', finished)
      action.fadeOut(0.3)
    }
  }, [actions, mixer, animations, wanted, greets])

  const { scale, position } = fit(model, den.size[0], den.size[1])
  const turned = useRef<Group>(null)
  const grown = useRef(0)

  useFrame((_, delta) => {
    if (!turned.current) return
    const step = Math.min(delta, 0.05)
    const calm = window.SakugaFX?.calm
    grown.current = calm ? 1 : MathUtils.damp(grown.current, 1, 8, step)
    turned.current.scale.setScalar(0.6 + 0.4 * grown.current)
    const dx = roam.current.x - den.position[0]
    const dz = roam.current.z - den.position[2]
    const goal = Math.hypot(dx, dz) < NOTICE ? Math.atan2(dx, dz) : den.turn
    // The shortest way around.
    const off = goal - turned.current.rotation.y
    turned.current.rotation.y += Math.atan2(Math.sin(off), Math.cos(off)) * (calm ? 1 : 1 - Math.exp(-4 * step))
  })

  return (
    <group position={den.position}>
      <group ref={turned} rotation={[0, den.turn, 0]} scale={0.6}>
        <group ref={root} position={position} scale={scale}>
          <primitive object={body} />
        </group>
      </group>
    </group>
  )
}
