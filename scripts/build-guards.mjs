// Writes the light models of the Resonators to public/models/guards/.
//
//   node scripts/build-guards.mjs
//
// They stand in the lobby (as the guards of src/lib/rooms.ts) and in the walk through the
// Resonator Hall. Each light model is the model of that Resonator with only two clips, the idle
// one and one greeting, so it is much smaller to download. Its morph targets (the shapes of the
// face) are left out when neither clip moves them: they take tens of megabytes of graphics
// memory, and the page stands still while they are loaded. The bones, the mesh and the textures
// stay as they are. Needs the full models in public/models/.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

await MeshoptDecoder.ready

const root = fileURLToPath(new URL('..', import.meta.url))
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
/** Clips that work as a greeting, in order of preference. */
const GREETINGS = [/^Stand1_Action/, /^Team_Stand/]
const MESHOPT = 'EXT_meshopt_compression'

const align = (length) => Math.ceil(length / 4) * 4

/** A weight below this does not show. */
const STILL = 0.001
/** The numbers of an accessor, by its "componentType": how to read them, and what 1 is. */
const NUMBERS = {
  5120: [Int8Array, 127],
  5121: [Uint8Array, 255],
  5122: [Int16Array, 32767],
  5123: [Uint16Array, 65535],
  5126: [Float32Array, 1],
}

/** The bytes of a buffer view, unpacked if meshopt packed them. */
function bytesOf(gltf, bin, index) {
  const view = gltf.bufferViews[index]
  const packed = view.extensions?.[MESHOPT]
  const { byteOffset = 0, byteLength } = packed ?? view
  const data = bin.subarray(byteOffset, byteOffset + byteLength)
  if (!packed) return data
  const { count, byteStride, mode, filter } = packed
  const target = new Uint8Array(count * byteStride)
  MeshoptDecoder.decodeGltfBuffer(target, count, byteStride, data, mode, filter)
  return target
}

/** Whether an accessor of single numbers holds one that shows as a weight. */
function shows(gltf, bin, index) {
  const { componentType, count, bufferView, byteOffset = 0, sparse } = gltf.accessors[index]
  const [Numbers, one] = NUMBERS[componentType]
  const some = (view, offset, length) => {
    const stride = gltf.bufferViews[view].byteStride ?? Numbers.BYTES_PER_ELEMENT
    // A copy, so the numbers start where the typed array needs them to.
    const data = new Uint8Array(
      bytesOf(gltf, bin, view).subarray(offset, offset + length * stride),
    )
    return new Numbers(data.buffer).some((value) => Math.abs(value) / one > STILL)
  }
  return (
    (bufferView !== undefined && some(bufferView, byteOffset, count)) ||
    (sparse !== undefined &&
      some(sparse.values.bufferView, sparse.values.byteOffset ?? 0, sparse.count))
  )
}

/**
 * Takes the morph targets out of a model, unless it rests with one of them showing or one of its
 * clips moves one. Tells whether it did.
 */
function dropStillShapes(gltf, bin) {
  const meshes = gltf.meshes ?? []
  const nodes = gltf.nodes ?? []
  if (!meshes.some((mesh) => mesh.primitives.some((primitive) => primitive.targets))) return false
  const rests = [...meshes, ...nodes].some((holder) =>
    holder.weights?.some((weight) => Math.abs(weight) > STILL),
  )
  const moves = gltf.animations.some((clip) =>
    clip.channels.some(
      (channel) =>
        channel.target.path === 'weights' &&
        shows(gltf, bin, clip.samplers[channel.sampler].output),
    ),
  )
  if (rests || moves) return false

  for (const mesh of meshes) {
    delete mesh.weights
    delete mesh.extras?.targetNames
    for (const primitive of mesh.primitives) delete primitive.targets
  }
  for (const node of nodes) delete node.weights
  for (const clip of gltf.animations) {
    clip.channels = clip.channels.filter((channel) => channel.target.path !== 'weights')
    // The samplers that are left without a channel go too, so their data is not copied.
    const used = [...new Set(clip.channels.map((channel) => channel.sampler))]
    for (const channel of clip.channels) channel.sampler = used.indexOf(channel.sampler)
    clip.samplers = used.map((index) => clip.samplers[index])
  }
  return true
}

/** Returns the GLB with only the named clips, and without the data that only others used. */
function keepClips(file, names) {
  const jsonLength = file.readUInt32LE(12)
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength))
  const bin = file.subarray(28 + jsonLength)

  gltf.animations = gltf.animations.filter((clip) => names.includes(clip.name))
  const still = dropStillShapes(gltf, bin)

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
  return { data: Buffer.concat([header, body]), still }
}

const characters = JSON.parse(readFileSync(join(root, 'public', 'data', 'characters.json'), 'utf8'))
const folder = join(root, 'public', 'models', 'guards')
mkdirSync(folder, { recursive: true })

for (const character of characters) {
  const file = readFileSync(join(root, 'public', character.model))
  const clips = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12))).animations.map(
    (clip) => clip.name,
  )
  const greeting = GREETINGS.flatMap((pattern) => clips.filter((name) => pattern.test(name)))[0]
  const light = keepClips(file, [character.defaultAnimation, greeting])
  writeFileSync(join(folder, `${character.id}.glb`), light.data)
  const size = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`
  const note = light.still ? '' : ', keeps its morph targets'
  console.log(`${character.id}: ${size(file.length)} to ${size(light.data.length)}${note}`)
}
