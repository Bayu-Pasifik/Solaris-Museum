import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  BackSide,
  BufferAttribute,
  CanvasTexture,
  DoubleSide,
  FrontSide,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector3,
  type Group,
} from 'three'
import popupUrl from '../assets/glossary/popup.glb?url'
import type { ElementTheme } from '../lib/elements'
import { bind, LAYOUT, LETTERS, pageHeight, slotOf, type Entry } from '../lib/popup'
import { drawTerm } from './termFace'
import { printSpread } from './popupPrint'

const { wide, deep, hinge, layers, card, flames, drifts } = LAYOUT
const FOLDED = -Math.PI / 2

/** How far the page is open, from 0, all flat, to 1; the cards and paper scenes follow it. */
export type Openness = RefObject<number>

/** A turn that is under way: the spreads before and after, and how far the leaf has swung. */
export type Leaf = { low: number; high: number; swing: RefObject<number> }

/** A part of the book rises with a small bounce, a bit after the one before it. */
function risen(open: number, order: number, step: number) {
  const t = MathUtils.clamp(open * (1 + order * step) - order * step, 0, 1)
  const back = t - 1
  return 1 + 2.7 * back ** 3 + 1.7 * back ** 2
}

/** The meshes of the file by name, with the materials of this page. */
function useParts() {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(popupUrl, false, true)
  const materials = useMemo(() => {
    const basic = { vertexColors: true, side: DoubleSide }
    return {
      // The file has no normals; flat shading takes them from the faces.
      lit: new MeshLambertMaterial({ ...basic, flatShading: true }),
      // What shines by itself needs no light.
      glow: new MeshBasicMaterial(basic),
      // The window and the lamps of the room are beyond the dim air.
      far: new MeshBasicMaterial({ ...basic, fog: false }),
    }
  }, [])
  useEffect(() => () => Object.values(materials).forEach((item) => item.dispose()), [materials])

  return useMemo(() => {
    const found = Object.values(nodes)
      .filter((node): node is Mesh => node instanceof Mesh)
      .map((node) => {
        const mesh = node.clone()
        const { name } = node
        mesh.material =
          name === 'pb_room_glow'
            ? materials.far
            : name.endsWith('_glow')
              ? materials.glow
              : materials.lit
        mesh.raycast = () => {}
        return mesh
      })
    return new Map(found.map((mesh) => [mesh.name, mesh]))
  }, [nodes, materials])
}

type Parts = ReturnType<typeof useParts>

/** One mesh of the file, with the place that the file gives it. */
function Part({ mesh, material }: { mesh: Mesh; material?: Mesh['material'] }) {
  return (
    <mesh
      geometry={mesh.geometry}
      material={material ?? mesh.material}
      position={mesh.position}
      quaternion={mesh.quaternion}
      scale={mesh.scale}
      raycast={() => null}
    />
  )
}

