// Types and small helpers for Sakuga VFX (public/sakuga-vfx/, loaded by index.html).
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type Point = { x: number; y: number; w: number; h: number }
type Options = Record<string, number>

type SakugaFX = {
  /** True when the user asks for reduced motion; every effect is then off. */
  readonly calm: boolean
  at: (el: Element, fx?: number, fy?: number) => Point
  burst: (x: number, y: number, options?: Options) => void
  shards: (x: number, y: number, options?: Options) => void
  puff: (x: number, y: number, options?: Options) => void
  ticks: (x: number, y: number, options?: Options) => void
  sfx: (word: 'don' | 'pon', x: number, y: number, options?: Options) => void
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
      'sakuga-tabs': Element_ & { label?: string; selected?: number }
    }
  }
}

/** The big hit, for entering a room. */
export function impact(el: Element) {
  const fx = window.SakugaFX
  if (!fx) return
  const c = fx.at(el)
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
