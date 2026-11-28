import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { DoubleSide, Mesh, MeshToonMaterial } from 'three'
import { BAY } from '../lib/corridor'
import corridorUrl from '../assets/lobby/corridor.glb?url'

/** Bays behind the first stop, which the camera stands in, and behind the last one. */
const BEFORE = 3
const AFTER = 2

/** A corridor of "bays", made by scripts/build-lobby.py, with a carpet of the given color. */
export default function Corridor({ bays, carpet }: { bays: number; carpet: string }) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(corridorUrl, false, true)
  const paint = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  const cloth = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => cloth.dispose(), [cloth])
  useEffect(() => {
    cloth.color.set(carpet)
  }, [cloth, carpet])

  const { bay, runner, end } = nodes
  if (!(bay instanceof Mesh && runner instanceof Mesh && end instanceof Mesh)) return null
  const places = Array.from({ length: BEFORE + bays + AFTER }, (_, index) => index - BEFORE)

  return (
    <group>
      {places.map((index) => (
        <group key={index} position={[0, 0, -index * BAY]}>
          <mesh geometry={bay.geometry} material={paint} raycast={() => null} />
          <mesh geometry={runner.geometry} material={cloth} raycast={() => null} />
        </group>
      ))}
      <mesh
        geometry={end.geometry}
        material={paint}
        position={[0, 0, -(bays + AFTER - 0.5) * BAY]}
        raycast={() => null}
      />
    </group>
  )
}

useGLTF.preload(corridorUrl, false, true)
