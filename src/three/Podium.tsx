import type { ElementTheme } from '../lib/elements'

/** Flat colors, so the podium matches the outlined style of the page. */
export default function Podium({ theme }: { theme: ElementTheme }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.12, 64]} />
        <meshBasicMaterial attach="material-0" color={theme.deep} />
        <meshBasicMaterial attach="material-1" color={theme.pale} />
        <meshBasicMaterial attach="material-2" color={theme.deep} />
      </mesh>
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.63, 0.71, 64]} />
        <meshBasicMaterial color={theme.accent} />
      </mesh>
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.57, 64]} />
        <meshBasicMaterial color={theme.accent} />
      </mesh>
      {/* Offset disc: the 3D version of the hard drop shadow. */}
      <mesh position={[0.1, -0.125, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 64]} />
        <meshBasicMaterial color={theme.accent} />
      </mesh>
    </group>
  )
}
