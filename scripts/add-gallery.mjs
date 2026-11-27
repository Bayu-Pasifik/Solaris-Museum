// Copies the pictures of the namecards, titles and achievement groups of
// https://encore.moe into the Gallery.
//
//   node scripts/add-gallery.mjs            only the pictures that are not on the site yet
//   node scripts/add-gallery.mjs --force    every picture again
//
// Writes the list to public/data/gallery.json (the Gallery type is in src/lib/gallery.ts)
// and the pictures to public/art/gallery/. Needs no Blender.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, get, root } from './encore.mjs'
import { plain } from './profile.mjs'

const AT_ONCE = 6

const force = process.argv.includes('--force')
const list = async (kind) => (await get(`${API}${kind}`)).json()[`${kind}List`]

/** Source URL of every picture that the list names, keyed by its file name without ".webp". */
const wanted = new Map()

/** ".../T_Card1.webp" is listed by its name. An empty URL gives undefined. */
function picture(url) {
  const name = url?.match(/([\w-]+)\.webp$/)?.[1]
  if (name) wanted.set(name, url)
  return name
}

const [cards, titles, categories] = await Promise.all(
  ['namecard', 'title', 'achievement'].map(list),
)

const gallery = {
  cards: cards
    .sort((a, b) => a.Id - b.Id)
    .map((card) => ({ id: card.Id, name: plain(card.Name), picture: picture(card.CardPath) })),
  titles: titles
    .sort((a, b) => a.SortIndex - b.SortIndex || a.Id - b.Id)
    .map((title) => ({
      id: title.Id,
      name: plain(title.TitleName),
      background: picture(title.TitleBgIcon),
      avatar: picture(title.RoleHeadIcon),
      left: picture(title.DecorateLeftIcon),
      right: picture(title.DecorateRightIcon),
    })),
  achievements: categories.map((category) => ({
    id: category.Id,
    name: plain(category.Name),
    picture: picture(category.TexturePath),
    groups: category.Groups.map((group) => ({
      id: group.Id,
      name: plain(group.Name),
      icon: picture(group.Icon),
      count: group.Achievements.length,
    })),
  })),
}

const folder = join(root, 'public', 'art', 'gallery')
const saved = (name) =>
  [`${name}.webp`, `${name}.png`].find((file) => existsSync(join(folder, file)))

/** The API has no WebP for some newer pictures; its file storage still has the PNG. */
async function download(name, url) {
  const png = url
    .replace('//api-v2.encore.moe/', '//s3-storage-api.encore.moe/')
    .replace(/webp$/, 'png')
  for (const source of [url, png]) {
    try {
      const { buffer } = await get(source)
      writeFileSync(join(folder, `${name}.${source.split('.').pop()}`), buffer)
      return
    } catch (error) {
      if (source === png) console.warn(`  ${error.message}`)
    }
  }
}

mkdirSync(folder, { recursive: true })
const queue = [...wanted].filter(([name]) => force || !saved(name))
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    while (queue.length > 0) await download(...queue.shift())
  }),
)

// The names become paths. A picture that could not be downloaded is left out of the list.
const PICTURES = new Set(['picture', 'background', 'avatar', 'icon', 'left', 'right'])
const toPath = (key, value) => {
  if (!PICTURES.has(key) || !value) return value
  const file = saved(value)
  return file && `art/gallery/${file}`
}
mkdirSync(join(root, 'public', 'data'), { recursive: true })
writeFileSync(join(root, 'public', 'data', 'gallery.json'), JSON.stringify(gallery, toPath) + '\n')

const missing = [...wanted.keys()].filter((name) => !saved(name))
console.log(
  `${cards.length} namecards, ${titles.length} titles, ` +
    `${categories.length} achievement categories, ${wanted.size - missing.length} pictures`,
)
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(', ')}`)
  process.exit(1)
}
