import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, Color, Fog, MathUtils, SRGBColorSpace, type Group, type Mesh } from 'three'
import type { HallProps } from '../components/WingWalk'
import { playBubbles, playNote } from '../lib/ambience'
import { assetUrl } from '../lib/characters'
import { NO_REGION } from '../lib/documents'
import type { ElementTheme } from '../lib/elements'
import { gateAhead } from '../lib/roam'
import type { Room } from '../lib/rooms'
import {
  base,
  bend,
  center,
  colorsOf,
  DEPTHS,
  EXIT,
  floorOf,
  layOut,
  SHEET,
  spotAtStand,
  type Paper,
  type Stand,
} from '../lib/trench'
import { drawDocument } from './documentFace'
import { HEIGHT, WIDTH } from './lettering'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'
import TrenchMap, { StandModel, useTrenchParts } from './TrenchMap'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#46d3e0', path: '/' }
const noop = () => {}

/** The face of a document, with its picture as soon as that has arrived. */
function useFace(paper: Paper, theme: ElementTheme) {
  const [texture, setTexture] = useState<CanvasTexture>()
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const g = canvas.getContext('2d')!
    drawDocument(g, paper.document, theme)
    const face = new CanvasTexture(canvas)
    face.colorSpace = SRGBColorSpace
    face.anisotropy = 8
    setTexture(face)

    const image = new Image()
    image.onload = () => {
      drawDocument(g, paper.document, theme, image)
      face.needsUpdate = true
    }
    if (paper.document.picture) image.src = assetUrl(paper.document.picture)
    return () => {
      image.onload = null
      face.dispose()
    }
  }, [paper.id, theme])
  return texture
}

/** How far from the visitor a sheet unrolls. */
const OPEN = 19

/** The document above its stand: a scroll between two rods, which unrolls for a visitor. */
function Sheet({
  paper,
  at,
  open,
  active,
  onPick,
}: {
  paper: Paper
  at: Stand
  open: boolean
  active: boolean
  onPick: () => void
}) {
  const theme = colorsOf(paper)
  const texture = useFace(paper, theme)
  const body = useRef<Group>(null)
  const page = useRef<Mesh>(null)
  const lower = useRef<Group>(null)
  const rolled = useRef(0)
  const [over, setOver] = useState(false)
  const { width, height, low } = SHEET

  useFrame(({ clock }, delta) => {
    if (!body.current || !page.current || !lower.current || !texture) return
    const step = Math.min(delta, 0.05)
    const still = window.SakugaFX?.calm
    rolled.current = still ? Number(open) : MathUtils.damp(rolled.current, Number(open), 4, step)
    // A rolled sheet still shows its head, so it can be told that there is one.
    const share = 0.06 + rolled.current * 0.94
    const shown = height * share
    page.current.scale.y = share
    page.current.position.y = height - shown / 2
    lower.current.position.y = height - shown
    // The top of the picture comes out of the upper rod first.
    texture.repeat.y = share
    texture.offset.y = 1 - share

    const size = active ? 1.1 : over ? 1.05 : 1
    body.current.scale.setScalar(still ? size : MathUtils.damp(body.current.scale.x, size, 9, step))
    const time = still ? 0 : clock.elapsedTime + at.s
    body.current.position.y = low + Math.sin(time * 1.1) * 0.08
    body.current.rotation.z = Math.sin(time * 0.7) * 0.025
  })

  const rod = (
    <>
      <mesh rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
        <cylinderGeometry args={[0.07, 0.07, width + 0.24, 10]} />
        <meshBasicMaterial color={active ? theme.accent : '#b97f2e'} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 + 0.16), 0, 0]} raycast={() => null}>
          <icosahedronGeometry args={[0.12, 1]} />
          <meshBasicMaterial color="#ffd45a" />
        </mesh>
      ))}
    </>
  )

  if (!texture) return null
  return (
    <group position={[at.x, base(at.s), -at.s]} rotation={[0, at.turn, 0]}>
      <group ref={body} position={[0, low, 0.6]}>
        <mesh
          ref={page}
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
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} />
        </mesh>
        <group position={[0, height, 0]}>{rod}</group>
        <group ref={lower}>{rod}</group>
      </group>
    </group>
  )
}

/** How far along the path stands are drawn, behind and ahead of the visitor. */
const BEHIND = 34
const AHEAD = 72
/** How far a sheet is painted, in each direction. */
const PAINTED = 27