/** The print of a spread, painted anew when another one is asked for. */
function usePrint(list: Entry[], themeOf: (letter: string) => ElementTheme, index?: number) {
  const texture = useMemo(() => {
    if (index === undefined) return undefined
    const { spreads } = bind(list)
    const spread = spreads[index]
    return spread && printSpread(list, spread, index, spreads.length, themeOf(spread.letter))
  }, [list.length, index, themeOf])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

/**
 * The geometry of a page with places on the print. "across" says which part of the print a point
 * "x" meters from the spine takes.
 */
function printed(mesh: Mesh, across: (x: number) => number) {
  mesh.updateMatrix()
  const geometry = mesh.geometry.clone()
  const points = geometry.getAttribute('position')
  const places = new Float32Array(points.count * 2)
  const point = new Vector3()
  for (let index = 0; index < points.count; index++) {
    point.fromBufferAttribute(points, index).applyMatrix4(mesh.matrix)
    places[index * 2] = across(point.x)
    places[index * 2 + 1] = 1 - (point.z + deep) / (deep * 2)
  }
  geometry.setAttribute('uv', new BufferAttribute(places, 2))
  geometry.deleteAttribute('color')
  return geometry
}

const whole = (x: number) => (x + wide) / (wide * 2)

/** One of the two open pages. */
function Page({ mesh, map }: { mesh: Mesh; map?: CanvasTexture }) {
  const geometry = useMemo(() => printed(mesh, whole), [mesh])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (!map) return null
  return (
    <mesh
      geometry={geometry}
      position={mesh.position}
      quaternion={mesh.quaternion}
      scale={mesh.scale}
      raycast={() => null}
    >
      <meshBasicMaterial key={map.uuid} map={map} side={DoubleSide} />
    </mesh>
  )
}

/** The page in the air. Its front shows the right page before it, its back the left one after. */
function Turning({
  mesh,
  swing,
  front,
  back,
}: {
  mesh: Mesh
  swing: RefObject<number>
  front: CanvasTexture
  back: CanvasTexture
}) {
  const faces = useMemo(
    () =>
      (
        [
          // At rest on the right, a point "x" from the spine lies at "x" on the front …
          [(x: number) => whole(x), FrontSide, front],
          // … and at "-x" on the back, once the page lies on the left.
          [(x: number) => whole(-x), BackSide, back],
        ] as const
      ).map(([across, side, map]) => {
        const material = new MeshBasicMaterial({ map, side })
        // A mesh that is made by hand knows the poses of its geometry.
        const face = new Mesh(printed(mesh, across), material)
        face.position.copy(mesh.position)
        face.quaternion.copy(mesh.quaternion)
        face.scale.copy(mesh.scale)
        face.frustumCulled = false
        face.raycast = () => {}
        return face
      }),
    [mesh, front, back],
  )
  useEffect(
    () => () =>
      faces.forEach((face) => {
        face.geometry.dispose()
        face.material.dispose()
      }),
    [faces],
  )

  useFrame(() => {
    for (const face of faces) {
      const poses = face.morphTargetInfluences
      if (!poses) continue
      // The first pose is the geometry itself, so the others count from one.
      const at = swing.current * poses.length
      poses.forEach((_, index) => {
        poses[index] = Math.max(0, 1 - Math.abs(at - index - 1))
      })
      // The page is a little darker while it stands up, so its bend can be seen.
      face.material.color.setScalar(1 - 0.3 * Math.sin(Math.PI * swing.current))
    }
  })

  return (
    <>
      {faces.map((face) => (
        <primitive key={face.uuid} object={face} />
      ))}
    </>
  )
}

/** The paper scene of a letter, which unfolds from the back of the book: back layer first. */
function PopUp({ parts, letter, open }: { parts: Parts; letter: string; open: Openness }) {
  const folds = useRef<(Group | null)[]>([])
  const name = letter === '#' ? '0' : letter
  useFrame(() => {
    folds.current.forEach((fold, layer) => {
      if (fold) fold.rotation.x = FOLDED * (1 - risen(open.current, layer, 0.3))
    })
  })
  return (
    <>
      {layers.map((z, layer) => {
        const mesh = parts.get(`pb_pop_${name}_${layer}`)
        return (
          mesh && (
            <group
              key={mesh.name}
              position={[0, hinge, z]}
              rotation-x={FOLDED}
              ref={(fold) => {
                folds.current[layer] = fold
              }}
            >
              <Part mesh={mesh} />
            </group>
          )
        )
      })}
    </>
  )
}

/** A card with a term, which stands up as the page opens. */
function Card({
  mesh,
  entry,
  slot,
  theme,
  open,
  active,
  onPick,
}: {
  mesh: Mesh
  entry: Entry
  slot: number
  theme: ElementTheme
  open: Openness
  active: boolean
  onPick: () => void
}) {
  const { x, y, z, turn } = slotOf(slot)
  const fold = useRef<Group>(null)
  const body = useRef<Group>(null)
  const [over, setOver] = useState(false)

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 600
    drawTerm(canvas.getContext('2d')!, entry.term, theme)
    const result = new CanvasTexture(canvas)
    result.colorSpace = 'srgb'
    result.anisotropy = 8
    return result
  }, [entry.id, theme])
  useEffect(() => () => texture.dispose(), [texture])

  useFrame((_, delta) => {
    if (!fold.current || !body.current) return
    fold.current.rotation.x = FOLDED * (1 - risen(open.current, slot, 0.09))
    const size = active ? 1.16 : over ? 1.08 : 1
    const step = Math.min(delta, 0.05)
    const next = window.SakugaFX?.calm ? size : MathUtils.damp(body.current.scale.x, size, 9, step)
    body.current.scale.setScalar(next)
    body.current.position.y = (next - 1) * 1.4
  })

  return (
    <group position={[x, y, z]} rotation-y={turn}>
      <group ref={fold} rotation-x={FOLDED}>
        <group ref={body}>
          <Part mesh={mesh} />
          <mesh
            position={[0, card.middle, 0.03]}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              setOver(true)
            }}
            onPointerOut={() => setOver(false)}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              // A drag that looks around also ends in a click.
              if (event.delta <= 6) onPick()
            }}
          >
            <planeGeometry args={[card.width, card.height]} />
            <meshBasicMaterial map={texture} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** The thumb index: the letters that are read are at the left edge, the others at the right. */
