// Uploads public/models, public/art and public/data, which are not in Git, over FTPS.
//
//   node scripts/upload-assets.mjs            upload what is new or changed, then verify
//   node scripts/upload-assets.mjs --dry-run  only say what would be uploaded
//   node scripts/upload-assets.mjs --check    only look for missing files here, no server
//
// Needs FTP_SERVER, FTP_USERNAME and FTP_PASSWORD, in the environment or in .env.local.
// FTP_DIR (default "public_html") is the web folder; use "./" if the account starts there.
// FTP_PORT is only needed when the server does not use the usual port.

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const FOLDERS = ['models', 'art', 'data']
const TRIES = 3

/** The hashes of the files as they were last uploaded, to see changes that keep the size. */
const RECORD = join(root, 'work', 'upload-assets.json')

const dryRun = process.argv.includes('--dry-run')
const checkOnly = process.argv.includes('--check')

const stop = (message) => {
  console.error(message)
  process.exit(1)
}

/** Every file below public/<folder>, as a path inside public/. */
function localFiles(folder) {
  const here = join(root, 'public', folder)
  if (!existsSync(here)) return []
  return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'Thumbs.db') return []
    const path = posix.join(folder, entry.name)
    return entry.isDirectory() ? localFiles(path) : [path]
  })
}

/** The paths that the data files point to, but that are not in public/. */
function brokenLinks(files) {
  const have = new Set(files)
  const broken = new Map()
  for (const file of files.filter((path) => path.endsWith('.json'))) {
    const visit = (value) => {
      if (typeof value === 'string') {
        if (/^(art|models|data)\/.+\.\w+$/.test(value) && !have.has(value)) broken.set(value, file)
      } else if (value && typeof value === 'object') Object.values(value).forEach(visit)
    }
    try {
      visit(JSON.parse(readFileSync(join(root, 'public', file), 'utf8')))
    } catch (error) {
      stop(`public/${file} is not valid JSON: ${error.message}`)
    }
  }
  return broken
}

async function hashOf(path) {
  const hash = createHash('sha1')
  for await (const part of createReadStream(path)) hash.update(part)
  return hash.digest('hex')
}

/** The size of every file on the server below the asset folders, by path inside the web folder. */
async function remoteFiles(client, base) {
  const found = new Map()
  const walk = async (path) => {
    for (const entry of await client.list(posix.join(base, path))) {
      if (entry.name === '.' || entry.name === '..') continue
      const next = posix.join(path, entry.name)
      if (entry.isDirectory) await walk(next)
      else found.set(next, entry.size)
    }
  }
  // Listing a folder that is not there fails on some servers, so look at the web folder first.
  const top = await client.list(base)
  for (const folder of FOLDERS) {
    if (top.some((entry) => entry.isDirectory && entry.name === folder)) await walk(folder)
  }
  return found
}

/** The lists that the pages start from go last, so they never name a file that is not there. */
const order = (path) => (/^data\/[^/]+$/.test(path) ? 2 : path.startsWith('data/') ? 1 : 0)

const files = FOLDERS.flatMap(localFiles)
if (files.length === 0) stop('There are no files in public/models, public/art or public/data.')

const broken = brokenLinks(files)
if (broken.size > 0) {
  for (const [path, from] of broken) console.error(`Missing: ${path} (named in ${from})`)
  stop(`${broken.size} files are missing here. Nothing was uploaded.`)
}
console.log(`${files.length} files here, none of the files that the data names is missing.`)
if (checkOnly) process.exit(0)

if (existsSync(join(root, '.env.local'))) process.loadEnvFile(join(root, '.env.local'))
const { FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, FTP_PORT, FTP_DIR = 'public_html' } = process.env
if (!FTP_SERVER || !FTP_USERNAME || !FTP_PASSWORD) {
  stop('Set FTP_SERVER, FTP_USERNAME and FTP_PASSWORD, for example in .env.local.')
}

const local = new Map()
for (const path of files) {
  const full = join(root, 'public', path)
  local.set(path, { full, size: statSync(full).size, hash: await hashOf(full) })
}

const target = `${FTP_USERNAME}@${FTP_SERVER}:${FTP_PORT ?? 21}/${FTP_DIR}`
const saved = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : {}
const record = saved.target === target ? saved.files : {}
const keep = () => {
  mkdirSync(dirname(RECORD), { recursive: true })
  writeFileSync(RECORD, JSON.stringify({ target, files: record }) + '\n')
}

// Loaded here, so --check works without it.
const { Client } = await import('basic-ftp')
const client = new Client(60_000)
let base
async function connect() {
  await client.access({
    host: FTP_SERVER,
    port: FTP_PORT ? Number(FTP_PORT) : 21,
    user: FTP_USERNAME,
    password: FTP_PASSWORD,
    secure: true,
  })
  base ??= posix.resolve(await client.pwd(), FTP_DIR)
}

try {
  await connect()
  console.log(`Reading the files in ${base} on the server…`)
  const remote = await remoteFiles(client, base)

  const queue = []
  for (const [path, { size, hash }] of local) {
    let why
    if (!remote.has(path)) why = 'new'
    else if (remote.get(path) !== size) why = 'other size'
    else if (record[path] === undefined) {
      // Without a record, an equal size is all that is known. The data files are small and
      // change in place, so they are sent again; models and pictures are taken as they are.
      if (path.endsWith('.json')) why = 'not recorded'
      else record[path] = hash
    } else if (record[path] !== hash) why = 'changed'
    if (why) queue.push({ path, why })
  }
  queue.sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path))

  const megabytes = queue.reduce((sum, { path }) => sum + local.get(path).size, 0) / 1e6
  console.log(`${queue.length} files to upload (${megabytes.toFixed(1)} MB).`)
  const extra = [...remote.keys()].filter((path) => !local.has(path))
  if (extra.length > 0) {
    console.log(`${extra.length} files are only on the server and are left alone, for example:`)
    for (const path of extra.slice(0, 5)) console.log(`  ${path}`)
  }

  if (dryRun) {
    for (const { path, why } of queue) console.log(`  ${path} (${why})`)
  } else {
    const made = new Set()
    for (const [index, { path, why }] of queue.entries()) {
      const to = posix.join(base, path)
      for (let attempt = 1; ; attempt++) {
        try {
          if (client.closed) await connect()
          if (!made.has(posix.dirname(to))) {
            await client.ensureDir(posix.dirname(to))
            made.add(posix.dirname(to))
          }
          await client.uploadFrom(local.get(path).full, to)
          break
        } catch (error) {
          // A file that was cut off must not count as uploaded in a later run.
          delete record[path]
          if (attempt === TRIES) throw new Error(`${path}: ${error.message}`)
          console.warn(`  ${path} failed (${error.message}), trying again`)
          client.close()
        }
      }
      record[path] = local.get(path).hash
      console.log(`[${index + 1}/${queue.length}] ${path} (${why})`)
      if (index % 50 === 49) keep()
    }
    keep()

    if (client.closed) await connect()
    const after = await remoteFiles(client, base)
    const wrong = files.filter((path) => after.get(path) !== local.get(path).size)
    if (wrong.length > 0) {
      for (const path of wrong) console.error(`Missing or incomplete on the server: ${path}`)
      process.exitCode = 1
    } else console.log(`All ${files.length} files are on the server.`)
  }
} catch (error) {
  if (!dryRun) keep()
  console.error(`Upload stopped: ${error.message}\nRun the script again to continue.`)
  process.exitCode = 1
} finally {
  client.close()
}
