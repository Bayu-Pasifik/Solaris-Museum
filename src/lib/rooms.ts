export type Room = {
  name: string
  description: string
  color: string
  /** Rooms without a path are not built yet. */
  path?: string
  /**
   * The Resonator who stands by the door and what they say. The words are our own, not lines of
   * the game.
   */
  guard?: { id: string; line: string }
}

export const rooms: Room[] = [
  {
    name: 'Armory',
    description: 'Weapon collection',
    color: '#ffb86b',
    path: '/armory',
    guard: { id: 'mortefi', line: 'The weapon collection is here. Look all you like, just be careful.' },
  },
  {
    name: 'Resonator Hall',
    description: 'Character collection',
    color: '#ff5fa8',
    path: '/resonator',
    guard: { id: 'yangyang', line: 'Welcome! The Resonators are waiting beyond this portal.' },
  },
  {
    name: 'Library',
    description: 'Story archive',
    color: '#8f8df7',
    path: '/library',
    guard: { id: 'encore', line: 'So many stories here! Which one will you read first?' },
  },
  {
    name: 'Glossary',
    description: 'Terms of Solaris',
    color: '#f5c542',
    path: '/glossary',
    guard: { id: 'baizhi', line: 'Puzzled by a Solaris term? You will find it explained here.' },
  },
  {
    name: 'Messages',
    description: 'Resonator chats',
    color: '#c77dff',
    path: '/messages',
    guard: { id: 'lumi', line: 'You have mail! Come see what the Resonators are chatting about.' },
  },
  {
    name: 'Documents',
    description: 'Records of Solaris',
    color: '#c9976b',
    path: '/documents',
    guard: { id: 'aalto', line: 'Looking for records? You came to the right door.' },
  },
  {
    name: 'Gallery',
    description: 'Namecard, title, achievement',
    color: '#4fd1b5',
    path: '/gallery',
    guard: { id: 'zhezhi', line: 'Namecards, titles and achievements are on display inside.' },
  },
  {
    name: 'Map Room',
    description: 'Regions and area reports',
    color: '#7ecb55',
    path: '/map',
    guard: { id: 'jiyan', line: 'Study the terrain first. Maps and area reports are here.' },
  },
  {
    name: 'Bestiary',
    description: 'Monsters and their records',
    color: '#e5544b',
    path: '/bestiary',
    guard: { id: 'calcharo', line: 'Know the monsters before you face them.' },
  },
  {
    name: 'Echo Room',
    description: 'Echoes and Sonata sets',
    color: '#46c8ff',
    path: '/echo',
    guard: { id: 'xiangli-yao', line: 'Echoes and Sonata sets are neatly stored in this room.' },
  },
]
