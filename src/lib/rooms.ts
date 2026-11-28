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
  { name: 'Glosarium', description: 'Istilah Solaris', color: '#f5c542', path: '/glossary' },
  { name: 'Pesan', description: 'Obrolan Resonator', color: '#c77dff', path: '/messages' },
  { name: 'Dokumen', description: 'Catatan Solaris', color: '#c9976b', path: '/documents' },
  { name: 'Galeri', description: 'Namecard, title, achievement', color: '#4fd1b5', path: '/gallery' },
  { name: 'Ruang Peta', description: 'Wilayah dan laporan area', color: '#7ecb55', path: '/map' },
  { name: 'Bestiary', description: 'Monster dan catatannya', color: '#e5544b', path: '/bestiary' },
  { name: 'Ruang Echo', description: 'Echo dan set Sonata', color: '#46c8ff', path: '/echo' },
]
