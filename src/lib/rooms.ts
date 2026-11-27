export type Room = {
  name: string
  description: string
  color: string
  /** Rooms without a path are not built yet. */
  path?: string
}

export const rooms: Room[] = [
  { name: 'Armory', description: 'Koleksi senjata', color: '#ffb86b', path: '/armory' },
  { name: 'Hall Resonator', description: 'Koleksi karakter', color: '#ff5fa8', path: '/resonator' },
  { name: 'Perpustakaan', description: 'Arsip cerita', color: '#8f8df7', path: '/library' },
  { name: 'Galeri', description: 'Namecard, title, achievement', color: '#4fd1b5', path: '/gallery' },
]