/** The walk of the Document Archive: along a path on the floor of the sea. */
export default function TrenchScene({
  items,
  mode,
  roam,
  hero,
  insets,
  near,
  picked,
  onPlace,
  onPick,
  onExit,
}: HallProps<Paper>) {
  // The list is a new one at every render, and what stands in a depth does not change.
  const key = `${items.length} ${items[0]?.id}`
  const papers = useMemo(() => items, [key])
  const kind = papers[0]?.kind ?? 'text'
  const depth = DEPTHS[kind]
  const trail = useMemo(() => layOut(papers), [papers])
  const floor = useMemo(() => floorOf(trail), [trail])
  const parts = useTrenchParts(kind)
  const [seen, setSeen] = useState<{ stands: number[]; sheets: number[]; open: number }>({
    stands: [],
    sheets: [],
    open: 0,
  })
  const told = useRef('')
  const looked = useRef('')
  const air = useMemo(() => ({ color: new Color(), fog: new Fog('#000000') }), [])

  useFrame(({ scene }) => {
    air.color.set(depth.water)
    air.fog.color.copy(air.color)
    ;[air.fog.near, air.fog.far] = depth.sight
    scene.background = air.color
    scene.fog = air.fog
  })

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    const s = -pose.z
    const along = (index: number) => trail.stands[index].s - s
    const stands = trail.stands.flatMap((_, index) =>
      along(index) > -BEHIND && along(index) < AHEAD ? index : [],
    )
    const sheets = stands.filter((index) => Math.abs(along(index)) < PAINTED)
    const open = Math.floor(s / 2)
    const sight = `${key} ${stands.join()} ${sheets.join()} ${open}`
    if (looked.current !== sight) {
      looked.current = sight
      setSeen({ stands, sheets, open: s })
    }

    // The stand that the walker is at: the open one, or else the one in reach that is most
    // straight ahead.
    const away = (index: number) => Math.hypot(trail.stands[index].x - pose.x, along(index))
    const reaches = (index: number) => trail.stands[index] !== undefined && away(index) < 6
    /** How much a stand is in front of the eyes: 1 straight ahead, -1 right behind. */
    const facing = (index: number) =>
      (-Math.sin(pose.yaw) * (trail.stands[index].x - pose.x) + Math.cos(pose.yaw) * along(index)) /
      away(index)
    const found =
      picked !== undefined && reaches(picked)
        ? picked
        : stands.filter(reaches).sort((a, b) => facing(b) - facing(a))[0]
    // Away from every stand, the next one along the path says where the walker is.
    const row = found ?? stands.find((index) => along(index) > 0) ?? stands[stands.length - 1] ?? 0
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    const words = `${key} ${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : papers[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  const focus = near ?? picked
  const awake = focus === undefined ? undefined : trail.stands[focus]
  const woken = focus === undefined ? undefined : papers[focus]?.id

  // A stand that wakes lets out air and a few notes.
  useEffect(() => {
    if (!woken) return
    playBubbles()
    const timers = depth.notes.map((note, index) =>
      window.setTimeout(() => playNote(note), 150 + index * 190),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [woken, depth])

  const drawn = new Set(picked === undefined ? seen.stands : [...seen.stands, picked])
  const painted = new Set(picked === undefined ? seen.sheets : [...seen.sheets, picked])
  const arches = trail.arches.filter((arch) => Math.abs(arch.s - seen.open) < 60)

  return (
    <>
      <ambientLight color={depth.light.color} intensity={depth.light.ambient} />
      <directionalLight color={depth.light.color} position={[-8, 20, 6]} intensity={depth.light.sun} />
      <directionalLight color={depth.above} position={[14, 6, -10]} intensity={0.6} />

      <TrenchMap
        parts={parts}
        kind={kind}
        trail={trail}
        roam={roam}
        third={mode === 'third'}
        awake={awake}
      />

      {[...drawn].map((index) => {
        const at = trail.stands[index]
        const paper = papers[index]
        if (!at || !paper) return null
        return (
          <StandModel key={paper.id} parts={parts} kind={kind} at={at} awake={index === focus} />
        )
      })}

      {[...painted].map((index) => {
        const at = trail.stands[index]
        const paper = papers[index]
        if (!at || !paper) return null
        return (
          <Sheet
            key={paper.id}
            paper={paper}
            at={at}
            open={index === focus || Math.abs(at.s - seen.open) < OPEN}
            active={index === focus}
            onPick={() => {
              // A sheet that is chosen from afar brings the visitor in front of it.
              if (index !== focus) Object.assign(roam.current, spotAtStand(at, mode === 'third'))
              onPick(index)
            }}
          />
        )
      })}

      {arches.map((arch, index) => (
        <group
          key={arch.s}
          position={[center(arch.s), base(arch.s) + 4.6, -arch.s + 0.5]}
          rotation={[0, bend(arch.s), 0]}
          scale={1.7}
        >
          <Sign
            solid
            title={arch.region === NO_REGION ? 'Uncharted' : arch.region}
            note={`${arch.count} ${arch.count === 1 ? 'document' : 'documents'}${
              index === 0 && arch === trail.arches[0] ? ` · ${depth.name}` : ''
            }`}
            shadow={colorsOf({ kind }).accent}
            position={[0, 0, 0]}
          />
        </group>
      ))}

      {trail.end - seen.open < 70 && (
        <group
          position={[center(trail.end - 11) + 5.6, base(trail.end - 11) + 2.4, -(trail.end - 11)]}
          rotation={[0, -0.45, 0]}
          scale={1.4}
        >
          <Sign
            solid
            title={depth.name}
            note="The end of this depth"
            shadow={colorsOf({ kind }).accent}
            position={[0, 0, 0]}
          />
        </group>
      )}

      <Portal
        room={LOBBY}
        position={EXIT.position}
        turn={EXIT.turn}
        scale={1}
        active={false}
        onHover={noop}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta <= 6) onExit()
        }}
      />

      <Roamer
        roam={roam}
        third={mode === 'third'}
        hero={hero}
        floor={floor}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
