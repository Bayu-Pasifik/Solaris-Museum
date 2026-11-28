import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import GlobalSearch from './components/GlobalSearch'
import { setRoom } from './lib/ambience'

const Lobby = lazy(() => import('./pages/Lobby'))
const ResonatorHall = lazy(() => import('./pages/ResonatorHall'))
const Library = lazy(() => import('./pages/Library'))
const Armory = lazy(() => import('./pages/Armory'))
const Gallery = lazy(() => import('./pages/Gallery'))
const MapRoom = lazy(() => import('./pages/MapRoom'))
const Bestiary = lazy(() => import('./pages/Bestiary'))
const EchoRoom = lazy(() => import('./pages/EchoRoom'))
const Glossary = lazy(() => import('./pages/Glossary'))
const Messages = lazy(() => import('./pages/Messages'))
const Documents = lazy(() => import('./pages/Documents'))

export default function App() {
  const room = useLocation().pathname.split('/')[1] ?? ''
  useEffect(() => setRoom(room), [room])

  return (
    <>
      <Suspense fallback={<p className="notice">Memuat ruangan…</p>}>
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/resonator" element={<ResonatorHall />} />
          <Route path="/resonator/:id" element={<ResonatorHall />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:id" element={<Library />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="/glossary/:id" element={<Glossary />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:id" element={<Messages />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<Documents />} />
          <Route path="/armory" element={<Armory />} />
          <Route path="/armory/:id" element={<Armory />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/gallery/:section" element={<Gallery />} />
          <Route path="/gallery/:section/:item" element={<Gallery />} />
          <Route path="/map" element={<MapRoom />} />
          <Route path="/map/:region" element={<MapRoom />} />
          <Route path="/map/:region/:area" element={<MapRoom />} />
          <Route path="/bestiary" element={<Bestiary />} />
          <Route path="/bestiary/:id" element={<Bestiary />} />
          <Route path="/echo" element={<EchoRoom />} />
          <Route path="/echo/:id" element={<EchoRoom />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <GlobalSearch />
    </>
  )
}
