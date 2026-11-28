/** A ref for a sideways list: it turns the wheel of a mouse into sideways scrolling. */
export function wheel(list: HTMLUListElement | null) {
  if (!list) return
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    event.preventDefault()
    list.scrollLeft += event.deltaY
  }
  list.addEventListener('wheel', onWheel, { passive: false })
  return () => list.removeEventListener('wheel', onWheel)
}
