import { useProgress } from '@react-three/drei'

export default function LoadingOverlay() {
  const active = useProgress((state) => state.active)
  const progress = useProgress((state) => state.progress)

  if (!active) return null
  return (
    <div className="loading" role="status">
      Memuat model… {Math.round(progress)}%
    </div>
  )
}
