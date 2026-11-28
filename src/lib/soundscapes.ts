/**
 * The sound of each room, made with Web Audio while it plays, so there are no audio files.
 * A scene is slow music (long chords and single bell notes), the tone of the air in the room,
 * and a small sound of the room now and then.
 */

type Sound = 'chime' | 'paper' | 'tick' | 'metal' | 'bird' | 'growl' | 'blip' | 'sweep'

export type Preset = {
  /** The MIDI note the chords are built on. */
  root: number
  /** Each chord is a list of semitones above the root. */
  chords: number[][]
  /** Seconds from one chord to the next. */
  pace: number
  /** Average seconds between two bell notes. */
  bell: number
  /** The air of the room: noise through one filter. */
  air: { type: BiquadFilterType; frequency: number; q: number; level: number }
  /** A low steady tone, as a frequency. */
  hum?: number
  /** The small sound of the room, and the shortest and longest pause before it. */
  sound: Sound
  every: [number, number]
}

const major = [
  [0, 7, 11, 16],
  [-3, 4, 7, 12],
  [-7, 0, 4, 9],
  [-5, 2, 7, 11],
]
const minor = [
  [0, 7, 10, 15],
  [-4, 3, 7, 12],
  [-7, 0, 3, 8],
  [-2, 5, 8, 12],
]
const open = [
  [0, 7, 14, 19],
  [-5, 2, 9, 14],
  [-2, 5, 12, 17],
]

/** By the first part of the path of the room; the lobby has the empty name. */
export const presets: Record<string, Preset> = {
  '': {
    root: 50,
    chords: major,
    pace: 9,
    bell: 4,
    air: { type: 'lowpass', frequency: 420, q: 0.4, level: 0.09 },
    sound: 'chime',
    every: [9, 20],
  },
  resonator: {
    root: 52,
    chords: major,
    pace: 8,
    bell: 3,
    air: { type: 'bandpass', frequency: 900, q: 0.6, level: 0.04 },
    sound: 'chime',
    every: [6, 14],
  },
  library: {
    root: 45,
    chords: minor,
    pace: 12,
    bell: 7,
    air: { type: 'lowpass', frequency: 300, q: 0.4, level: 0.08 },
    sound: 'paper',
    every: [5, 13],
  },
  glossary: {
    root: 47,
    chords: open,
    pace: 11,
    bell: 6,
    air: { type: 'lowpass', frequency: 360, q: 0.4, level: 0.07 },
    sound: 'tick',
    every: [4, 9],
  },
  messages: {
    root: 55,
    chords: major,
    pace: 10,
    bell: 6,
    air: { type: 'lowpass', frequency: 500, q: 0.5, level: 0.06 },
    hum: 110,
    sound: 'blip',
    every: [6, 16],
  },
  documents: {
    root: 43,
    chords: minor,
    pace: 12,
    bell: 8,
    air: { type: 'lowpass', frequency: 260, q: 0.5, level: 0.09 },
    hum: 55,
    sound: 'paper',
    every: [6, 15],
  },
  armory: {
    root: 41,
    chords: open,
    pace: 11,
    bell: 9,
    air: { type: 'lowpass', frequency: 240, q: 0.8, level: 0.11 },
    hum: 65,
    sound: 'metal',
    every: [7, 17],
  },
  gallery: {
    root: 53,
    chords: major,
    pace: 10,
    bell: 3.5,
    air: { type: 'lowpass', frequency: 380, q: 0.4, level: 0.07 },
    sound: 'chime',
    every: [10, 22],
  },
  map: {
    root: 48,
    chords: open,
    pace: 10,
    bell: 6,
    air: { type: 'bandpass', frequency: 480, q: 0.5, level: 0.12 },
    sound: 'bird',
    every: [3, 10],
  },
  bestiary: {
    root: 38,
    chords: minor,
    pace: 11,
    bell: 10,
    air: { type: 'bandpass', frequency: 220, q: 1.2, level: 0.14 },
    hum: 49,
    sound: 'growl',
    every: [9, 20],
  },
  echo: {
    root: 49,
    chords: open,
    pace: 9,
    bell: 2.5,
    air: { type: 'bandpass', frequency: 1400, q: 2, level: 0.03 },
    hum: 69,
    sound: 'sweep',
    every: [5, 12],
  },
}

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12)

