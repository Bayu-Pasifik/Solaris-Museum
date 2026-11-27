import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'

const COLORS = ['#8f8df7', '#ff5fa8', '#4fb3ff', '#ffc21c', '#45d38a', '#b47aff', '#ffffff']
/** Heights of the shelf boards. */
const BOARDS = [0.25, 1.15, 2.05, 2.95, 3.85]
/** Middle of each of the two cases, which leave the round window free. */
const CASES = [-5, 5]
const WIDTH = 4.2
const DEPTH = -7.85

/** A number from 0 to 1 that is always the same for the same seed. */
const noise = (seed: number) => (Math.sin(seed * 127.1) * 43758.5453) % 1

/** Fills every board with books of different sizes and colors. */
function stack() {
  const books: { x: number; y: number; w: number; h: number; color: string }[] = []
  let seed = 1
  const next = () => Math.abs(noise(seed++))
  for (const middle of CASES) {
    for (const board of BOARDS.slice(0, -1)) {
      let x = middle - WIDTH / 2 + 0.1
      while (x < middle + WIDTH / 2 - 0.24) {
        const w = 0.09 + next() * 0.11
        const h = 0.45 + next() * 0.32
        const color = COLORS[Math.floor(next() * COLORS.length)]
        books.push({ x: x + w / 2, y: board + 0.04 + h / 2, w, h, color })
        // Now and then a gap, as if a book is taken out.
        x += w + (next() < 0.08 ? 0.22 : 0.015)
      }
    }
  }
  return books
}

/** Two cases full of books against the back wall. All books are one instanced mesh. */
export default function Bookshelves() {
  const books = useMemo(stack, [])
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    const place = new Object3D()
    const color = new Color()
    books.forEach((book, index) => {
      place.position.set(book.x, book.y, DEPTH)
      place.scale.set(book.w, book.h, 0.34)
      place.updateMatrix()
      target.setMatrixAt(index, place.matrix)
      target.setColorAt(index, color.set(book.color))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  }, [books])

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, books.length]}>
        <boxGeometry />
        <meshToonMaterial />
      </instancedMesh>
      {CASES.map((middle) => (
        <group key={middle} position={[middle, 0, DEPTH]}>
          {BOARDS.map((y) => (
            <mesh key={y} position={[0, y, 0.02]}>
              <boxGeometry args={[WIDTH + 0.16, 0.08, 0.44]} />
              <meshBasicMaterial color="#1d1a4a" />
            </mesh>
          ))}
          {[-WIDTH / 2, WIDTH / 2].map((x) => (
            <mesh key={x} position={[x, 2.05, 0.02]}>
              <boxGeometry args={[0.12, 3.68, 0.46]} />
              <meshBasicMaterial color="#1d1a4a" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
