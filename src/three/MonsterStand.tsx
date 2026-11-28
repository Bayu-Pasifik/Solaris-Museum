import { Suspense, useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl, useGLTF } from '@react-three/drei'
import { MathUtils, Mesh, MeshStandardMaterial, PerspectiveCamera, Texture, type Group } from 'three'
import { assetUrl } from '../lib/characters'
import type { MonsterModel } from '../lib/bestiary'
import type { Insets } from '../lib/insets'
import CharacterModel from './CharacterModel'

export const MONSTER_FOV = 35
const SLOPE = Math.tan(MathUtils.degToRad(MONSTER_FOV / 2))
/** Every monster is shown at about this height, or narrower if it is very wide. */
const HEIGHT = 3.4
const WIDTH = 6

/** How a model is scaled and moved, so that it stands in the middle of the floor. */
function fit({ size: [w, h, d], center: [x, y, z] }: MonsterModel) {
  const scale = Math.min(HEIGHT / h, WIDTH / Math.max(w, d))
  return {
    scale,
    position: [-x * scale, (h / 2 - y) * scale, -z * scale] as [number, number, number],
    width: Math.max(w, d) * scale,
    height: h * scale,
  }
}

/** Frees the memory of the graphics card when the visitor moves to another model. */
function useRelease(url: string) {
  const { scene } = useGLTF(url, false, true)
  useEffect(
    () => () => {
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.geometry.dispose()
        // Three sends them again if the same model comes back.
        for (const material of [object.material].flat()) {
          for (const value of Object.values(material)) {
            if (value instanceof Texture) value.dispose()
          }
          if (material instanceof MeshStandardMaterial) material.dispose()
        }
      })
    },
    [scene],
  )
}

type MonsterProps = {
  model: MonsterModel
  animation: string
  onLoaded: () => void
  onFinished: () => void
}

function Monster({ model, animation, onLoaded, onFinished }: MonsterProps) {
  const url = assetUrl(model.url)
  useRelease(url)
  const { scale, position } = fit(model)
  const body = useRef<Group>(null)
  const grown = useRef(0)

  // A new monster rises into its size.
  useFrame((_, delta) => {
    if (!body.current) return
    grown.current = window.SakugaFX?.calm
      ? 1
      : MathUtils.damp(grown.current, 1, 8, Math.min(delta, 0.05))
    body.current.scale.setScalar(0.6 + 0.4 * grown.current)
  })

  return (
    <group ref={body}>
      <group position={position} scale={scale}>
        <CharacterModel
          url={url}
          animation={animation}
          onClips={onLoaded}
          onFinished={onFinished}
        />
      </group>
    </group>
  )
}

type Props = {
  /** Absent when there is no 3D model; only the camera is then set. */
  model?: MonsterModel
  /** Changes with every subject, also between two that share a model. */
  subject: number
  animation: string
  insets: Insets
  onLoaded: () => void
  onFinished: () => void
}

/**
 * One monster in the middle of a room, with the camera that frames it in the part of the
 * screen that nothing covers. The Bestiary and the Echo room build their rooms around it.
 */
export default function MonsterStand({
  model,
  subject,
  animation,
  insets,
  onLoaded,
  onFinished,
}: Props) {
  const screen = useThree((state) => state.size)
  // The part of the screen that nothing covers.
  const width = Math.max(screen.width - insets.right, 1)
  const height = Math.max(screen.height - insets.top - insets.bottom, 1)

  const size = model ? fit(model) : undefined
  const tall = size?.height ?? HEIGHT
  const wide = size?.width ?? WIDTH

  const controls = useRef<CameraControlsImpl>(null)
  const seen = useRef<number>(undefined)
  useEffect(() => {
    const camera = controls.current
    if (!camera) return
    // One unit away, the screen shows this many pixels per unit.
    const zoom = screen.height / (2 * SLOPE)
    // The monster and some of the room around it. The animations reach past the idle pose.
    const distance = MathUtils.clamp(
      zoom * Math.max((tall * 1.45) / height, (wide * 1.2) / width),
      6,
      24,
    )
    const middle = tall * 0.48
    const slide = seen.current !== undefined && !window.SakugaFX?.calm
    if (seen.current !== subject) {
      // A new monster is seen from the front, a little from above.
      void camera.setLookAt(0, middle + distance * 0.16, distance, 0, middle, 0, slide)
    } else {
      void camera.dollyTo(distance, slide)
    }
    seen.current = subject
  }, [subject, tall, wide, width, height, screen.height])

  // The picture slides to the middle of the free part, without turning the camera.
  const shift = useRef<{ x: number; y: number }>(null)
  useFrame(({ camera, size: canvas }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const x = insets.right / 2
    const y = (insets.bottom - insets.top) / 2
    const now = (shift.current ??= { x, y })
    const speed = window.SakugaFX?.calm ? 1000 : 8
    now.x = MathUtils.damp(now.x, x, speed, delta)
    now.y = MathUtils.damp(now.y, y, speed, delta)
    camera.setViewOffset(canvas.width, canvas.height, now.x, now.y, canvas.width, canvas.height)
  })

  const loaded = useCallback(() => onLoaded(), [onLoaded])
  const { ACTION } = CameraControlsImpl

  return (
    <>
      {model && (
        // Its own boundary, so the room stays while the next monster loads.
        <Suspense fallback={null}>
          <Monster
            key={model.url}
            model={model}
            animation={animation}
            onLoaded={loaded}
            onFinished={onFinished}
          />
        </Suspense>
      )}

      <CameraControls
        ref={controls}
        makeDefault
        minDistance={3}
        maxDistance={26}
        minPolarAngle={0.5}
        maxPolarAngle={1.55}
        smoothTime={0.35}
        mouseButtons={{ left: ACTION.ROTATE, middle: ACTION.DOLLY, right: ACTION.NONE, wheel: ACTION.DOLLY }}
        touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
      />
    </>
  )
}
