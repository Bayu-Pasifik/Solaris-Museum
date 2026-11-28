import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

/** Height of the middle of a weapon above the podium. Every model is 1.6 at its longest. */
const HEIGHT = 0.98

/** A still weapon that floats gently over the podium. */
export default function WeaponModel({ url, onReady }: { url: string; onReady: () => void }) {
  const root = useRef<Group>(null)
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { scene } = useGLTF(url, false, true)
  // A loaded model can stand in one place only, and the Armory can show a weapon twice: in the
  // hall and in the report.
  const model = useMemo(() => clone(scene), [scene])

  useEffect(() => onReady(), [scene, onReady])

  useFrame(({ clock }) => {
    if (!root.current) return
    const lift = window.SakugaFX?.calm ? 0 : Math.sin(clock.elapsedTime * 1.4) * 0.04
    root.current.position.y = HEIGHT + lift
  })

  return (
    <group ref={root} position={[0, HEIGHT, 0]}>
      <primitive object={model} />
    </group>
  )
}
