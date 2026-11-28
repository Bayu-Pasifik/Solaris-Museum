import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { Mesh, SkinnedMesh, Texture, type Object3D } from 'three'

/** How many things in the open rooms use a model. */
const users = new Map<string, number>()

function dispose(scene: Object3D) {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    // The bones of a skinned mesh live in a texture of their own.
    if (object instanceof SkinnedMesh) object.skeleton.dispose()
    object.geometry.dispose()
    for (const material of [object.material].flat()) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) value.dispose()
      }
      material.dispose()
    }
  })
}

/**
 * A walk passes hundreds of models, so one is dropped when the last thing that uses it is out of
 * sight. Without this the graphics memory fills up, and the browser throws the picture away.
 */
export function useShared(url: string, scene: Object3D) {
  useEffect(() => {
    users.set(url, (users.get(url) ?? 0) + 1)
    return () => {
      users.set(url, users.get(url)! - 1)
      // Later, because a new user can come in the same moment.
      setTimeout(() => {
        if (users.get(url) !== 0) return
        users.delete(url)
        dispose(scene)
        useGLTF.clear(url)
      })
    }
  }, [url, scene])
}
