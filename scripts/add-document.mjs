// Copies the documents, notes, photos and recordings that can be found in the game.
//
//   node scripts/add-document.mjs            only the pictures that are not on the site yet
//   node scripts/add-document.mjs --force    every picture again
//
// Writes public/data/documents.json (the types are in src/lib/documents.ts) and the pictures
// to public/art/documents/. Needs no Blender.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, addPicture, get, root } from './encore.mjs'
import { plain } from './profile.mjs'

const AT_ONCE = 6

/** The type of the game, as the shelf of the page. Types 1 and 2 are both pictures. */
const KINDS = { 1: 'picture', 2: 'picture', 3: 'text', 4: 'record', 5: 'foreign' }

/** Entries that the game has not filled in. */
const UNFINISHED = /^(test\/|placeholder$|please contact our customer service)/i
const UNKNOWN = /^[?？\s]*$/

const force = process.argv.includes('--force')
const read = async (path) => (await get(`${API}${path}`)).json()

/** The names of the maps, to tell where a document with coordinates lies. */
const maps = await read('map')

function regionOf(location) {
  if (!location) return undefined
  const same = maps.filter((map) => map.mapId === location.mapId)
  if (same.length === 1) return same[0].name
  const inside = ({ bounds: [[left, bottom], [right, top]] }) =>
    location.x >= left && location.x <= right && location.y >= bottom && location.y <= top
  return same.find(inside)?.name
}

const clean = (text) =>
  plain(text?.replace(/<align\w+\s*\/>/g, ''))
    // A strikethrough can run over several lines, and the page reads one line at a time.
    .replace(/<s>([\s\S]*?)<\/s>/g, (_, struck) =>
      struck
        .split('\n')
        .map((line) => line && `<s>${line}</s>`)
        .join('\n'),
    )

/**
 * The source is "Interaction Point", a place with coordinates ("Jinzhou - -398, 1136, 17") or
 * the name of the thing that holds the text. Only the last two say something, and a number
 * instead of a place name is internal.
 */
function originOf(source, title) {
  const text = clean(source)
  const place = text.match(/^(.*?) - -?\d+, -?\d+, -?\d+$/)?.[1]
  if (place !== undefined) return /^\d+$/.test(place) ? {} : { place }
  return text === 'Interaction Point' || text === title ? {} : { source: text }
}

/** ".../T_InformationBtu1_UI.webp" is kept as art/documents/T_InformationBtu1_UI.webp. */
const pictureName = (url) => url.match(/([\w-]+)\.webp$/)?.[1]
const artFile = (name) => join(root, 'public', 'art', 'documents', `${name}.webp`)

const queue = (await read('info')).infoList.map((item) => item.Id)
const total = queue.length
const details = []

// The list cuts every text short, so each document is read on its own. A failed download stops
// the script, so the file is never written with documents missing.
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    while (queue.length > 0) details.push(await read(`info/${queue.shift()}`))
  }),
)

const pictures = new Map(
  details.flatMap((item) => item.Picture.map((url) => [pictureName(url), url])),
)
pictures.delete(undefined)
for (const [name, url] of pictures) {
  if (force || !existsSync(artFile(name))) await addPicture('picture', url, `documents/${name}`)
}

const documents = []
const left = []
for (const item of details.sort((a, b) => a.Id - b.Id)) {
  const title = clean(item.Title)
  const text = clean(item.Text)
  const saved = item.Picture.map(pictureName)
    .filter((name) => name && existsSync(artFile(name)))
    .map((name) => `art/documents/${name}.webp`)

  // A "???" text says nothing, unless a picture comes with it.
  if (UNFINISHED.test(title) || UNFINISHED.test(text) || (UNKNOWN.test(text) && !saved.length)) {
    left.push(item.Id)
    continue
  }

  const region = regionOf(item.SourceLocation)
  documents.push({
    id: item.Id,
    kind: KINDS[item.Type] ?? 'text',
    title,
    text: UNKNOWN.test(text) ? '' : text,
    ...(region && { region }),
    ...originOf(item.Source, title),
    ...(saved.length > 0 && { pictures: saved }),
  })
}

mkdirSync(join(root, 'public', 'data'), { recursive: true })
writeFileSync(join(root, 'public', 'data', 'documents.json'), JSON.stringify(documents) + '\n')

const missing = [...pictures.keys()].filter((name) => !existsSync(artFile(name)))
console.log(
  `${documents.length} of ${total} documents saved, ${left.length} without a text, ` +
    `${pictures.size - missing.length} pictures`,
)
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(', ')}`)
  process.exit(1)
}