const between = (min: number, max: number) => min + Math.random() * (max - min)

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]

/** What all scenes share: the noise that is filtered into air, and the echo of a large hall. */
function material(context: BaseAudioContext) {
  const rate = context.sampleRate

  const noise = context.createBuffer(1, rate * 4, rate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

  const impulse = context.createBuffer(2, rate * 3, rate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
    }
  }
  return { noise, impulse }
}

const materials = new WeakMap<BaseAudioContext, ReturnType<typeof material>>()

export type Scene = {
  /** Plans everything that starts before this time of the context. */
  schedule: (until: number) => void
  /** Fades out; the scene is silent and free after this many seconds. */
  stop: (seconds: number) => void
}

export function createScene(
  context: BaseAudioContext,
  output: AudioNode,
  preset: Preset,
  fade = 2.5,
): Scene {
  let shared = materials.get(context)
  if (!shared) materials.set(context, (shared = material(context)))
  const { noise, impulse } = shared
  const start = context.currentTime

  const out = context.createGain()
  out.gain.setValueAtTime(0, start)
  out.gain.linearRampToValueAtTime(1, start + fade)
  out.connect(output)

  const hall = context.createConvolver()
  hall.buffer = impulse
  const wet = context.createGain()
  wet.gain.value = 0.5
  hall.connect(wet).connect(out)

  const loops: AudioScheduledSourceNode[] = []

  const gain = (value: number, ...targets: AudioNode[]) => {
    const node = context.createGain()
    node.gain.value = value
    targets.forEach((target) => node.connect(target))
    return node
  }

  const filter = (type: BiquadFilterType, hertz: number, q: number, target: AudioNode) => {
    const node = context.createBiquadFilter()
    node.type = type
    node.frequency.value = hertz
    node.Q.value = q
    node.connect(target)
    return node
  }

  // The air, which swells and falls slowly.
  const { air } = preset
  const breath = gain(air.level, out)
  const wind = context.createBufferSource()
  wind.buffer = noise
  wind.loop = true
  wind.connect(filter(air.type, air.frequency, air.q, breath))
  const swell = context.createOscillator()
  swell.frequency.value = 0.07
  swell.connect(gain(air.level * 0.4)).connect(breath.gain)
  loops.push(wind, swell)

  if (preset.hum) {
    const hum = context.createOscillator()
    hum.frequency.value = preset.hum
    hum.connect(gain(0.025, out))
    loops.push(hum)
  }
  loops.forEach((source) => source.start(start))

  /** One tone with a soft start and a long end. */
  const tone = (
    at: number,
    hertz: number,
    options: {
      level: number
      attack: number
      length: number
      type?: OscillatorType
      to?: number
      target?: AudioNode
    },
  ) => {
    const { level, attack, length, type = 'sine', to, target } = options
    const source = context.createOscillator()
    source.type = type
    source.frequency.setValueAtTime(hertz, at)
    if (to) source.frequency.exponentialRampToValueAtTime(to, at + length)
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(level, at + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
    source.connect(envelope)
    if (target) envelope.connect(target)
    else {
      envelope.connect(out)
      envelope.connect(hall)
    }
    source.start(at)
    source.stop(at + length)
  }

  /** One short piece of filtered noise. */
  const burst = (at: number, hertz: number, level: number, length: number) => {
    const source = context.createBufferSource()
    source.buffer = noise
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(level, at + length * 0.3)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
    envelope.connect(out)
    envelope.connect(hall)
    source.connect(filter('bandpass', hertz, 1.5, envelope))
    source.start(at, between(0, 3))
    source.stop(at + length)
  }

  // The chords are darkened, so they stay behind the other sounds.
  const pads = filter('lowpass', 900, 0.3, out)
  pads.connect(hall)

  const chord = (at: number, notes: number[]) => {
    const length = preset.pace * 1.5
    for (const note of notes) {
      for (const detune of [-0.07, 0.07]) {
        tone(at, frequency(preset.root + note + detune), {
          level: 0.022,
          attack: preset.pace * 0.4,
          length,
          type: 'triangle',
          target: pads,
        })
      }
    }
    tone(at, frequency(preset.root + notes[0] - 12), {
      level: 0.05,
      attack: preset.pace * 0.4,
      length,
      target: pads,
    })
  }

  const sounds: Record<Sound, (at: number) => void> = {
    chime: (at) => {
      const note = preset.root + 36 + pick([0, 4, 7, 11])
      ;[0, 7, 12].forEach((step, i) =>
        tone(at + i * 0.18, frequency(note + step), { level: 0.025, attack: 0.01, length: 2.5 }),
      )
    },
    paper: (at) => {
      burst(at, between(2200, 3800), 0.07, 0.25)
      burst(at + 0.2, between(1800, 3200), 0.05, 0.35)
    },
    tick: (at) => {
      for (let i = 0; i < 4; i++) {
        tone(at + i * 0.6, i % 2 ? 1500 : 1900, { level: 0.025, attack: 0.002, length: 0.07 })
      }
    },
    metal: (at) => {
      const base = between(320, 520)
      ;[1, 2.76, 5.4, 8.9].forEach((ratio, i) =>
        tone(at, base * ratio, { level: 0.03 / (i + 1), attack: 0.003, length: 2.4 / (i + 1) }),
      )
    },
    bird: (at) => {
      const base = between(2200, 3400)
      const calls = Math.floor(between(2, 5))
      for (let i = 0; i < calls; i++) {
        tone(at + i * 0.17, base, { level: 0.022, attack: 0.02, length: 0.13, to: base * 1.35 })
      }
    },
    growl: (at) => {
      const base = between(55, 80)
      tone(at, base, { level: 0.06, attack: 0.6, length: 2.8, type: 'sawtooth', to: base * 0.6, target: pads })
      burst(at, 180, 0.12, 2.2)
    },
    blip: (at) => {
      const note = preset.root + 24 + pick([0, 2, 7])
      tone(at, frequency(note), { level: 0.03, attack: 0.005, length: 0.18 })
      tone(at + 0.14, frequency(note + 5), { level: 0.03, attack: 0.005, length: 0.35 })
    },
    sweep: (at) => {
      const base = between(300, 700)
      tone(at, base, { level: 0.025, attack: 1, length: 3, to: base * pick([0.5, 2]) })
    },
  }

  let index = 0
  let nextChord = start + 0.1
  let nextBell = start + between(1, preset.bell)
  let nextSound = start + between(...preset.every) * 0.5

  return {
    schedule(until) {
      // A pause of the page must not end in everything at once.
      const now = context.currentTime
      nextChord = Math.max(nextChord, now)
      nextBell = Math.max(nextBell, now)
      nextSound = Math.max(nextSound, now)

      while (nextChord < until) {
        chord(nextChord, preset.chords[index++ % preset.chords.length])
        nextChord += preset.pace
      }
      while (nextBell < until) {
        const notes = preset.chords[Math.max(index - 1, 0) % preset.chords.length]
        tone(nextBell, frequency(preset.root + 24 + pick(notes)), {
          level: 0.03,
          attack: 0.015,
          length: 3.5,
        })
        nextBell += preset.bell * between(0.5, 1.5)
      }
      while (nextSound < until) {
        sounds[preset.sound](nextSound)
        nextSound += between(...preset.every)
      }
    },
    stop(seconds) {
      const now = context.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setValueAtTime(out.gain.value, now)
      out.gain.linearRampToValueAtTime(0, now + seconds)
      loops.forEach((source) => source.stop(now + seconds))
      // The loops end after the fade, also when the context was suspended in between.
      wind.onended = () => out.disconnect()
    },
  }
}
