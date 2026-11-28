import { useSyncExternalStore } from 'react'
import { createScene, presets, type Scene } from './soundscapes'

/**
 * Plays the sound of the open room. A browser only allows sound after the visitor has pressed
 * something, so it starts with the first press. The choice of the sound button is kept in this
 * browser.
 */

const KEY = 'solaris-museum:sound'
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
