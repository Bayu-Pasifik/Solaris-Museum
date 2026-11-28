import { Suspense, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, useTexture } from '@react-three/drei'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Fog,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import type { HallProps } from '../components/WingWalk'
import { assetUrl } from '../lib/characters'
import type { SonataSet } from '../lib/echoes'
import { themeOf, type ElementTheme } from '../lib/elements'
import { gateAhead, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import {
  EXIT,
  FLOOR,
  groundAt,
  LAYOUT,
  lookingDistance,
  roadPoint,
  standOf,
  type Stand,
  type Voice,
} from '../lib/spire'
import Creature from './Creature'
import ElementParticles from './ElementParticles'
import Keyboard from './Keyboard'
import Optional from './Optional'
import { noise, paintGlow, usePainting } from './painting'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'
import SpireMap from './SpireMap'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }
const noop = () => {}

/** The dark at the foot of the road, and the dusk at its top. */
const DEEP = '#150f36'
const DUSK = '#3a1650'

/** The sky warms as the visitor climbs. */
function Air({ roam }: { roam: RefObject<Roam> }) {
  const { low, high, sky, fog } = useMemo(
    () => ({
      low: new Color(DEEP),
      high: new Color(DUSK),
      sky: new Color(DEEP),
      fog: new Fog(DEEP, 55, 260),
    }),
    [],
  )
  useFrame(({ scene }) => {
    const share = groundAt(roam.current.x, roam.current.z) / LAYOUT.road.rise
    sky.copy(low).lerp(high, share)
    fog.color.copy(sky)
    scene.background = sky
    scene.fog = fog
  })
  return null
}

const STARS = new Float32Array(
  Array.from({ length: 900 }, (_, index) => {
    const angle = noise(index + 11) * Math.PI * 2
    const far = 150 + noise(index + 1100) * 90
    return [Math.sin(angle) * far, noise(index + 2200) * 180 - 50, Math.cos(angle) * far]
  }).flat(),
)

/** A crystal over every stand whose echo is not seen yet, in the color of its element. */
function Crystals({ stands, voices, shown }: { stands: Stand[]; voices: Voice[]; shown: Set<number> }) {
  const gems = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    const color = new Color()
    voices.forEach(({ record }, index) => {
      gems.current!.setColorAt(index, color.set(themeOf(record.element).accent))
    })
    if (gems.current!.instanceColor) gems.current!.instanceColor.needsUpdate = true
  }, [voices])

  useFrame(({ clock }) => {
    if (!gems.current) return
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    stands.forEach(({ position: [x, y, z] }, index) => {
      dummy.position.set(x, y + 1.2 + Math.sin(time * 1.6 + index) * 0.18, z)
      dummy.rotation.set(0, time * 0.8 + index, 0)
      const size = shown.has(index) ? 0 : 0.34
      dummy.scale.set(size, size * 1.7, size)
      dummy.updateMatrix()
      gems.current!.setMatrixAt(index, dummy.matrix)
    })
    gems.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      key={stands.length}
      ref={gems}
      args={[undefined, undefined, stands.length]}
      frustumCulled={false}
      raycast={() => null}
    >
      <octahedronGeometry />
      <meshBasicMaterial />
    </instancedMesh>
  )
}

/**
 * The picture of an echo as a disc of light: what is seen of an echo that is too far to take
 * shape, and of one that has no model.
 */
