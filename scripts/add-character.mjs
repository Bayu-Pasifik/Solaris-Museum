// Adds characters to the Resonator hall.
//
//   node scripts/add-character.mjs <encore.moe character id> [...]
//   node scripts/add-character.mjs --no-model <encore.moe character id> [...]
//
// For each id it downloads the splash art into public/art/, the face picture into
// public/art/faces/ and the skill icons into public/art/skills/, and writes the profile
// (text, voice lines, skills) to public/data/profiles/. Then it downloads the model, the
// animations and the main textures into assets-raw/, converts them to GLB with Blender,
// and updates public/data/characters.json. The voice audio stays on encore.moe.
// With --no-model it stops after the pictures and the profile. With --profile it only writes
// the profile and its pictures, and leaves the splash art and the face picture alone.
// Needs Node 22.15+ (zstd), the UEFormat addon source in tools/ueformat/src,
// and Blender on PATH or in the BLENDER environment variable.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
import { buildProfile, dropMissingAudio } from './profile.mjs'

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

/**
 * Downloads the picture that each item has under key into public/art/<folder>/, and replaces
 * the URL with the path of the file.
 */
async function addPictures(items, key, folder) {
  for (const item of items) {
    if (!item[key]) continue
    // Characters share some pictures, so a file that exists is not downloaded again.
    const path = `${folder}/${item[key].split('/').pop().replace(/\.[^.]*$/, '')}`
    const file = join(root, 'public', 'art', `${path}.webp`)
    if (!existsSync(file)) await addPicture(`picture of ${item.name}`, item[key], path)
    item[key] = existsSync(file) ? `art/${path}.webp` : ''
  }
}

/** Writes public/data/profiles/<slug>.json and downloads the pictures it points to. */
async function addProfile(data, slug) {
  const profile = buildProfile(data)
  await addPictures(profile.skills, 'icon', 'skills')
  await addPictures(profile.chain, 'icon', 'chain')
  await addPictures(profile.keepsakes, 'picture', 'keepsakes')
  const removed = await dropMissingAudio(profile.voices)
  if (removed > 0) console.warn(`  ${removed} voice files are not on the server`)
  const file = join(root, 'public', 'data', 'profiles', `${slug}.json`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(profile) + '\n')
}

async function add(id) {
  const data = (await get(`${API}character/${id}`)).json()
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
  const slug = slugOf(title)

  const folder = join(root, 'assets-raw', slug)
  console.log(`\n== ${title} (${slug}), skin "${skin.Name}"`)

  if (profileOnly) return addProfile(data, slug)

  // The splash art goes behind the model; the face goes in the list of the hall.
  await addPicture('splash art', data.FormationRoleCard, slug)
  await addPicture('face picture', data.RoleHeadIconLarge, `faces/${slug}`)
  await addProfile(data, slug)
  if (noModel) return

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

  const materials = await addMaterials([model], folder)

  const output = join(root, 'public', 'models', `${slug}.glb`)
  const textures = join(root, 'work', 'textures', slug)
  convert('convert-character.py', { model, animations, materials, textures, output }, folder)

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
  saveEntry('characters.json', entry)
}

const noModel = process.argv.includes('--no-model')
const profileOnly = process.argv.includes('--profile')
const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
if (ids.length === 0) {
  console.error('Usage: node scripts/add-character.mjs [--no-model | --profile] <character id> [...]')
  process.exit(1)
}

await addAll(ids, add)