function Tabs({
  parts,
  letters,
  letter,
  onLetter,
}: {
  parts: Parts
  letters: string[]
  letter: string
  onLetter: (letter: string) => void
}) {
  const at = LETTERS.indexOf(letter)
  return (
    <>
      {letters.map((name) => {
        const index = LETTERS.indexOf(name)
        const mesh = parts.get(`pb_tab_${name === '#' ? '0' : name}`)
        const side = index < at ? -1 : 1
        const open = name === letter
        return (
          mesh && (
            <group
              key={name}
              position={[side * (wide + (open ? 1.15 : 0.65)), open ? 0.95 : 0.35, -9 + index * 0.72]}
              scale={open ? 1.35 : 1}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation()
                if (event.delta <= 6) onLetter(name)
              }}
            >
              <mesh geometry={mesh.geometry} material={mesh.material} />
            </group>
          )
        )
      })}
    </>
  )
}

/** The arrows at the outer edges, which show where a walk turns the page. */
function Arrows({ mesh, back, ahead }: { mesh: Mesh; back: boolean; ahead: boolean }) {
  const arrows = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    arrows.current.forEach((arrow, index) => {
      if (!arrow) return
      const side = index ? 1 : -1
      const x = 12.6 + Math.sin(time * 3) * 0.22
      arrow.position.set(side * x, pageHeight(x) + 0.12, 0)
    })
  })
  return (
    <>
      {[back, ahead].map(
        (shown, index) =>
          shown && (
            <group
              key={index}
              ref={(arrow) => {
                arrows.current[index] = arrow
              }}
              rotation-y={index ? 0 : Math.PI}
            >
              <Part mesh={mesh} />
            </group>
          ),
      )}
    </>
  )
}

const CRANES = Array.from({ length: 9 }, (_, index) => index)

/** What moves over the desk: paper cranes, loose letters and the flames of the candles. */
function Air({ parts }: { parts: Parts }) {
  const cranes = useRef<(Group | null)[]>([])
  const letters = useRef<(Group | null)[]>([])
  const fires = useRef<(Group | null)[]>([])

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    cranes.current.forEach((crane, index) => {
      if (!crane) return
      const way = index % 2 ? 1 : -1
      const angle = (index / CRANES.length) * Math.PI * 2 + time * way * (0.07 + (index % 3) * 0.015)
      const radius = 18 + (index % 4) * 3.5
      crane.position.set(
        Math.cos(angle) * radius,
        9 + (index % 5) * 1.5 + Math.sin(time * 0.8 + index) * 0.8,
        Math.sin(angle) * radius * 0.8,
      )
      // The crane is built flying toward "+x".
      crane.rotation.y = -angle - (way * Math.PI) / 2
      crane.scale.set(1.3, 1.3 * (0.55 + 0.45 * Math.sin(time * 5 + index * 2)), 1.3)
    })
    letters.current.forEach((letter, index) => {
      if (!letter) return
      const [x, y, z] = drifts[index]
      letter.position.set(x, y + Math.sin(time * 0.6 + index * 1.7) * 0.9, z)
      letter.rotation.set(0, Math.sin(time * 0.35 + index) * 0.7, Math.sin(time * 0.5 + index) * 0.2)
    })
    fires.current.forEach((fire, index) => {
      if (!fire) return
      const beat = Math.sin(time * 11 + index * 3) * 0.08 + Math.sin(time * 17 + index) * 0.05
      fire.scale.set(1 - beat * 0.5, 1 + beat * 1.6, 1 - beat * 0.5)
      fire.rotation.z = Math.sin(time * 2.3 + index) * 0.07
    })
  })

  const crane = parts.get('pb_crane')
  const flame = parts.get('pb_flame_glow')

  return (
    <>
      {crane &&
        CRANES.map((index) => (
          <group
            key={index}
            ref={(own) => {
              cranes.current[index] = own
            }}
          >
            <Part mesh={crane} />
          </group>
        ))}
      {drifts.map((_, index) => {
        const mesh = parts.get(`pb_drift_${index}_glow`)
        return (
          mesh && (
            <group
              key={mesh.name}
              ref={(own) => {
                letters.current[index] = own
              }}
            >
              <Part mesh={mesh} />
            </group>
          )
        )
      })}
      {flame &&
        flames.map(([x, y, z], index) => (
          <group key={index} position={[x, y, z]}>
            <group
              ref={(own) => {
                fires.current[index] = own
              }}
            >
              <Part mesh={flame} />
            </group>
            <pointLight color="#ffa24a" intensity={90} distance={32} position={[0, 1.4, 0]} />
          </group>
        ))}
    </>
  )
}

