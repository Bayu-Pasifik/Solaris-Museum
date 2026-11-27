// Adds weapons to the Armory.
//
//   node scripts/add-weapon.mjs <encore.moe weapon id> [...]
//   node scripts/add-weapon.mjs --all
//
// For each id it downloads the picture into public/art/weapons/, then the model and the
// main textures into assets-raw/weapons/, converts them to GLB with Blender, writes
// public/models/weapons/<slug>.glb and updates public/data/weapons.json.
// With --all it takes every weapon in the list of the API that is not on the site yet.
// Needs Node 22.15+ (zstd), the UEFormat addon source in tools/ueformat/src,
// and Blender on PATH or in the BLENDER environment variable.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  API,
  addAll,
  addMaterials,
  addPicture,
  convert,
  download,
  get,
  root,
  saveEntry,
  slugOf,
} from './encore.mjs'
import { plain } from './profile.mjs'

const PICTURES = 'https://api-v2.encore.moe/resource/Data'

/** "12%/12%/12%" is the same at every rank, so it is shown once. */
const collapse = (text) =>
  text.replace(/[\d.]+%?(?:\/[\d.]+%?)+/g, (ranks) => {
    const values = new Set(ranks.split('/'))
    return values.size === 1 ? [...values][0] : ranks
  })

/** Colored numbers would hide the count that picks "time" or "times", so spans go first. */
const description = (text) => plain(collapse((text ?? '').replace(/<\/?span\b[^>]*>/g, '')))

async function add(id) {
  const data = (await get(`${API}weapon/${id}`)).json()
  const name = data.WeaponName
  const skin = data.Model3D?.find((item) => item.Kind === 'skin')
  if (!skin) throw new Error(`${name}: no 3D model`)

  const slug = slugOf(name)
  const folder = join(root, 'assets-raw', 'weapons', slug)
  console.log(`\n== ${name} (${slug})`)

  // "/Game/Aki/x/T_A.T_A" is the picture ".../Game/Aki/x/T_A.webp".
  const picture = data.IconMiddle && `${PICTURES}${data.IconMiddle.replace(/\.[^./]*$/, '')}.webp`
  await addPicture('picture', picture, `weapons/${slug}`)

  // Swords come with a scabbard and gauntlets with a second hand, listed under Parts.
  const models = []
  for (const url of [skin.Model, ...(skin.Parts ?? [])]) models.push(await download(url, folder))
  const materials = await addMaterials(models, folder)

  const output = join(root, 'public', 'models', 'weapons', `${slug}.glb`)
  const textures = join(root, 'work', 'textures', 'weapons', slug)
  const type = data.WeaponTypeName
  convert('convert-weapon.py', { type, models, materials, textures, output }, folder)

  saveEntry('weapons.json', {
    id: slug,
    sourceId: data.ItemId,
    name,
    type,
    rarity: data.QualityId,
    model: `models/weapons/${slug}.glb`,
    description: plain(data.BgDescription),
    // The first and the last level; the levels in between are not shown.
    stats: (data.Properties ?? []).map((stat) => ({
      name: stat.Name,
      min: stat.GrowthValues[0]?.Value ?? '',
      max: stat.GrowthValues.at(-1)?.Value ?? '',
    })),
    skill: { name: plain(data.ResonName), description: description(data.Desc) },
  })
}

/** The ids of the weapons in the API that the site does not have yet. */
async function missing() {
  const file = join(root, 'public', 'data', 'weapons.json')
  const known = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const ids = new Set(known.map((item) => item.sourceId))
  const { weapons } = (await get(`${API}weapon`)).json()
  return weapons.map((item) => item.Id).filter((id) => !ids.has(id))
}

const args = process.argv.slice(2)
const ids = args.includes('--all') ? await missing() : args
if (args.length === 0) {
  console.error('Usage: node scripts/add-weapon.mjs <weapon id> [...] | --all')
  process.exit(1)
}

await addAll(ids, add)
