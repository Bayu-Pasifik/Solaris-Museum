import { Suspense, useCallback, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, type Group } from 'three'
import { assetUrl, type Character } from '../lib/characters'
import type { Insets } from '../lib/insets'
import { advance, onStep, SIDE, STEP_HEIGHT, type Floor, type Roam } from '../lib/roam'
import CharacterModel from './CharacterModel'
import Optional from './Optional'

/** Meters in a second. The walking clips are in place, so these set the pace. */
const WALK = 1.8
const RUN = 4.6
/** A first-person walker has no legs to match, so the walk can be brisker. */
const STRIDE = 2.8
/** Radians in a second, for the arrow keys. */
const TURN = 2

type Gait = 'stand' | 'walk' | 'run'

const noop = () => {}

function Body({ character, gait }: { character: Character; gait: Gait }) {
  const [clips, setClips] = useState<string[]>([])
  const onClips = useCallback((names: string[]) => setClips(names), [])
  const wanted = gait === 'run' && clips.includes('Run') ? 'Run' : 'Walk'
  const animation =
    gait !== 'stand' && clips.includes(wanted) ? wanted : (character.defaultAnimation ?? '')

  return (
    <>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 48]} />
        <meshBasicMaterial color="#1d1a4a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <CharacterModel
        url={assetUrl(character.model)}
        animation={animation}
        onClips={onClips}
        onFinished={noop}
      />
    </>
  )
}

type Props = {
  roam: RefObject<Roam>
  /** The body that is seen from behind; without one the camera is the walker. */
  third: boolean
  hero?: Character
  floor: Floor
  /** True while something else moves the camera, such as the way into a room. */
  frozen?: boolean
  insets: Insets
  /** Called after every step, with the index of the gate that was walked into. */
  onFrame: (pose: Roam, entered: number | undefined) => void
}

/** A visitor who walks freely through a room. */
export default function Roamer({
  roam,
  third,
  hero,
  floor,
  frozen = false,
  insets,
  onFrame,
}: Props) {
  const body = useRef<Group>(null)
  const height = useRef(0)
  const [gait, setGait] = useState<Gait>('stand')

  useFrame(({ camera, size }, delta) => {
    if (body.current) body.current.visible = !frozen
    if (frozen || !(camera instanceof PerspectiveCamera)) return
    const pose = roam.current
    const step = Math.min(delta, 0.05)
    const held = (...codes: string[]) => (codes.some((code) => pose.keys.has(code)) ? 1 : 0)

    pose.yaw += (held('ArrowLeft') - held('ArrowRight')) * TURN * step
    const ahead = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown') + pose.stick.y
    const aside = held('KeyD') - held('KeyA') + pose.stick.x
    const push = Math.hypot(ahead, aside)

    let next: Gait = 'stand'
    let entered: number | undefined
    if (push > 0.15) {
      // A stick that is pushed to its rim runs, like Shift.
      const fast =
        held('ShiftLeft', 'ShiftRight') > 0 || Math.hypot(pose.stick.x, pose.stick.y) > 0.95
      const speed = fast ? RUN : third ? WALK : STRIDE
      const sin = Math.sin(pose.yaw)
      const cos = Math.cos(pose.yaw)
      const x = (-sin * ahead + cos * aside) / push
      const z = (-cos * ahead - sin * aside) / push
      const moved = advance(
        pose,
        { x: pose.x + x * speed * step, z: pose.z + z * speed * step },
        floor,
      )
      if (moved.x !== pose.x || moved.z !== pose.z) next = fast ? 'run' : 'walk'
      pose.x = moved.x
      pose.z = moved.z
      entered = moved.entered
      // Turn the shortest way to where the walk goes.
      const way = Math.atan2(x, z) - pose.heading
      pose.heading += Math.atan2(Math.sin(way), Math.cos(way)) * (1 - Math.exp(-12 * step))
    }
    if (next !== gait) setGait(next)

    height.current = MathUtils.damp(
      height.current,
      onStep(pose.x, pose.z, floor.gates) ? STEP_HEIGHT : 0,
      14,
      step,
    )
    body.current?.position.set(pose.x, height.current, pose.z)
    body.current?.rotation.set(0, pose.heading, 0)

    const tall = size.height > size.width
    camera.fov = third ? (tall ? 62 : 50) : tall ? 74 : 62
    if (third) {
      const level = Math.cos(pose.pitch)
      const x = -Math.sin(pose.yaw) * level
      const y = Math.sin(pose.pitch)
      const z = -Math.cos(pose.yaw) * level
      const eye = height.current + 1.35
      camera.position.set(
        MathUtils.clamp(pose.x - x * 3.8, -SIDE - 0.5, SIDE + 0.5),
        Math.max(eye + 0.45 - y * 3.8, 0.35),
        pose.z - z * 3.8,
      )
      camera.lookAt(pose.x, eye + 0.1, pose.z)
    } else {
      camera.position.set(pose.x, height.current + 1.6, pose.z)
      camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
    }
    // The picture slides to the middle of the free part, between the bars and the drawer.
    camera.setViewOffset(
      size.width,
      size.height,
      insets.right / 2,
      (insets.bottom - insets.top) / 2,
      size.width,
      size.height,
    )

    // Last, because entering a room moves the pose to the place of the return.
    onFrame(pose, entered)
  })

  if (!third || !hero) return null

  return (
    <group ref={body}>
      <Optional key={hero.id}>
        <Suspense fallback={null}>
          <Body character={hero} gait={gait} />
        </Suspense>
      </Optional>
    </group>
  )
}
