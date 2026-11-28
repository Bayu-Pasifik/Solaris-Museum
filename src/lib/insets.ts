import { useEffect, useState } from 'react'

/** Pixels at the edges of the screen that the page covers with its own bars and panels. */
export type Insets = { top: number; right: number; bottom: number }

/**
 * Measures how much of the screen the top bar, the strip and the drawer cover, so the 3D scene
 * can keep clear of them. The refs go on those three.
 */
export function useInsets() {
  const [top, setTop] = useState<HTMLElement | null>(null)
  const [bottom, setBottom] = useState<HTMLElement | null>(null)
  const [drawer, setDrawer] = useState<HTMLElement | null>(null)
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0 })

  useEffect(() => {
    const measure = () => {
      // The strip is a child of its wrapper, and the drawer is a bottom sheet on a narrow
      // screen and a side panel on a wide one.
      const under = bottom?.offsetHeight ?? 0
      const sheet = drawer?.parentElement && drawer.offsetWidth >= drawer.parentElement.clientWidth
      setInsets({
        top: top?.offsetHeight ?? 0,
        right: drawer && !sheet ? drawer.offsetWidth : 0,
        bottom: drawer && sheet ? Math.max(drawer.offsetHeight, under) : under,
      })
    }
    const watch = new ResizeObserver(measure)
    for (const element of [top, bottom, drawer]) if (element) watch.observe(element)
    measure()
    return () => watch.disconnect()
  }, [top, bottom, drawer])

  return { insets, setTop, setBottom, setDrawer }
}

/** For a ref: on a narrow screen the switches scroll sideways, so the open one comes in sight. */
export const reveal = (element: HTMLElement | null) =>
  element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
