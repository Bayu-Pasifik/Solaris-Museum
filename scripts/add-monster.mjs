// Adds monsters to the Bestiary.
//
//   node scripts/add-monster.mjs <encore.moe monster id> [...]
//   node scripts/add-monster.mjs --bosses
//   node scripts/add-monster.mjs --all
//
// For each id it downloads the head picture into public/art/bestiary/, then the model, a few
// animations and the main textures into assets-raw/monsters/, converts them to GLB with
// Blender, writes public/models/monsters/<slug>.glb and updates public/data/bestiary.json.
// With --bosses it takes the Overlord and the Calamity Class, with --all every monster.
// Several monsters share one model; it is converted once, also in a later run. With --force
// the models are converted again. A monster without a 3D model in the API is listed with its
// picture only.
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
  readList,
  root,
  saveEntry,
  slugOf,
} from './encore.mjs'
import { plain } from './profile.mjs'

/** RarityId of the Overlord Class. The Calamity Class is above it. */
const BOSS = 3

// Clip name, label shown in the Bestiary, and the file names in order of preference.
// The first one is the idle clip, which every model needs.
const clip = (name, label, ...files) => ({ name, label, files })

const CLIPS = [
  clip(
    'Stand',
    'Idle',
    'Stand2',
    'Stand02',
    'Stand1',
    'Stand01',
    'Stand',
    'Idle',
    'Stand2_Ground',
    'Stand2_Stage3',
    'Stand3',
    'Stand03',
    // The Midnight Rangers have one set of clips per weapon.
    'Stand2_Sword',
  ),
  clip('Born', 'Appear', 'Born', 'Born_Sword'),
  clip('Walk', 'Walk', 'Walk_F', 'Walk_F_Sword'),
  clip('Run', 'Run', 'Run', 'Run_F', 'Run_Sword'),
  clip('Death', 'Defeat', 'Death'),
]

/** The number of attacks that a model gets, from the lowest numbers that it has. */
const ATTACKS = 4

/**
 * The animations of the body, by file name in lower case. They are in CommonAnim/, and some
 * monsters sort them into one folder per phase ("Layer1", "02"). Folders of weapons and
 * other props have clips with the same names, so every other folder is left out.
 */
function bodyAnimations(urls) {
  const found = new Map()
  // Sorted, so the clip of the first phase wins, and one without a phase wins over all.
  const sorted = [...urls].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  for (const url of sorted) {
    const name = /\/CommonAnim\/(?:(?:Layer\d|\d\d)\/)?([^/]+)\.ueanim$/i.exec(url)?.[1]
    if (name && !found.has(name.toLowerCase())) found.set(name.toLowerCase(), url)
  }
  return found
}

function pickClips(urls) {
  const found = bodyAnimations(urls)
  const picked = CLIPS.flatMap(({ name, label, files }) => {
    const url = files.map((file) => found.get(file.toLowerCase())).find(Boolean)
    return url ? [{ name, label, url }] : []
  })

  // "Attack02" and "Attack02_1" are two takes of one attack; the plain one wins.
  const attacks = new Map()
  for (const name of [...found.keys()].sort()) {
    const number = Number(/^attack(\d+)(?:_0?1)?$/.exec(name)?.[1])
    if (number && !attacks.has(number)) attacks.set(number, found.get(name))
  }
  const chosen = [...attacks]
    .sort(([a], [b]) => a - b)
    .slice(0, ATTACKS)
    .map(([, url], index) => ({ name: `Attack0${index + 1}`, label: `Attack ${index + 1}`, url }))

  // Death goes last, after the attacks.
  const death = picked.findIndex((item) => item.name === 'Death')
  picked.splice(death < 0 ? picked.length : death, 0, ...chosen)
  return picked
}

/** The slug of a new model. Two different models can belong to monsters with one name. */
function freeSlug(name, source) {
  const taken = new Set(
    readList('bestiary.json')
      .filter((item) => item.model && item.model.source !== source)
      .map((item) => item.model.id),
  )
  let slug = slugOf(name)
  for (let number = 2; taken.has(slug); number++) slug = `${slugOf(name)}-${number}`
  return slug
}

/** The sources that this run has converted, so --force converts a shared model only once. */
const converted = new Map()

