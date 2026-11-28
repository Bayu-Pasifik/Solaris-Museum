import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { useLocation } from 'react-router'
import { OPEN_SEARCH, openSearch } from '../lib/search'
import SearchPanel from './SearchPanel'

const isShortcut = (event: KeyboardEvent | ReactKeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'

/** Whether a key press belongs to a field, so "/" is text there. */
const typing = (target?: EventTarget) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'))

/**
 * The one search box of the museum, over whichever room is open. Ctrl+K or "/" opens it, and
 * so does every search button.
 */
export default function GlobalSearch() {
  const dialog = useRef<HTMLDialogElement>(null)
  // The lists are only loaded after the first opening. The query stays for the next one.
  const [used, setUsed] = useState(false)
  const [starred, setStarred] = useState(false)
  const { key } = useLocation()
  const close = useCallback(() => dialog.current?.close(), [])

  useEffect(() => {
    const open = (event: Event) => {
      const box = dialog.current
      if (!box || box.open) return
      flushSync(() => {
        setUsed(true)
        setStarred((event as CustomEvent<boolean>).detail)
      })
      box.showModal()
      box.querySelector('input')?.select()
    }
    const onKey = (event: KeyboardEvent) => {
      // The first part of the path is the field itself, also inside a custom element.
      if (!isShortcut(event) && (event.key !== '/' || typing(event.composedPath()[0]))) return
      event.preventDefault()
      openSearch()
    }
    window.addEventListener(OPEN_SEARCH, open)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(OPEN_SEARCH, open)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // The back button of the browser also leaves the box.
  useEffect(() => close(), [close, key])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    // The rooms listen for arrows and Escape on the window; here the keys are for the box.
    event.stopPropagation()
    const box = event.currentTarget
    const field = box.querySelector('input')
    if (isShortcut(event)) {
      event.preventDefault()
      field?.select()
      return
    }
    const links = [...box.querySelectorAll<HTMLAnchorElement>('a.hit')]
    const at = links.indexOf(event.target as HTMLAnchorElement)
    if (at < 0 && event.target !== field) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      links[at + 1]?.focus()
    } else if (event.key === 'ArrowUp' && at >= 0) {
      event.preventDefault()
      ;(at === 0 ? field : links[at - 1])?.focus()
    } else if (event.key === 'Enter' && event.target === field) {
      event.preventDefault()
      links[0]?.click()
    }
  }

  return (
    <dialog
      ref={dialog}
      className="search-box"
      aria-label="Search"
      onKeyDown={onKeyDown}
      // The content fills the box, so a click on the box itself is one beside it.
      onClick={(event) => event.target === event.currentTarget && close()}
    >
      {used && (
        <div>
          <SearchPanel starred={starred} onStarred={setStarred} onClose={close} />
        </div>
      )}
    </dialog>
  )
}
