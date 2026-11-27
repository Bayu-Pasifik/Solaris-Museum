export default function Podium({ color = '#7cc4ff' }: { color?: string }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.75, 0.85, 0.12, 64]} />
        <meshStandardMaterial color="#2a3042" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.66, 0.7, 64]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4, 64]} />
        <meshStandardMaterial color="#161a26" roughness={1} />
      </mesh>
    </group>
  )
}
