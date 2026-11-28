import { useSyncExternalStore } from 'react'
import { createScene, presets, type Scene } from './soundscapes'

/**
 * Plays the sound of the open room. A browser only allows sound after the visitor has pressed
 * something, so it starts with the first press. The choice of the sound button is kept in this
 * browser.
 */

const KEY = 'solaris-museum:sound'
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12)
const VOLUME = 0.8
/** Seconds that are planned ahead; the timer is much faster. */
const AHEAD = 1.5

function load() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

let on = load()
let room = ''
let scene: { name: string; sound: Scene } | undefined
let timer: number | undefined
let audio: { context: AudioContext; power: GainNode; voice: GainNode } | undefined
let ducked = false
const listeners = new Set<() => void>()

function open() {
  const context = new AudioContext()
  // "power" follows the button; "voice" makes room for a voice line.
  const power = context.createGain()
  const voice = context.createGain()
  power.gain.value = 0
  voice.gain.value = ducked ? 0.15 : 1
  power.connect(voice).connect(context.destination)
  return { context, power, voice }
}

function tick() {
  if (!audio) return
  if (scene?.name !== room) {
    scene?.sound.stop(2)
    const preset = presets[room] ?? presets['']
    scene = { name: room, sound: createScene(audio.context, audio.power, preset) }
  }
  scene.sound.schedule(audio.context.currentTime + AHEAD)
}

const wanted = () => on && !document.hidden

/** Starts or stops the sound, to match the button and whether the page is seen. */
function apply() {
  if (!audio) return
  const { context, power } = audio
  power.gain.setTargetAtTime(wanted() ? VOLUME : 0, context.currentTime, 0.15)
  window.clearInterval(timer)
  if (wanted()) {
    void context.resume()
    tick()
    timer = window.setInterval(tick, 400)
  } else {
    // After the fade; a hidden page stops at once.
    window.setTimeout(
      () => {
        if (!wanted()) void context.suspend()
      },
      document.hidden ? 0 : 600,
    )
  }
}

function wake() {
  if (!wanted() || audio?.context.state === 'running') return
  // Some keys, like Shift alone, do not count as a press for the browser.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  try {
    audio ??= open()
  } catch {
    return // No sound in this browser; the museum works without it.
  }
  apply()
}

// "capture", so a room that stops the event does not keep the museum silent.
for (const type of ['pointerup', 'keydown']) window.addEventListener(type, wake, true)
document.addEventListener('visibilitychange', apply)

export function setRoom(name: string) {
  room = name
  if (audio && wanted()) tick()
}

/** One short note over the sound of the room, such as the one of a key that is walked on. */
export function playNote(note: number) {
  if (!audio || !wanted() || audio.context.state !== 'running') return
  const { context, power } = audio
  const now = context.currentTime
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0, now)
  envelope.gain.linearRampToValueAtTime(0.07, now + 0.012)
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)
  envelope.connect(power)
  // The note and a quiet one an octave above it, which makes it ring like a bell.
  for (const [ratio, type] of [
    [1, 'triangle'],
    [2, 'sine'],
  ] as const) {
    const source = context.createOscillator()
    source.type = type
    source.frequency.value = frequency(note) * ratio
    source.connect(envelope)
    source.start(now)
    source.stop(now + 1.2)
  }
}

let rail: AudioBuffer | undefined

/** The wheels of a train over a joint of the rails: two low knocks, one after the other. */
export function playClack() {
  if (!audio || !wanted() || audio.context.state !== 'running') return
  const { context, power } = audio
  if (!rail) {
    // A short burst of noise that dies away.
    rail = context.createBuffer(1, Math.floor(context.sampleRate * 0.09), context.sampleRate)
    const samples = rail.getChannelData(0)
    for (let index = 0; index < samples.length; index++) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length) ** 3
    }
  }
  for (const [after, level] of [
    [0, 0.3],
    [0.16, 0.2],
  ]) {
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const volume = context.createGain()
    source.buffer = rail
    filter.type = 'lowpass'
    filter.frequency.value = 420
    volume.gain.value = level
    source.connect(filter).connect(volume).connect(power)
    source.start(context.currentTime + after)
  }
}

/** A hammer on hot steel; "level" goes from 0, far away, to 1, beside the anvil. */
export function playClang(level: number) {
  if (level <= 0 || !audio || !wanted() || audio.context.state !== 'running') return
  const { context, power } = audio
  const now = context.currentTime
  // A low thud, and over it tones that do not fit each other, which is what sounds like metal.
  for (const [pitch, volume, length] of [
    [82, 0.28, 0.35],
    [523, 0.09, 1.6],
    [1444, 0.06, 1.1],
    [2825, 0.035, 0.6],
    [4660, 0.02, 0.25],
  ]) {
    const source = context.createOscillator()
    const envelope = context.createGain()
    source.frequency.value = pitch
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(volume * level ** 2, now + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + length)
    source.connect(envelope).connect(power)
    source.start(now)
    source.stop(now + length + 0.05)
  }
}

/** Turns the room sound down while a voice line plays. */
export function duck(value: boolean) {
  ducked = value
  audio?.voice.gain.setTargetAtTime(value ? 0.15 : 1, audio.context.currentTime, 0.2)
}

export function toggleSound() {
  on = !on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // A forbidden storage: the choice lasts until the page is closed.
  }
  if (on) wake()
  apply()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useSound = () => useSyncExternalStore(subscribe, () => on)
