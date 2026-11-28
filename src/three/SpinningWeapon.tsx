import { Suspense, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { assetUrl } from '../lib/characters'
import type { Weapon } from '../lib/weapons'
import Optional from './Optional'
import WeaponModel from './WeaponModel'

const noop = () => {}

type Props = {
  weapon: Weapon
  position: [number, number, number]
  turn: number
  /** True while the visitor stands here; the weapon then turns around. */
  active: boolean
}

/** A weapon on its stand in the Armory. */
export default function SpinningWeapon({ weapon, position, turn, active }: Props) {
  const spin = useRef<Group>(null)

  useFrame((_, delta) => {
    if (!spin.current || window.SakugaFX?.calm) return
    const now = spin.current.rotation.y
    // It goes round while somebody looks, and comes back to the front the short way.
    spin.current.rotation.y = active ? now + delta * 1.1 : now * Math.exp(-4 * delta)
    if (active) spin.current.rotation.y %= Math.PI * 2
  })

  return (
    <group position={position} rotation={[0, turn, 0]} scale={0.8}>
      <group ref={spin}>
        <Optional>
          <Suspense fallback={null}>
            <WeaponModel url={assetUrl(weapon.model)} onReady={noop} />
          </Suspense>
        </Optional>
      </group>
    </group>
  )
}
