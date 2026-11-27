// Types and small helpers for Sakuga VFX (public/sakuga-vfx/, loaded by index.html).
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { ElementTheme } from './elements'

type Point = { x: number; y: number; w: number; h: number }
type Options = Record<string, number | string>
type Effect = (x: number, y: number, options?: Options) => void
type Word = 'don' | 'pon' | 'shu' | 'zuza'
/** Colors of the effects. The object is shared, so changing it recolors every later effect. */
type Palette = { fill: string; shade: string; line: string; accent: string }

type SakugaFX = {
  /** True when the user asks for reduced motion; every effect is then off. */
  readonly calm: boolean
  readonly P: Palette
  at: (el: Element, fx?: number, fy?: number) => Point
  burst: Effect
  shards: Effect
  puff: Effect
  ticks: Effect
  ring: Effect
  slash: Effect
  lines: Effect
  kira: Effect
  sfx: (word: Word, x: number, y: number, options?: Options) => void
}

export type SakugaInput = HTMLElement & { value: string }
export type SakugaProgress = HTMLElement & { set: (value: number) => void }

type Element_<T extends HTMLElement = HTMLElement> = DetailedHTMLProps<HTMLAttributes<T>, T>

declare global {
  interface Window {
    SakugaFX?: SakugaFX
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'sakuga-button': Element_ & { variant?: 'secondary'; disabled?: boolean }
      'sakuga-input': Element_<SakugaInput> & {
        type?: 'search'
        label?: string
        placeholder?: string
      }
      'sakuga-progress': Element_<SakugaProgress> & { label?: string; 'done-label'?: string }
    }
  }
}

/** The big hit, for entering a room. The point is given as a fraction of the element's size. */
export function impact(el: Element, px = 0.5, py = 0.5) {
  const fx = window.SakugaFX
  if (!fx) return
  const c = fx.at(el, px, py)
  fx.burst(c.x, c.y, { r: 110, spikes: 17, life: 0.48 })
  fx.shards(c.x, c.y, { n: 11, speed: 260, size: 9, life: 0.95, arc: 6.28, grav: 300 })
  fx.sfx('don', c.x + 10, c.y - 90, { size: 176 })
}

/** The small pop, for picking an item in a list. */
export function pop(el: Element) {
  const fx = window.SakugaFX
  if (!fx) return
  const c = fx.at(el, 1, 0.5)
  fx.ticks(c.x - 10, c.y - 14, { dir: -0.9, n: 3, r: 5, len: 16 })
  fx.puff(c.x + 6, c.y + 10, { size: 8, n: 4, vx: 24, vy: -14, life: 0.6 })
  fx.sfx('pon', c.x + 34, c.y - 26, { size: 70 })
}

/** Recolors the effects to match an element. Returns a function that restores the old colors. */
export function tint(theme: ElementTheme) {
  const palette = window.SakugaFX?.P
  if (!palette) return () => {}
  const before = { ...palette }
  Object.assign(palette, { shade: theme.pale, line: theme.deep, accent: theme.accent })
  return () => {
    Object.assign(palette, before)
  }
}

/** Colors of the sound-effect words on the stage. */
const lettering = (theme: ElementTheme) => ({ col: '#ffffff', edge: theme.deep })

/** A character lands on the stage. */
export function entrance(stage: Element, theme: ElementTheme) {
  const fx = window.SakugaFX
  if (!fx) return
  const feet = fx.at(stage, 0.5, 0.82)
  const reach = Math.min(feet.w * 0.34, 190)
  fx.ring(feet.x, feet.y, { rx: reach, ry: reach * 0.28, life: 0.6, w: 9 })
  fx.shards(feet.x, feet.y, { n: 14, speed: 330, size: 9, life: 0.9, arc: 2.6, grav: 520 })
  fx.puff(feet.x - reach * 0.8, feet.y, { size: 17, n: 5, vx: -60, vy: -16, life: 0.75 })
  fx.puff(feet.x + reach * 0.8, feet.y, { size: 17, n: 5, vx: 60, vy: -16, life: 0.75 })
  const side = fx.at(stage, 0.22, 0.2)
  fx.sfx('zuza', side.x, side.y, { size: Math.min(feet.w * 0.28, 150), ...lettering(theme) })
}

/** One attack: a slash across the stage. Each step of a combo cuts the other way. */
export function strike(stage: Element, theme: ElementTheme, step: number) {
  const fx = window.SakugaFX
  if (!fx) return
  const c = fx.at(stage, 0.5, 0.48)
  const odd = step % 2 === 1
  const len = Math.min(c.w * 0.7, 360)
  const ang = odd ? -0.6 : Math.PI + 0.6
  fx.slash(c.x, c.y, { len, ang, thick: len * 0.14, life: 0.5, col: theme.accent })
  fx.shards(c.x, c.y, { n: 8, speed: 290, size: 7, life: 0.7, arc: 2.2, dir: odd ? 0 : Math.PI })
  const word = fx.at(stage, odd ? 0.78 : 0.22, 0.28)
  fx.sfx('shu', word.x, word.y, { size: Math.min(c.w * 0.24, 130), ...lettering(theme) })
}

/** The big move: an impact in the middle, speed lines to both sides and sparkles. */
export function ultimate(stage: Element, theme: ElementTheme) {
  const fx = window.SakugaFX
  if (!fx) return
  const c = fx.at(stage, 0.5, 0.45)
  // Kept short and not too wide, so the model stays in view.
  const r = Math.min(c.w * 0.24, 130)
  fx.burst(c.x, c.y, { r, spikes: 19, life: 0.45 })
  fx.ring(c.x, c.y, { rx: r * 1.6, ry: r * 1.6, life: 0.7, w: 12 })
  fx.shards(c.x, c.y, { n: 20, speed: 420, size: 11, life: 1.1, arc: 6.28, grav: 260 })
  for (const dir of [0, Math.PI]) {
    fx.lines(c.x, c.y, { n: 12, dir, len: r, spread: r, life: 0.45 })
  }
  for (const [px, py] of [[0.2, 0.62], [0.82, 0.5], [0.7, 0.16]]) {
    const point = fx.at(stage, px, py)
    fx.kira(point.x, point.y, { r: 22, life: 0.9 })
  }
  const word = fx.at(stage, 0.76, 0.76)
  fx.sfx('don', word.x, word.y, { size: Math.min(c.w * 0.36, 210), ...lettering(theme) })
}
