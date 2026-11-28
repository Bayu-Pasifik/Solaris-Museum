import { useLayoutEffect, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'

export type Box = {
  position: [number, number, number]
  size: [number, number, number]
  /** Turn around the upright axis. */
  turn?: number
  color: string
}

type Props = {
  boxes: Box[]
  /** Lit boxes show their own color, without shade. */
  lit?: boolean
}

/** Many boxes in one instanced mesh, so they are drawn in one call. */
export default function Boxes({ boxes, lit }: Props) {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    const place = new Object3D()
    const color = new Color()
    boxes.forEach((box, index) => {
      place.position.set(...box.position)
      place.rotation.set(0, box.turn ?? 0, 0)
      place.scale.set(...box.size)
      place.updateMatrix()
      target.setMatrixAt(index, place.matrix)
      target.setColorAt(index, color.set(box.color))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    target.computeBoundingSphere()
  }, [boxes])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, boxes.length]} raycast={() => null}>
      <boxGeometry />
      {lit ? <meshBasicMaterial /> : <meshToonMaterial />}
    </instancedMesh>
  )
}
