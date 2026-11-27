// Adds characters to the Resonator hall.
//
//   node scripts/add-character.mjs <encore.moe character id> [...]
//   node scripts/add-character.mjs --art-only <encore.moe character id> [...]
//
// For each id it downloads the splash art into public/art/ and the face picture into
// public/art/faces/, and the model, the animations and the main textures into assets-raw/,
// converts them to GLB with Blender, and updates public/data/characters.json.
// With --art-only it stops after the two pictures.
// Needs Node 22.15+ (zstd), the UEFormat addon source in tools/ueformat/src,
// and Blender on PATH or in the BLENDER environment variable.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, zstdDecompressSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api-v2.encore.moe/api/en/character/'
const FILES = 'https://s3-storage-api.encore.moe/resource/Data/Game/'

// Clip name, label shown in the hall, and the possible file paths (first match wins).
// Not every character has every clip; walking and running exist for only some of them.
const clip = (name, label, ...paths) => ({ name, label, paths })
const common = (name, label, folder = '') => clip(name, label, `CommonAnim/${folder}${name}`)

const CLIPS = [
  common('Stand2', 'Santai'),
  clip('Walk', 'Jalan', 'Body/Walk_F', 'Body/fuyong/Walk_F'),
  clip('Run', 'Lari', 'Body/Run_F', 'Body/fuyong/Run_F'),
  clip('Sprint', 'Sprint', 'Body/Sprint_F'),
  clip('Jump', 'Lompat', 'Body/Jump02', 'CommonAnim/AM_Jump_Second_F'),
  clip('Dodge', 'Menghindar', 'CommonAnim/AM_Move_F'),
  common('Attack01', 'Serang 1'),
  common('Attack02', 'Serang 2'),
  common('Attack03', 'Serang 3'),
  common('Attack04', 'Serang 4'),
  common('Burst01', 'Jurus'),
  common('Stand1_Action01', 'Aksi 1'),
  common('Stand1_Action02', 'Aksi 2'),
  common('Stand1_Action03', 'Aksi 3'),
  common('StandChange', 'Ganti Gaya'),
  common('Team_Stand1', 'Pose Tim 1', 'UiAnim/'),
  common('Team_Stand2', 'Pose Tim 2', 'UiAnim/'),
  common('Team_Stand3', 'Pose Tim 3', 'UiAnim/'),
]

async function get(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response
}

/** Downloads a file once and returns its local path. */
async function download(url, folder) {
  const file = join(folder, url.slice(FILES.length))
  if (existsSync(file) && statSync(file).size > 0) return file
  const data = Buffer.from(await (await get(url)).arrayBuffer())
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
  return file
}

/** Saves a picture as public/art/<path>.webp. A character can lack it. */
async function addPicture(kind, url, path) {
  if (!url) return console.warn(`  no ${kind}`)
  try {
    const data = Buffer.from(await (await get(url)).arrayBuffer())
    const file = join(root, 'public', 'art', `${path}.webp`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  } catch (error) {
    console.warn(`  ${kind}: ${error.message}`)
  }
}

/** "Client/Content/Aki/x/T_A.1" becomes the download URL of that asset. */
const assetFile = (objectPath, extension) =>
  FILES + objectPath.replace(/^(Client\/Content\/|\/Game\/)/, '').replace(/\.[^./]*$/, '') + extension

/** Lists the material paths that a .uemodel file refers to. */
function materialPaths(file) {
  const raw = readFileSync(file)
  const zstd = raw.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))
  const gzip = raw.indexOf(Buffer.from([0x1f, 0x8b, 0x08]))
  let body = raw
  if (zstd >= 0 && zstd < 512) body = zstdDecompressSync(raw.subarray(zstd))
  else if (gzip >= 0 && gzip < 512) body = gunzipSync(raw.subarray(gzip))
  // Stop before the ".MI_name" suffix: the bytes after it are binary and can look like text.
  const found = body.toString('latin1').match(/Client\/Content\/Aki\/[\w/]+\/MI_\w+(?=\.MI_)/g)
  return [...new Set(found ?? [])]
}

