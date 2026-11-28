import { useEffect, useMemo, type ComponentProps } from 'react'
import { useGLTF } from '@react-three/drei'
import { DoubleSide, Mesh, MeshToonMaterial } from 'three'
import type { ElementTheme } from '../lib/elements'
import arenaUrl from '../assets/bestiary/arena.glb?url'
import ElementParticles from './ElementParticles'
import MonsterStand from './MonsterStand'

type Props = ComponentProps<typeof MonsterStand> & { element: string; theme: ElementTheme }

/** The arena: a ring of broken stones, and the chosen monster on the dais in the middle. */
export default function ArenaScene({ element, theme, ...stand }: Props) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(arenaUrl, false, true)

  const paint = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  const trim = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => trim.dispose(), [trim])
  useEffect(() => {
    trim.color.set(theme.accent)
    trim.emissive.set(theme.accent).multiplyScalar(0.35)
  }, [trim, theme])

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-5, 11, 7]} intensity={1.7} />

      {(['arena', 'accent'] as const).map((name) => {
        const part = nodes[name]
        return part instanceof Mesh ? (
          <mesh
            key={name}
            geometry={part.geometry}
            material={name === 'accent' ? trim : paint}
            raycast={() => null}
          />
        ) : null
      })}

      <group scale={2.6}>
        <ElementParticles key={element} element={element} theme={theme} />
      </group>

      <MonsterStand {...stand} />
    </>
  )
}

useGLTF.preload(arenaUrl, false, true)