function Hologram({ url, height, color }: { url: string; height: number; color: string }) {
  const texture = useTexture(url, (loaded) => {
    loaded.colorSpace = SRGBColorSpace
  })
  const body = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!body.current) return
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    body.current.position.y = height / 2 + 0.25 + Math.sin(time * 1.4) * 0.08
  })
  return (
    <group ref={body} position={[0, height / 2 + 0.25, 0]}>
      <Billboard>
        <mesh raycast={() => null}>
          <ringGeometry args={[height * 0.52, height * 0.56, 6]} />
          <meshBasicMaterial color={color} side={DoubleSide} />
        </mesh>
        <mesh raycast={() => null}>
          <planeGeometry args={[height * 0.8, height * 0.8]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

/** The emblem of one Sonata set, circling the echo that the visitor stands at. */
function Emblem({ icon, at, count, radius }: { icon: string; at: number; count: number; radius: number }) {
  const texture = useTexture(assetUrl(icon), (loaded) => {
    loaded.colorSpace = SRGBColorSpace
  })
  const body = useRef<Group>(null)
  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime * 0.5
    const angle = time + (at / count) * Math.PI * 2
    body.current?.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  })
  return (
    <group ref={body}>
      <sprite scale={[0.7, 0.7, 1]} raycast={() => null}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

/** Rings of sound that climb around the echo that the visitor stands at, and its sets. */
function Resonance({
  stand,
  theme,
  element,
  emblems,
}: {
  stand: Stand
  theme: ElementTheme
  element: string
  emblems: string[]
}) {
  const glow = usePainting(128, paintGlow)
  const rings = useRef<Group>(null)
  const top = stand.height + 0.6

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0.2 : clock.elapsedTime * 0.45
    rings.current?.children.forEach((child, index) => {
      const ring = child as Mesh
      const age = (time + index / 3) % 1
      ring.position.y = 0.05 + age * top
      ring.scale.setScalar(1.75 + Math.sin(age * Math.PI) * 0.45)
      ;(ring.material as MeshBasicMaterial).opacity = (1 - age) * 0.85
    })
  })

  return (
    <group position={stand.position}>
      <group ref={rings}>
        {[0, 1, 2].map((index) => (
          <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[0.96, 1, 64]} />
            <meshBasicMaterial color={theme.pale} transparent side={DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <sprite position={[0, 0.3, 0]} scale={[6, 3.4, 1]} raycast={() => null}>
        <spriteMaterial
          map={glow}
          color={theme.accent}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </sprite>
      <group scale={1.6}>
        <ElementParticles key={element} element={element} theme={theme} />
      </group>
      <group position={[0, top + 1.5, 0]}>
        {emblems.map((icon, index) => (
          <Suspense key={icon} fallback={null}>
            <Emblem icon={icon} at={index} count={emblems.length} radius={1.5} />
          </Suspense>
        ))}
      </group>
    </group>
  )
}

/** A board over the road where the next cost begins. */
function Costs({ voices, stands }: { voices: Voice[]; stands: Stand[] }) {
  return (
    <>
      {voices.map(({ record }, index) => {
        if (index > 0 && voices[index - 1].record.cost === record.cost) return null
        // A little before the first stand of the cost.
        const t = stands[index].t - 0.06
        const [x, y, z] = roadPoint(t)
        const [bx, , bz] = roadPoint(t - 0.05)
        const count = voices.filter((voice) => voice.record.cost === record.cost).length
        return (
          <group
            key={record.cost}
            position={[x, y + 5.2, z]}
            rotation={[0, Math.atan2(bx - x, bz - z), 0]}
            scale={1.8}
          >
            <Sign
              solid
              title={`Cost ${record.cost}`}
              note={`${count} ${count === 1 ? 'echo' : 'echoes'}`}
              shadow={record.cost === 4 ? '#ffd45a' : record.cost === 3 ? '#a374ff' : '#45e0ff'}
              position={[0, 0, 0]}
            />
          </group>
        )
      })}
    </>
  )
}

/** How many echoes take shape at once, how many show their picture, and how far away. */
const BODIES = 6
const PICTURES = 18
const NEAR = 30
const SIGHT = 55

type Seen = { bodies: number[]; pictures: number[] }

type Props = HallProps<Voice> & { sets: Map<number, SonataSet> }

/** The walk of the Echo room: up the spire, along a road of keys. */
export default function SpireScene({
  items,
  sets,
  mode,
  roam,
  hero,
  insets,
  near,
  picked,
  onPlace,
  onPick,
  onExit,
}: Props) {
  // The list is a new one at every render, and the stands only change with the wing.
  const wing = `${items.length} ${items[0]?.id}`
  const voices = useMemo(() => items, [wing])
  const stands = useMemo(
    () => voices.map((voice, index) => standOf(voice, index, voices.length)),
    [voices],
  )
  const [seen, setSeen] = useState<Seen>({ bodies: [], pictures: [] })
  const told = useRef('')
  const looked = useRef('')

  const bodies = useMemo(
    () => new Set(picked === undefined ? seen.bodies : [...seen.bodies, picked]),
    [seen, picked],
  )
  const shown = useMemo(() => new Set([...bodies, ...seen.pictures]), [bodies, seen])

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    const height = groundAt(pose.x, pose.z)
    // The height counts twice, so what is on another turn of the road is far.
    const away = stands.map(({ position: [x, y, z] }) =>
      Math.hypot(pose.x - x, pose.z - z, (height - y) * 2),
    )
    const close = away
      .map((distance, index) => ({ distance, index }))
      .filter(({ distance }) => distance < SIGHT)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, PICTURES)
    const next: Seen = {
      bodies: close
        .filter(({ distance }) => distance < NEAR)
        .slice(0, BODIES)
        .map(({ index }) => index)
        .sort((a, b) => a - b),
      pictures: close.map(({ index }) => index).sort((a, b) => a - b),
    }
    const key = `${wing} ${next.bodies.join()} ${next.pictures.join()}`
    if (looked.current !== key) {
      looked.current = key
      setSeen(next)
    }

    // The stand that the walker is at: the open one, or else the one in reach that is most
    // straight ahead.
    const reaches = (index: number) =>
      stands[index] !== undefined && away[index] < lookingDistance(stands[index]) + 1
    /** How much a stand is in front of the eyes: 1 straight ahead, -1 right behind. */
    const ahead = (index: number) => {
      const [x, , z] = stands[index].position
      return (
        (-Math.sin(pose.yaw) * (x - pose.x) - Math.cos(pose.yaw) * (z - pose.z)) / away[index]
      )
    }
    const found =
      picked !== undefined && reaches(picked)
        ? picked
        : next.pictures.filter(reaches).sort((a, b) => ahead(b) - ahead(a))[0]
    // Away from every stand, the closest one says where on the road the walker is.
    const row = found ?? close[0]?.index ?? 0
    const exit = gateAhead(pose.x, pose.z, FLOOR.gates) !== undefined && height < 1
    const words = `${wing} ${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : voices[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  const focus = near ?? picked
  const voice = focus === undefined ? undefined : voices[focus]

  return (
    <>
      <Air roam={roam} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[-30, 60, 40]} intensity={1.6} />
      <SpireMap stands={stands} voices={voices} />
      <Keyboard roam={roam} />
      <points raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[STARS, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#cfd6ff" size={0.7} fog={false} />
      </points>
      <Crystals stands={stands} voices={voices} shown={shown} />
      <Costs voices={voices} stands={stands} />

      {voice && stands[focus!] && (
        <Resonance
          key={voice.id}
          stand={stands[focus!]}
          element={voice.record.element}
          theme={themeOf(voice.record.element)}
          emblems={voice.record.sets.flatMap((id) => sets.get(id)?.icon ?? [])}
        />
      )}

      {[...shown].map((index) => {
        const item = voices[index]
        const stand = stands[index]
        if (!item || !stand) return null
        const { record, lender } = item
        const model = bodies.has(index) ? lender?.model : undefined
        const active = index === near || index === picked
        const color = themeOf(record.element).accent
        const [x, y, z] = stand.position
        const tall = lender?.model ? stand.height : 1.6
        const picture = record.icon && (
          <group position={stand.position}>
            <Hologram url={assetUrl(record.icon)} height={Math.min(tall, 2)} color={color} />
          </group>
        )
        return (
          <group key={item.id}>
            {/* One echo that fails to load does not take the spire with it. */}
            <Optional>
              {model ? (
                // The picture stays until the body has taken shape.
                <Suspense fallback={<Suspense fallback={null}>{picture}</Suspense>}>
                  <Creature model={model} den={{ ...stand, island: 0 }} roam={roam} active={active} />
                </Suspense>
              ) : (
                <Suspense fallback={null}>{picture}</Suspense>
              )}
            </Optional>
            {/* One simple shape takes the clicks, so the pointer is never tested against a model. */}
            <mesh
              visible={false}
              position={[x, y + tall / 2, z]}
              onClick={(event) => {
                event.stopPropagation()
                // A drag that looks around also ends in a click.
                if (event.delta <= 6) onPick(index)
              }}
            >
              <cylinderGeometry args={[stand.radius, stand.radius, tall, 8]} />
            </mesh>
            {(bodies.has(index) || active) && (
              <Billboard position={[x, y + tall + 0.75, z]} scale={active ? 0.85 : 0.65}>
                <Sign
                  solid
                  title={item.name}
                  note={`Cost ${record.cost} · ${record.element}`}
                  shadow={color}
                  position={[0, 0, 0]}
                />
              </Billboard>
            )}
          </group>
        )
      })}

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
        floor={FLOOR}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