type Props = {
  list: Entry[]
  themeOf: (letter: string) => ElementTheme
  /** The spread whose cards and paper scene stand on the book. */
  shown: number
  leaf?: Leaf
  open: Openness
  /** The term that the visitor is at. */
  focus?: number
  onPick: (index: number) => void
  onLetter: (letter: string) => void
}

/** The book and the desk, as scripts/build-popup.py models them. */
export default function PopupMap({
  list,
  themeOf,
  shown,
  leaf,
  open,
  focus,
  onPick,
  onLetter,
}: Props) {
  const parts = useParts()
  const { spreads } = bind(list)
  const spread = spreads[shown]
  const letters = useMemo(() => [...new Set(list.map((entry) => entry.letter))], [list.length])

  // While a page is in the air, the left page is still the one before and the right one is
  // already the one after.
  const low = leaf?.low ?? shown
  const high = leaf?.high ?? shown
  const left = usePrint(list, themeOf, low)
  const other = usePrint(list, themeOf, high === low ? undefined : high)
  const right = high === low ? left : other

  const [pageLeft, pageRight, turning, cardMesh, arrow] = [
    'pb_page_l',
    'pb_page_r',
    'pb_leaf',
    'pb_card',
    'pb_arrow_glow',
  ].map((name) => parts.get(name))

  const still = ['pb_desk', 'pb_desk_glow', 'pb_room', 'pb_room_glow', 'pb_book', 'pb_book_glow']

  return (
    <>
      {still.map((name) => {
        const mesh = parts.get(name)
        return mesh && <Part key={name} mesh={mesh} />
      })}
      {pageLeft && <Page mesh={pageLeft} map={left} />}
      {pageRight && <Page mesh={pageRight} map={right} />}
      {leaf && turning && left && right && (
        <Turning mesh={turning} swing={leaf.swing} front={left} back={right} />
      )}
      {spread && (
        <>
          <PopUp key={spread.letter} parts={parts} letter={spread.letter} open={open} />
          {cardMesh &&
            list
              .slice(spread.first, spread.first + spread.count)
              .map((entry, slot) => (
                <Card
                  key={entry.id}
                  mesh={cardMesh}
                  entry={entry}
                  slot={slot}
                  theme={themeOf(entry.letter)}
                  open={open}
                  active={focus === spread.first + slot}
                  onPick={() => onPick(spread.first + slot)}
                />
              ))}
          <Tabs parts={parts} letters={letters} letter={spread.letter} onLetter={onLetter} />
          {arrow && !leaf && (
            <Arrows mesh={arrow} back={shown > 0} ahead={shown < spreads.length - 1} />
          )}
        </>
      )}
      <Air parts={parts} />
    </>
  )
}

useGLTF.preload(popupUrl, false, true)
