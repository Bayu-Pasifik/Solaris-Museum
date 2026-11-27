export type Room = {
  name: string
  description: string
  color: string
  /** Rooms without a path are not built yet. */
  path?: string
}

export const rooms: Room[] = [
  { name: 'Armory', description: 'Koleksi senjata', color: '#ffb86b' },
  { name: 'Hall Resonator', description: 'Koleksi karakter', color: '#7cc4ff', path: '/resonator' },
  { name: 'Perpustakaan', description: 'Arsip cerita', color: '#c9a0ff' },
]
