import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'

const Lobby = lazy(() => import('./pages/Lobby'))
const ResonatorHall = lazy(() => import('./pages/ResonatorHall'))

export default function App() {
  return (
    <Suspense fallback={<p className="notice">Memuat ruangan…</p>}>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/resonator" element={<ResonatorHall />} />
        <Route path="/resonator/:id" element={<ResonatorHall />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
