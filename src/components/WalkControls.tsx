import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { Roam } from '../lib/roam'

const WALKING = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
])

/** Whether a key press belongs to a field, a dialog or the drawer, so it does not walk. */
const busy = (target: EventTarget | undefined) =>
  Boolean(document.querySelector('dialog[open]')) ||
  (target instanceof HTMLElement &&
    // In the drawer the arrows scroll its text.
    (target.isContentEditable || Boolean(target.closest('input, textarea, select, .drawer'))))

/** Keeps the held walking keys in the pose, and calls "onUse" for the key E. */
export function useWalkKeys(roam: RefObject<Roam>, active: boolean, onUse: () => void) {
  useEffect(() => {
    if (!active) return
    const pose = roam.current
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // The first part of the path is the field itself, also inside a custom element.
      if (busy(event.composedPath()[0])) return
      if (event.code === 'KeyE') {
        if (!event.repeat) onUse()
      } else if (WALKING.has(event.code)) {
        // The arrows must not scroll the page or the strip.
        if (event.code.startsWith('Arrow')) event.preventDefault()
        pose.keys.add(event.code)
      }
    }
    const up = (event: KeyboardEvent) => pose.keys.delete(event.code)
    // A key that is released outside the window never says so.
    const stop = () => pose.keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', stop)
    }
  }, [roam, active, onUse])

  // Only a change of the mode drops the keys, not a new "onUse".
  useEffect(() => {
    const pose = roam.current
    return () => pose.keys.clear()
  }, [roam, active])
}

/** Radians of a turn for one pixel of a drag. */
const LOOK = 0.005

/** Starts a drag that turns the eyes of a walker. Behind a body they cannot look as far. */
export function lookAround(event: ReactPointerEvent, roam: RefObject<Roam>, third: boolean) {
  if (event.button !== 0) return
  const { pointerId } = event
  const [low, high] = third ? [-0.5, 0.35] : [-0.8, 0.8]
  let x = event.clientX
  let y = event.clientY
  const drag = (next: PointerEvent) => {
    // Another finger can be on the stick.
    if (next.pointerId !== pointerId) return
    const pose = roam.current
    pose.yaw -= (next.clientX - x) * LOOK
    pose.pitch = Math.min(Math.max(pose.pitch - (next.clientY - y) * LOOK, low), high)
    x = next.clientX
    y = next.clientY
  }
  const drop = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', drop)
    window.removeEventListener('pointercancel', drop)
  }
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', drop)
  window.addEventListener('pointercancel', drop)
}

/** How far the knob of the stick travels, in pixels. */
const REACH = 44

/** A thumb stick for touch screens. */
export function Stick({ roam }: { roam: RefObject<Roam> }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const pose = roam.current
    return () => {
      pose.stick = { x: 0, y: 0 }
    }
  }, [roam])

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left - box.width / 2) / REACH
    const y = (event.clientY - box.top - box.height / 2) / REACH
    const over = Math.max(Math.hypot(x, y), 1)
    roam.current.stick = { x: x / over, y: -y / over }
    setKnob({ x: (x / over) * REACH, y: (y / over) * REACH })
  }
  const rest = () => {
    roam.current.stick = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0 })
  }

  // Keyboard and screen reader users walk with the keys, so the stick is only for touch.
  return (
    <div
      className="stick"
      aria-hidden="true"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        move(event)
      }}
      onPointerMove={move}
      onLostPointerCapture={rest}
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}
