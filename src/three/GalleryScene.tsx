import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { DoubleSide, MathUtils, Mesh, MeshToonMaterial, PerspectiveCamera, type Group } from 'three'
import { hang, type Choosable, type Piece } from '../lib/exhibits'
import type { Insets } from '../lib/insets'
import hallUrl from '../assets/gallery/hall.glb?url'
import Frame from './Frame'

export const GALLERY_FOV = 40
const SLOPE = Math.tan(MathUtils.degToRad(GALLERY_FOV / 2))
/** Radius of the wall of pieces. The hall around it is made by scripts/build-gallery.py. */
const RADIUS = 12
/** Height of the middle of the wall above the floor, and of the lowest piece on a tall wall. */
const MIDDLE = 4.6
const FOOT = 1.7
/** Pieces this far along the wall, and farther, are behind the camera or out of sight. */
const REACH = RADIUS * 1.45

/**
 * Where the wall is. The page moves "target" (units along the wall), and the scene follows it
 * with "now". The scene also tells the page how far one pixel of a drag moves the wall, and how
 * much of the wall is on screen.
 */
export type Scroll = { target: number; now: number; perPixel: number; page: number }

export const newScroll = (): Scroll => ({ target: 0, now: 0, perPixel: 0.01, page: 10 })

type Props = {
  pieces: Piece[]
  /** Colors of the open collection. */
  accent: string
  insets: Insets
  scroll: RefObject<Scroll>
  /** The chosen and the pointed piece, by key. */
  picked?: string
  hovered?: string
  /** A new object moves the wall to the piece with this key. */
  jump?: { key: string }
  onHover: (key: string | undefined) => void
  onPick: (piece: Choosable) => void
}

/** The exhibition hall: a round colonnade, and the open collection on a curved wall in it. */
export default function GalleryScene({
  pieces,
  accent,
  insets,
  scroll,
  picked,
  hovered,
  jump,
  onHover,
  onPick,
}: Props) {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(hallUrl, false, true)
  const screen = useThree((state) => state.size)
  // The part of the screen that nothing covers.
  const width = Math.max(screen.width - insets.right, 1)
  const height = Math.max(screen.height - insets.top - insets.bottom, 1)
  // The shape of the screen decides the rows, so opening the drawer does not move the pieces.
  const narrow = screen.width < screen.height

  const { wall, height: tall } = useMemo(() => hang(pieces, narrow), [pieces, narrow])

  const paint = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  const trim = useMemo(() => new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => trim.dispose(), [trim])
  useEffect(() => {
    trim.color.set(accent)
  }, [trim, accent])

  // A tall wall hangs higher, so the ropes and the floor do not cover its lowest row.
  const middle = Math.max(MIDDLE, tall / 2 + FOOT)

  // One unit away, the screen shows this many pixels per unit.
  const zoom = screen.height / (2 * SLOPE)
  // Far enough for every row, with some of the hall around them, and for at least one column
  // on a narrow screen.
  const distance = MathUtils.clamp(zoom * Math.max((tall + 2.4) / height, 4.3 / width), 8, 24)
  // How much of the wall shows, from the middle of the screen to its side. The wall curves
  // towards the camera, so this is less than the width at its middle.
  const slant = width / (2 * zoom)
  const sine = (slant * (distance - RADIUS)) / (RADIUS * Math.hypot(1, slant))
  const half = RADIUS * (Math.atan(slant) + Math.asin(MathUtils.clamp(sine, -1, 1)))

  const first = wall[0]
  const last = wall.at(-1)
  const start = first ? first.x - first.width / 2 : 0
  const end = last ? last.x + last.width / 2 : 0
  // The wall stops with its ends just inside the screen; a short wall stands in the middle.
  const inner = Math.max(half - 0.5, 0)
  // The chosen piece may go past them, so that it always comes to the middle.
  const chosen = wall.find((entry) => entry.piece.key === picked)?.x
  const low = Math.min(start + inner, (start + end) / 2, chosen ?? Infinity)
  const high = Math.max(end - inner, (start + end) / 2, chosen ?? -Infinity)

  // The chosen piece comes to the middle.
  useEffect(() => {
    const item = wall.find((entry) => entry.piece.key === picked)
    if (item) scroll.current.target = item.x
  }, [picked, wall, scroll])

  // A jump puts a piece at the left of the screen.
  useEffect(() => {
    const item = wall.find((entry) => entry.piece.key === jump?.key)
    if (item) scroll.current.target = item.x - item.width / 2 + inner
    // The same jump is not made again when only the size of the screen changes.
  }, [jump, wall, scroll])

  // Only the pieces near the screen are drawn. "near" moves in steps, so it changes rarely.
  const [near, setNear] = useState(low)
  const room = useRef<Group>(null)
  const hall = useRef<Group>(null)
  const shift = useRef<{ x: number; y: number; distance: number }>(null)

  useFrame(({ camera, size }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const calm = Boolean(window.SakugaFX?.calm)
    const step = Math.min(delta, 0.05)
    const place = scroll.current
    place.target = MathUtils.clamp(place.target, low, high)
    place.now = calm ? place.target : MathUtils.damp(place.now, place.target, 7, step)
    place.perPixel = distance / zoom
    place.page = Math.max(half * 1.5, 3)

    const turn = place.now / RADIUS
    if (room.current) room.current.rotation.y = turn
    // The hall turns a little slower than the wall, which gives it depth.
    if (hall.current) hall.current.rotation.y = turn * 0.7

    // The picture slides to the middle of the free part, without turning the camera.
    const x = insets.right / 2
    const y = (insets.bottom - insets.top) / 2
    const now = (shift.current ??= { x, y, distance })
    const speed = calm ? 1000 : 6
    now.x = MathUtils.damp(now.x, x, speed, step)
    now.y = MathUtils.damp(now.y, y, speed, step)
    now.distance = MathUtils.damp(now.distance, distance, speed, step)
    camera.position.set(0, middle + 0.5, now.distance - RADIUS)
    camera.lookAt(0, middle, -RADIUS)
    camera.setViewOffset(size.width, size.height, now.x, now.y, size.width, size.height)

    const next = Math.round(place.now / 3) * 3
    if (next !== near) setNear(next)
  })

  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[-5, 11, 6]} intensity={1.6} />

      <group ref={hall}>
        {(['hall', 'accent'] as const).map((name) => {
          const model = nodes[name]
          return model instanceof Mesh ? (
            <mesh
              key={name}
              geometry={model.geometry}
              material={name === 'accent' ? trim : paint}
              raycast={() => null}
            />
          ) : null
        })}
      </group>

      <group ref={room} position={[0, middle, 0]}>
        {wall
          .filter((item) => Math.abs(item.x - near) < REACH)
          .map((item) => {
            const { piece } = item
            return (
              <Frame
                key={`${piece.key}-${item.height}`}
                item={item}
                radius={RADIUS}
                edge={piece.key === picked ? '#1d1a4a' : accent}
                picked={piece.key === picked}
                hovered={piece.key === hovered}
                // The pieces appear from the left of the screen to the right.
                delay={Math.min(Math.max(item.x - near + half, 0) * 0.025, 0.5)}
                onHover={
                  piece.kind === 'banner'
                    ? undefined
                    : (over) => onHover(over ? piece.key : undefined)
                }
                onPick={piece.kind === 'banner' ? undefined : () => onPick(piece)}
              />
            )
          })}
      </group>
    </>
  )
}

useGLTF.preload(hallUrl, false, true)
