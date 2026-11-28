// Writes the light models of the lobby guards to public/models/guards/.
//
//   node scripts/build-guards.mjs
//
// The guards are listed in src/lib/rooms.ts. Each light model is the model of that Resonator
// with only two clips, the idle one and one greeting, so it is much smaller to download. The
// mesh and the textures stay as they are. Needs the full models in public/models/.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rooms } from '../src/lib/rooms.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
/** Clips that work as a greeting, in order of preference. */
const GREETINGS = [/^Stand1_Action/, /^Team_Stand/]
const MESHOPT = 'EXT_meshopt_compression'

const align = (length) => Math.ceil(length / 4) * 4

/** Returns the GLB with only the named clips, and without the data that only others used. */
function keepClips(file, names) {
  const jsonLength = file.readUInt32LE(12)
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength))
  const bin = file.subarray(28 + jsonLength)

  gltf.animations = gltf.animations.filter((clip) => names.includes(clip.name))

  // Every place that points to an accessor, as the object and the key that hold the number.
  const uses = []
  const use = (holder, key) => holder?.[key] !== undefined && uses.push([holder, key])
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.extensions) throw new Error('a compressed primitive is not supported')
      for (const set of [primitive.attributes, ...(primitive.targets ?? [])]) {
        for (const key of Object.keys(set)) use(set, key)
      }
      use(primitive, 'indices')
    }
  }
  for (const skin of gltf.skins ?? []) use(skin, 'inverseBindMatrices')
  for (const clip of gltf.animations) {
    // A clip can hold samplers that no channel uses; their data then stays, which is harmless.
    for (const sampler of clip.samplers) {
      use(sampler, 'input')
      use(sampler, 'output')
    }
  }

  const accessors = []
  const accessorAt = new Map()
  for (const [holder, key] of uses) {
    const old = holder[key]
    if (!accessorAt.has(old)) accessorAt.set(old, accessors.push(gltf.accessors[old]) - 1)
    holder[key] = accessorAt.get(old)
  }
  gltf.accessors = accessors

  const views = []
  const viewAt = new Map()
  const parts = []
  let length = 0
  /** Bytes of the buffer without data, which meshopt unpacks into. */
  let unpacked = 0
  const copy = (offset, size) => {
    const start = length
    parts.push(bin.subarray(offset, offset + size), Buffer.alloc(align(size) - size))
    length += align(size)
    return start
  }
  // A sparse accessor, as the face shapes use, keeps its data in two more places.
  const holders = gltf.accessors.flatMap((accessor) => [
    accessor,
    ...(accessor.sparse ? [accessor.sparse.indices, accessor.sparse.values] : []),
  ])
  for (const holder of [...holders, ...(gltf.images ?? [])]) {
    const old = holder.bufferView
    if (old === undefined) continue
    if (!viewAt.has(old)) {
      const view = gltf.bufferViews[old]
      const packed = view.extensions?.[MESHOPT]
      if (packed) {
        packed.byteOffset = copy(packed.byteOffset ?? 0, packed.byteLength)
        view.byteOffset = unpacked
        unpacked += align(view.byteLength)
      } else {
        if (view.buffer !== 0) throw new Error('data outside the file is not supported')
        view.byteOffset = copy(view.byteOffset ?? 0, view.byteLength)
      }
      viewAt.set(old, views.push(view) - 1)
    }
    holder.bufferView = viewAt.get(old)
  }
  gltf.bufferViews = views
  gltf.buffers[0].byteLength = length
  if (gltf.buffers[1]) gltf.buffers[1].byteLength = unpacked

  const text = Buffer.from(JSON.stringify(gltf))
  const json = Buffer.concat([text, Buffer.alloc(align(text.length) - text.length, ' ')])
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(data.length, 0)
    head.writeUInt32LE(type, 4)
    return [head, data]
  }
  const body = Buffer.concat([...chunk(JSON_CHUNK, json), ...chunk(BIN_CHUNK, Buffer.concat(parts))])
  const header = Buffer.alloc(12)
  header.write('glTF', 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + body.length, 8)
  return Buffer.concat([header, body])
}

const characters = JSON.parse(readFileSync(join(root, 'public', 'data', 'characters.json'), 'utf8'))
const folder = join(root, 'public', 'models', 'guards')
mkdirSync(folder, { recursive: true })

for (const { guard } of rooms) {
  if (!guard) continue
  const character = characters.find((item) => item.id === guard.id)
  if (!character) throw new Error(`${guard.id}: not in characters.json`)
  const file = readFileSync(join(root, 'public', character.model))
  const clips = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12))).animations.map(
    (clip) => clip.name,
  )
  const greeting = GREETINGS.flatMap((pattern) => clips.filter((name) => pattern.test(name)))[0]
  const light = keepClips(file, [character.defaultAnimation, greeting])
  writeFileSync(join(folder, `${guard.id}.glb`), light)
  const size = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`
  console.log(`${guard.id}: ${size(file.length)} to ${size(light.length)}`)
}
