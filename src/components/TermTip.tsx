import { useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { Term } from '../lib/glossary'
import { Struck } from './GameText'

/**
 * A word of a text with its explanation. The mouse shows it on hover; a tap or Enter opens
 * it, and a tap elsewhere or Escape closes it.
 */
export default function TermTip({ term, word }: { term: Term; word: string }) {
  const tip = useRef<HTMLSpanElement>(null)
  // Ties the explanation to its own word, so the CSS can place it next to it.
  const anchor = `--term${useId().replace(/[^\w-]/g, '')}`

  const show = () => tip.current?.togglePopover(true)
  const hide = () => tip.current?.togglePopover(false)
  const hover = (action: () => void) => (event: PointerEvent) => {
    if (event.pointerType === 'mouse') action()
  }

  // Escape closes only the explanation, not the drawer around the text as well.
  const keep = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && tip.current?.matches(':popover-open')) event.stopPropagation()
  }

  return (
    <>
      <button
        type="button"
        className="term"
        style={{ anchorName: anchor } as CSSProperties}
        aria-describedby={anchor}
        onClick={show}
        onBlur={hide}
        onKeyDown={keep}
        onPointerEnter={hover(show)}
        onPointerLeave={hover(hide)}
      >
        {word}
      </button>
      <span
        ref={tip}
        id={anchor}
        role="tooltip"
        popover="auto"
        className="definition"
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        <b>{term.name}</b>
        <Struck>{term.text}</Struck>
      </span>
    </>
  )
}
