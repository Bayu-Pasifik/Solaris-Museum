/** Flat colors, so the podium matches the outlined style of the page. */
export default function Podium({ color = '#ff5fa8' }: { color?: string }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.75, 0.75, 0.12, 64]} />
        <meshBasicMaterial attach="material-0" color="#1d1a4a" />
        <meshBasicMaterial attach="material-1" color="#f4f3fc" />
        <meshBasicMaterial attach="material-2" color="#1d1a4a" />
      </mesh>
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.66, 0.71, 64]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Offset disc: the 3D version of the hard drop shadow. */}
      <mesh position={[0.1, -0.125, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.78, 64]} />
        <meshBasicMaterial color="#b8b3ff" />
      </mesh>
    </group>
  )
}