async function addModel(name, skin) {
  const source = skin.Model.split('/Game/')[1]
  const known =
    converted.get(source) ??
    (force
      ? undefined
      : readList('bestiary.json').find(
          (item) => item.model?.source === source && existsSync(join(root, 'public', item.model.url)),
        )?.model)
  if (known) {
    console.log(`  model of "${known.id}"`)
    return known
  }

  const id = freeSlug(name, source)
  const folder = join(root, 'assets-raw', 'monsters', id)

  const clips = pickClips(skin.Animations)
  if (clips[0]?.name !== 'Stand') throw new Error(`${name}: no idle animation`)
  const animations = []
  for (const item of clips) {
    animations.push({ name: item.name, file: await download(item.url, folder) })
  }

  // The parts that the game uses only for effects are left out.
  const parts = (skin.Parts ?? []).filter((url) => !/effect/i.test(url.split('/').pop()))
  const models = []
  for (const url of [skin.Model, ...parts]) models.push(await download(url, folder))
  const materials = await addMaterials(models, folder)

  const output = join(root, 'public', 'models', 'monsters', `${id}.glb`)
  const textures = join(root, 'work', 'textures', 'monsters', id)
  const info = join(folder, 'bounds.json')
  convert('convert-monster.py', { models, animations, materials, textures, output, info }, folder)

  const model = {
    id,
    source,
    url: `models/monsters/${id}.glb`,
    defaultAnimation: 'Stand',
    animationLabels: Object.fromEntries(clips.map((item) => [item.name, item.label])),
    ...JSON.parse(readFileSync(info, 'utf8')),
  }
  converted.set(source, model)
  return model
}

/** The three numbers that the game shows, at level 1 and at level 90. */
function stats(data) {
  const growth = data.GrowthRates?.['90'] ?? {}
  return ['LifeMax', 'Atk', 'Def'].flatMap((key) => {
    const stat = data.Properties?.[key]
    if (!stat) return []
    const ratio = growth[`${key}Ratio`]
    const high = ratio ? Math.round((stat.Value * ratio) / 10000) : undefined
    return [{ name: stat.Name, min: stat.Value, max: high }]
  })
}

/** The resistances in percent. The API counts 1000 as 10%. */
function resistances(data) {
  return ['Phys', 'Element1', 'Element2', 'Element3', 'Element4', 'Element5', 'Element6'].flatMap(
    (key) => {
      const stat = data.Properties?.[`DamageResistance${key}`]
      return stat ? [{ name: stat.Name.replace(/ RES$/, ''), value: stat.Value / 100 }] : []
    },
  )
}

async function add(id) {
  const data = (await get(`${API}monster/${id}`)).json()
  const name = plain(data.Name?.Content ?? data.Name)
  console.log(`\n== ${name} (${id})`)

  const picture = data.Icon?.split('/').pop().replace(/\.[^.]*$/, '')
  const file = picture && join(root, 'public', 'art', 'bestiary', `${picture}.webp`)
  // Monsters share some pictures, so a file that exists is not downloaded again.
  // The API names a PNG, and the picture hosts have it as WebP only.
  if (picture && !existsSync(file)) {
    await addPicture('picture', data.Icon.replace(/\.png$/i, '.webp'), `bestiary/${picture}`)
  }

  const skin = data.Model3D?.find((item) => item.Kind === 'skin')
  if (!skin) console.warn('  no 3D model')

  saveEntry('bestiary.json', {
    id: data.Id,
    name,
    // "Overlord Class " becomes "Overlord".
    rank: data.Rarity.replace(/\s*Class\s*$/, ''),
    rankId: data.RarityId,
    element: data.Element?.Name ?? 'Physical',
    icon: file && existsSync(file) ? `art/bestiary/${picture}.webp` : undefined,
    rumor: plain(data.UndiscoveredDes),
    description: plain(data.DiscoveredDes),
    stats: stats(data),
    resistances: resistances(data),
    model: skin ? await addModel(name, skin) : undefined,
  })
}

/** The ids of every monster of the API with at least this rank. */
async function listed(rank) {
  const { monsterList } = (await get(`${API}monster`)).json()
  return monsterList.filter((item) => item.RarityId >= rank).map((item) => item.Id)
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const named = args.filter((arg) => !arg.startsWith('--'))
const ids = args.includes('--all')
  ? await listed(0)
  : args.includes('--bosses')
    ? await listed(BOSS)
    : named
if (ids.length === 0) {
  console.error('Usage: node scripts/add-monster.mjs [--force] <monster id> [...] | --bosses | --all')
  process.exit(1)
}

await addAll(ids, add)
