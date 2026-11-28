import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'

const Lobby = lazy(() => import('./pages/Lobby'))
const ResonatorHall = lazy(() => import('./pages/ResonatorHall'))
const Library = lazy(() => import('./pages/Library'))
const Armory = lazy(() => import('./pages/Armory'))
const Gallery = lazy(() => import('./pages/Gallery'))
const MapRoom = lazy(() => import('./pages/MapRoom'))

export default function App() {
  return (
    <Suspense fallback={<p className="notice">Memuat ruangan…</p>}>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/resonator" element={<ResonatorHall />} />
        <Route path="/resonator/:id" element={<ResonatorHall />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/:id" element={<Library />} />
        <Route path="/armory" element={<Armory />} />
        <Route path="/armory/:id" element={<Armory />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:section" element={<Gallery />} />
        <Route path="/map" element={<MapRoom />} />
        <Route path="/map/:region" element={<MapRoom />} />
        <Route path="/map/:region/:area" element={<MapRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