async function add(id) {
  const data = await (await get(API + id)).json()
  const name = data.Name.Content
  const skin = data.Model3D?.find((item) => item.Kind === 'skin')
  if (!skin) throw new Error(`${name}: no 3D model`)

  // The Rover has a female and a male version under the same name.
  const gender = skin.Model.includes('PlayerFemale')
    ? 'Wanita'
    : skin.Model.includes('PlayerMale')
      ? 'Pria'
      : null
  const title = gender ? `${name} (${gender})` : name
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const folder = join(root, 'assets-raw', slug)
  console.log(`\n== ${title} (${slug}), skin "${skin.Name}"`)

  // The splash art goes behind the model; the face goes in the list of the hall.
  await addPicture('splash art', data.FormationRoleCard, slug)
  await addPicture('face picture', data.RoleHeadIconLarge, `faces/${slug}`)
  if (artOnly) return

  const model = await download(skin.Model, folder)

  const animations = []
  for (const { name: clipName, paths } of CLIPS) {
    // The API is not consistent about the case of folder names ("fuyong", "Fuyong").
    const url = paths
      .map((path) => `/${path}.ueanim`.toLowerCase())
      .map((end) => skin.Animations.find((item) => item.toLowerCase().endsWith(end)))
      .find(Boolean)
    if (url) animations.push({ name: clipName, file: await download(url, folder) })
    else console.warn(`  animation not found: ${clipName}`)
  }
  if (animations.length === 0) throw new Error(`${name}: no idle animation`)

  const materials = []
  for (const path of materialPaths(model)) {
    const material = path.split('/').pop()
    let texture = null
    try {
      const info = await (await get(assetFile(path + '.json', '.json'))).json()
      const main = info.Textures?.MainTex?.ObjectPath
      if (main) texture = await download(assetFile(main, '.png'), folder)
    } catch (error) {
      console.warn(`  ${material}: ${error.message}`)
    }
    materials.push({ name: material, texture })
  }
  if (!materials.some((item) => item.texture)) throw new Error(`${name}: no textures found`)

  const output = join(root, 'public', 'models', `${slug}.glb`)
  const manifest = join(folder, 'manifest.json')
  writeFileSync(
    manifest,
    JSON.stringify(
      { model, animations, materials, textures: join(root, 'work', 'textures', slug), output },
      null,
      2,
    ),
  )

  mkdirSync(dirname(output), { recursive: true })
  const log = execFileSync(
    process.env.BLENDER ?? 'blender',
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      join(root, 'scripts', 'convert-character.py'),
      '--',
      manifest,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  for (const line of log.split('\n')) if (line.startsWith('[convert]')) console.log(' ', line.trim())

  const listFile = join(root, 'public', 'data', 'characters.json')
  const list = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : []
  const entry = {
    id: slug,
    name: title,
    element: data.ElementName,
    weapon: data.WeaponTypeName,
    rarity: data.QualityId,
    model: `models/${slug}.glb`,
    defaultAnimation: animations[0].name,
    animationLabels: Object.fromEntries(
      CLIPS.filter((clip) => animations.some((item) => item.name === clip.name)).map((clip) => [
        clip.name,
        clip.label,
      ]),
    ),
  }
  // The API wraps some fields as { Content }, others are plain strings.
  for (const key of ['element', 'weapon']) entry[key] = entry[key]?.Content ?? entry[key]
  const index = list.findIndex((item) => item.id === slug)
  if (index >= 0) list[index] = entry
  else list.push(entry)
  mkdirSync(dirname(listFile), { recursive: true })
  writeFileSync(listFile, JSON.stringify(list, null, 2) + '\n')
}

const artOnly = process.argv.includes('--art-only')
const ids = process.argv.slice(2).filter((arg) => arg !== '--art-only')
if (ids.length === 0) {
  console.error('Usage: node scripts/add-character.mjs [--art-only] <character id> [...]')
  process.exit(1)
}

const failed = []
for (const id of ids) {
  try {
    await add(id)
  } catch (error) {
    failed.push(id)
    console.error(`  FAILED ${id}: ${error.message}`)
    if (error.stdout) console.error(error.stdout.slice(-3000))
    if (error.stderr) console.error(error.stderr.slice(-3000))
  }
}
if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(', ')}`)
  process.exit(1)
}
