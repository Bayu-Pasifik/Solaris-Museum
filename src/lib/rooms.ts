export type Room = {
  name: string
  description: string
  color: string
  /** Rooms without a path are not built yet. */
  path?: string
  /**
   * The Resonator who stands by the door and what they say. The words are our own, not lines of
   * the game. After a change of "id", run scripts/build-guards.mjs.
   */
  guard?: { id: string; line: string }
}

export const rooms: Room[] = [
  {
    name: 'Armory',
    description: 'Koleksi senjata',
    color: '#ffb86b',
    path: '/armory',
    guard: { id: 'mortefi', line: 'Koleksi senjata ada di sini. Lihat boleh, asal hati-hati.' },
  },
  {
    name: 'Hall Resonator',
    description: 'Koleksi karakter',
    color: '#ff5fa8',
    path: '/resonator',
    guard: { id: 'yangyang', line: 'Selamat datang! Para Resonator menunggu di balik portal ini.' },
  },
  {
    name: 'Perpustakaan',
    description: 'Arsip cerita',
    color: '#8f8df7',
    path: '/library',
    guard: { id: 'encore', line: 'Banyak cerita di sini! Mau baca yang mana dulu?' },
  },
  {
    name: 'Glosarium',
    description: 'Istilah Solaris',
    color: '#f5c542',
    path: '/glossary',
    guard: { id: 'baizhi', line: 'Bingung dengan istilah Solaris? Penjelasannya ada di sini.' },
  },
  {
    name: 'Pesan',
    description: 'Obrolan Resonator',
    color: '#c77dff',
    path: '/messages',
    guard: { id: 'lumi', line: 'Ada pesan masuk! Ayo lihat obrolan para Resonator.' },
  },
  {
    name: 'Dokumen',
    description: 'Catatan Solaris',
    color: '#c9976b',
    path: '/documents',
    guard: { id: 'aalto', line: 'Cari catatan? Kamu datang ke pintu yang tepat.' },
  },
  {
    name: 'Galeri',
    description: 'Namecard, title, achievement',
    color: '#4fd1b5',
    path: '/gallery',
    guard: { id: 'zhezhi', line: 'Namecard, title, dan achievement dipajang di dalam.' },
  },
  {
    name: 'Ruang Peta',
    description: 'Wilayah dan laporan area',
    color: '#7ecb55',
    path: '/map',
    guard: { id: 'jiyan', line: 'Pelajari medannya dulu. Peta dan laporan area ada di sini.' },
  },
  {
    name: 'Bestiary',
    description: 'Monster dan catatannya',
    color: '#e5544b',
    path: '/bestiary',
    guard: { id: 'calcharo', line: 'Kenali monsternya sebelum berhadapan dengan mereka.' },
  },
  {
    name: 'Ruang Echo',
    description: 'Echo dan set Sonata',
    color: '#46c8ff',
    path: '/echo',
    guard: { id: 'xiangli-yao', line: 'Echo dan set Sonata tersimpan rapi di ruangan ini.' },
  },
]
