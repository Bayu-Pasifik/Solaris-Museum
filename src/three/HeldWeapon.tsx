import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Object3D } from 'three'

// The bones that the animations of every character move for the weapon.
const LEFT = 'WeaponProp01'
const RIGHT = 'WeaponProp02'

/** Which part of a weapon goes on which bone. */
function placement(parts: Object3D[], type: string): [Object3D, string][] {
  // The scabbard of a sword stays out: no bone of the character carries it in a fitting way.
  const [first, second] = parts.filter((part) => !/scabbard/i.test(part.name))
  if (!first) return []
  if (type !== 'Pistols' && type !== 'Gauntlets') return [[first, LEFT]]

  // Pairs are two files, or one file that serves both hands.
  const left = parts.find((part) => /_L(_|$)/.test(part.name)) ?? first
  const right = parts.find((part) => /_R(_|$)/.test(part.name)) ?? second ?? first
  return [
    [left, LEFT],
    [right, RIGHT],
  ]
}

type Props = {
  /** The scene of the character that holds the weapon. */
  body: Object3D
  url: string
  type: string
}

/** Puts a weapon into the hands of a character for as long as it is rendered. */
export default function HeldWeapon({ body, url, type }: Props) {
  const { scene } = useGLTF(url, false, true)

  useEffect(() => {
    const added = placement(scene.children, type).map(([part, bone]) => {
      // A copy, so that the loaded file can be used again.
      const copy = part.clone()
      copy.traverse((object) => {
        object.frustumCulled = false
      })
      body.getObjectByName(bone)?.add(copy)
      return copy
    })
    return () => added.forEach((copy) => copy.removeFromParent())
  }, [body, scene, type])

  return null
}
