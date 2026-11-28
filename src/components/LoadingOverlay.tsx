import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import type { SakugaProgress } from '../lib/sakuga'

type Props = {
  /** Only for the first loading; what comes later arrives without covering the room. */
  once?: boolean
}

export default function LoadingOverlay({ once = false }: Props) {
  const active = useProgress((state) => state.active)
  const progress = useProgress((state) => state.progress)
  const bar = useRef<SakugaProgress>(null)
  const [shown, setShown] = useState(active)
  const [done, setDone] = useState(false)

  if (active && !shown && !(once && done)) setShown(true)

  useEffect(() => {
    bar.current?.set(active ? progress / 100 : 1)
  }, [shown, active, progress])

  // Stay until the bar has reached the end and its last effect has played.
  useEffect(() => {
    const element = bar.current
    if (!element) return
    let timer: number | undefined
    const onDone = () => {
      timer = window.setTimeout(() => {
        setShown(false)
        setDone(true)
      }, 1100)
    }
    element.addEventListener('sakuga:done', onDone)
    return () => {
      element.removeEventListener('sakuga:done', onDone)
      window.clearTimeout(timer)
    }
  }, [shown])

  if (!shown) return null
  return (
    <div className="loading">
      <sakuga-progress ref={bar} label="Loading model" done-label="Ready ✓" />
    </div>
  )
}
