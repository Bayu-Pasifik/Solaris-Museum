// Adds the echoes and the Sonata sets to the Echo room.
//
//   node scripts/add-echo.mjs
//   node scripts/add-echo.mjs --force
//
// It writes public/data/echo.json and the pictures in public/art/echo/. Run it after
// add-monster.mjs: the API has no 3D model of an echo (its mesh is a placeholder object),
// so each echo borrows the model of a monster that public/data/bestiary.json lists. Without
// --force it only downloads the pictures that are missing. It does not need Blender.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, addPicture, get, readList, root } from './encore.mjs'
import { plain } from './profile.mjs'

/** How many requests run at the same time. */
const PARALLEL = 8
/** The class of an echo and what it costs to equip, by the "Rarity" of the API. */
const CLASSES = [
  { rank: 'Common', cost: 1 },
  { rank: 'Elite', cost: 3 },
  { rank: 'Overlord', cost: 4 },
  { rank: 'Calamity', cost: 4 },
]

const force = process.argv.includes('--force')

async function each(items, work) {
  const results = new Array(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const at = next++
      results[at] = await work(items[at])
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, run))
  return results
}

/** The pictures to download, by their path in public/art/. Echoes share many of them. */
const pictures = new Map()

/** Notes a picture for download and returns its path inside public/. */
function picture(folder, url) {
  if (!url?.startsWith('http')) return undefined
  const name = url.split('/').pop().replace(/\.[^.]*$/, '')
  const path = `echo/${folder}/${name}`
  pictures.set(path, url.replace(/\.png$/i, '.webp'))
  return `art/${path}.webp`
}

/** The skill at its highest level. Some texts have {0}, {1}… where the numbers go. */
function skillText(skill) {
  const values = skill?.LevelDescStrArray?.at(-1)?.ArrayString ?? []
  const text = skill?.DescriptionEx || skill?.SimplyDescription || ''
  return plain(text.replace(/\{(\d+)\}/g, (mark, index) => values[index] ?? mark))
}

/** "…/Character/Monster/Boss/X/Model/X.uemodel" and the idle clip of X give the same key. */
const folderOf = (path) =>
  /Character\/(.+?)\/(?:Model|CommonAnim)\//i.exec(path ?? '')?.[1].toLowerCase()

const bestiary = readList('bestiary.json').filter((monster) => monster.model)
if (bestiary.length === 0) {
  console.error('public/data/bestiary.json has no models. Run scripts/add-monster.mjs first.')
  process.exit(1)
}
bestiary.sort((a, b) => a.id - b.id)

/** The first monster of every key; a Phantom does not stand for a folder it shares. */
function index(monsters, keyOf) {
  const found = new Map()
  for (const monster of monsters) {
    const key = keyOf(monster)
    if (key && !found.has(key)) found.set(key, monster.id)
  }
  return found
}

const byName = index(bestiary, (monster) => monster.name)
const byFolder = index(
  [...bestiary].sort((a, b) => a.name.startsWith('Phantom') - b.name.startsWith('Phantom')),
  (monster) => folderOf(monster.model.source),
)

/**
 * The monster that lends its model: the one with the name of the echo (a Phantom may take the
 * name without "Phantom: "), else the one in the folder of its idle clip, else the one with
 * the name without "Nightmare: " or "Reminiscence: ". The folder is wrong for some echoes of
 * the game modes, so the names come first.
 */
const lender = (name, detail) =>
  byName.get(name) ??
  byName.get(name.replace(/^Phantom: /, '')) ??
  byFolder.get(folderOf(detail.StandAnim)) ??
  byName.get(name.replace(/^(Nightmare|Reminiscence): /, ''))

const { Echo: list } = (await get(`${API}echo`)).json()
console.log(`${list.length} echoes`)
const details = await each(list, async (item) => (await get(`${API}echo/${item.Id}`)).json())

const sets = new Map()
for (const item of list) {
  for (const group of item.FetterGroups ?? []) {
    if (sets.has(group.Id)) continue
    sets.set(group.Id, {
      id: group.Id,
      name: plain(group.Name),
      icon: picture('sets', group.Icon),
      effects: group.Fetters.map((fetter) => ({
        pieces: fetter.Key,
        text: plain(fetter.EffectDescription),
      })).sort((a, b) => a.pieces - b.pieces),
    })
  }
}

const found = new Map(
  list.map((item, at) => [item.Id, lender(plain(item.Name), details[at])]),
)

const echoes = list.map((item, at) => {
  const detail = details[at]
  // A few entries have the key of their name instead of the name.
  const name = /^MonsterInfo_\d+_Name$/.test(item.Name) ? '' : plain(item.Name)
  const { rank, cost } = CLASSES[item.Rarity]
  return {
    id: item.Id,
    name: name || 'Tanpa nama',
    rank,
    cost,
    element: item.Element?.Name ?? 'Physical',
    // "PhantomType" 1 are the echoes of the collection; the others belong to game modes.
    kind:
      item.PhantomType !== 1
        ? 'other'
        : item.Type === 'Echo' && !name.startsWith('Phantom: ')
          ? 'echo'
          : 'phantom',
    icon: picture('icons', item.IconMiddle ?? item.Icon),
    sets: (item.FetterGroups ?? []).map((group) => group.Id),
    skill: { icon: picture('skills', detail.Skill?.BattleViewIcon), text: skillText(detail.Skill) },
    monster: found.get(item.Id) ?? found.get(detail.ParentMonsterId),
  }
})

await each([...pictures], async ([path, url]) => {
  if (force || !existsSync(join(root, 'public', 'art', `${path}.webp`))) {
    await addPicture('picture', url, path)
  }
})

// A picture that the API does not have is left out of the list.
const kept = (path) => (path && existsSync(join(root, 'public', path)) ? path : undefined)
for (const set of sets.values()) set.icon = kept(set.icon)
for (const echo of echoes) {
  echo.icon = kept(echo.icon)
  echo.skill.icon = kept(echo.skill.icon)
}

mkdirSync(join(root, 'public', 'data'), { recursive: true })
writeFileSync(
  join(root, 'public', 'data', 'echo.json'),
  JSON.stringify({ sets: [...sets.values()].sort((a, b) => a.id - b.id), echoes }) + '\n',
)

const without = echoes.filter((echo) => !echo.monster)
console.log(`${echoes.length} echoes, ${sets.size} Sonata sets, ${pictures.size} pictures`)
console.log(`${echoes.length - without.length} echoes borrow a model, ${without.length} have none:`)
console.log(`  ${without.map((echo) => `${echo.name} (${echo.id})`).join(', ')}`)
