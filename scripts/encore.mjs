// What the character and the weapon import scripts share: the encore.moe downloads,
// the material lookup and the Blender call.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { gunzipSync, zstdDecompressSync } from 'node:zlib'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const API = 'https://api-v2.encore.moe/api/en/'
/** Where the API serves the pictures that it names by their path in the game. */
export const RESOURCES = 'https://api-v2.encore.moe/resource/Data'
const FILES = 'https://s3-storage-api.encore.moe/resource/Data/Game/'
const TRIES = 4

/** Downloads a URL. A dropped connection or a server error is tried again. */
export async function get(url) {
  for (let attempt = 1; ; attempt++) {
    let error
    try {
      const response = await fetch(url)
      // The body is read here, so a connection that drops half way is retried too.
      const body = Buffer.from(await response.arrayBuffer())
      if (response.ok) return { buffer: body, json: () => JSON.parse(body.toString('utf8')) }
      error = new Error(`HTTP ${response.status}: ${url}`)
      if (response.status < 500) attempt = TRIES
    } catch (cause) {
      error = new Error(`${cause.message}: ${url}`, { cause })
    }
    if (attempt >= TRIES) throw error
    await sleep(1000 * attempt)
  }
}

/** Downloads a file once and returns its local path. */
export async function download(url, folder) {
  const file = join(folder, url.slice(FILES.length))
  if (existsSync(file) && statSync(file).size > 0) return file
  const { buffer } = await get(url)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, buffer)
  return file
}

/** Saves a picture as public/art/<path>.webp. The picture can be missing. */
export async function addPicture(kind, url, path) {
  if (!url) return console.warn(`  no ${kind}`)
  try {
    const { buffer } = await get(url)
    const file = join(root, 'public', 'art', `${path}.webp`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buffer)
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

/** Downloads the main texture of one material. Some materials have none. */
async function mainTexture(path, folder) {
  try {
    const info = (await get(assetFile(path + '.json', '.json'))).json()
    const main = info.Textures?.MainTex?.ObjectPath
    return main ? await download(assetFile(main, '.png'), folder) : null
  } catch (error) {
    console.warn(`  ${path.split('/').pop()}: ${error.message}`)
    return null
  }
}

/** Downloads the main texture of every material of the downloaded models. */
export async function addMaterials(models, folder) {
  const materials = []
  for (const path of new Set(models.flatMap(materialPaths))) {
    materials.push({ name: path.split('/').pop(), texture: await mainTexture(path, folder) })
  }
  // The game gives some models their material at run time, so the file only names "MI_Empty".
  // That material is next to the model and is named after it.
  const empty = materials.find((item) => item.name === 'MI_Empty')
  if (empty && !materials.some((item) => item.texture)) {
    const body = relative(folder, models[0]).replaceAll('\\', '/')
    empty.texture = await mainTexture(body.replace(/([^/]+)\.uemodel$/, 'MI_$1'), folder)
  }
  if (!materials.some((item) => item.texture)) throw new Error('no textures found')
  return materials
}

/** Writes the manifest and runs a converter script of this folder in Blender. */
export function convert(script, manifest, folder) {
  const file = join(folder, 'manifest.json')
  writeFileSync(file, JSON.stringify(manifest, null, 2))
  mkdirSync(dirname(manifest.output), { recursive: true })
  const log = execFileSync(
    process.env.BLENDER ?? 'blender',
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      join(root, 'scripts', script),
      '--',
      file,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  for (const line of log.split('\n')) if (line.startsWith('[convert]')) console.log(' ', line.trim())
}

/** Reads a list in public/data/. A missing file counts as an empty list. */
export function readList(name) {
  const file = join(root, 'public', 'data', name)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
}

/** Adds an entry to a list in public/data/, or replaces the one with the same id. */
export function saveEntry(name, entry) {
  const file = join(root, 'public', 'data', name)
  const list = readList(name)
  const index = list.findIndex((item) => item.id === entry.id)
  if (index >= 0) list[index] = entry
  else list.push(entry)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(list, null, 2) + '\n')
}

export const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Runs add for every id, goes on after a failure and reports the failed ids at the end. */
export async function addAll(ids, add) {
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
}
