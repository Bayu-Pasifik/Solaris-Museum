import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, useTexture } from '@react-three/drei'
import { Color, DoubleSide, Fog, Object3D, SRGBColorSpace, type InstancedMesh } from 'three'
import type { HallProps } from '../components/WingWalk'
import { rankColor } from '../lib/bestiary'
import { assetUrl } from '../lib/characters'
import { themeOf } from '../lib/elements'
import type { Room } from '../lib/rooms'
import {
  closestIsland,
  ELEMENTS,
  EXIT,
  floorOf,
  ISLANDS,
  lookingDistance,
  type Beast,
  wingOf,
  type Den,
} from '../lib/wilds'
import { gateAhead } from '../lib/roam'
import Creature from './Creature'
import ElementParticles from './ElementParticles'
import Optional from './Optional'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'
import WildsMap from './WildsMap'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }
const noop = () => {}

/** The air over the camp, and over each island. */
const CAMP_SKY = '#cfc8ff'
const SKIES: Record<string, string> = {
  Aero: '#c2f2ee',
  Glacio: '#c4dcff',
  Electro: '#4a3684',
  Havoc: '#3c1a45',
  Fusion: '#7a2f33',
  Spectro: '#ffedbc',
  Physical: '#f3cfa4',
}

/** The sky takes the color of the island that the visitor walks to. */
function Air({ roam }: Pick<HallProps<Beast>, 'roam'>) {
  const { sky, fog, goal, camp } = useMemo(
    () => ({
      sky: new Color(CAMP_SKY),
      fog: new Fog(CAMP_SKY, 35, 190),
      goal: new Color(),
      camp: new Color(CAMP_SKY),
    }),
    [],
  )
  useFrame(({ scene }, delta) => {
    const { x, z } = roam.current
    const { index, distance } = closestIsland(x, z)
    // Fully its own color on the island, and none of it near the camp.
    const share = Math.min(Math.max((ISLANDS[index].walk + 20 - distance) / 20, 0), 1)
    goal.set(SKIES[ELEMENTS[index]] ?? CAMP_SKY).lerp(camp, 1 - share)
    sky.lerp(goal, window.SakugaFX?.calm ? 1 : 1 - Math.exp(-3 * Math.min(delta, 0.05)))
    fog.color.copy(sky)
    scene.background = sky
    scene.fog = fog
  })
  return null
}

/** A ring on the ground at every den, in the color of the rank, and a gem over the empty ones. */
function Markers({ dens, list, shown }: { dens: Den[]; list: Beast[]; shown: Set<number> }) {
  const rings = useRef<InstancedMesh>(null)
  const gems = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    const color = new Color()
    dens.forEach((den, index) => {
      dummy.position.set(den.position[0], 0.05, den.position[2])
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.setScalar(den.radius)
      dummy.updateMatrix()
      rings.current!.setMatrixAt(index, dummy.matrix)
      color.set(rankColor(list[index].record.rank))
      rings.current!.setColorAt(index, color)
      gems.current!.setColorAt(index, color)
    })
    rings.current!.instanceMatrix.needsUpdate = true
    for (const mesh of [rings.current!, gems.current!]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [dens, list, dummy])

  useFrame(({ clock }) => {
    if (!gems.current) return
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    dens.forEach((den, index) => {
      dummy.position.set(den.position[0], 0.9 + Math.sin(time * 1.6 + index) * 0.15, den.position[2])
      dummy.rotation.set(0, time * 0.8 + index, 0)
      // A monster or its picture takes the place of the gem.
      const { model, icon } = list[index].record
      const size = shown.has(index) && (model || icon) ? 0 : 0.28
      dummy.scale.set(size, size * 1.6, size)
      dummy.updateMatrix()
      gems.current!.setMatrixAt(index, dummy.matrix)
    })
    gems.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh
        ref={rings}
        args={[undefined, undefined, dens.length]}
        frustumCulled={false}
        raycast={() => null}
      >
        <ringGeometry args={[0.86, 1.06, 40]} />
        <meshBasicMaterial side={DoubleSide} />
      </instancedMesh>
      <instancedMesh
        ref={gems}
        args={[undefined, undefined, dens.length]}
        frustumCulled={false}
        raycast={() => null}
      >
        <octahedronGeometry />
        <meshToonMaterial />
      </instancedMesh>
    </>
  )
}

/** The head picture of a monster that has no 3D model, as a round medal. */
function Portrait({ url, height, color }: { url: string; height: number; color: string }) {
  const texture = useTexture(url, (loaded) => {
    loaded.colorSpace = SRGBColorSpace
  })
  return (
    <Billboard position={[0, height / 2 + 0.2, 0]}>
      <mesh position={[0, 0, -0.01]} raycast={() => null}>
        <circleGeometry args={[height * 0.56, 40]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh raycast={() => null}>
        <circleGeometry args={[height / 2, 40]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </Billboard>
  )
}

/** The names of the islands, over the gates of the camp. */
function Gates({ list }: { list: Beast[] }) {
  return (
    <>
      {ISLANDS.map(({ element, x, z }) => {
        const away = Math.hypot(x, z)
        const count = list.filter((beast) => wingOf(beast) === element).length
        return (
          <group
            key={element}
            position={[(x / away) * 15, 7.4, (z / away) * 15]}
            // The board looks at the fire.
            rotation={[0, Math.atan2(-x, -z), 0]}
            scale={1.7}
          >
            <Sign
              solid
              title={element}
              note={`${count} monsters`}
              shadow={themeOf(element).accent}
              position={[0, 0, 0]}
            />
          </group>
        )
      })}
    </>
  )
}

/** How many monsters are loaded at once, and how far away they can be. */
const MOST = 9
const SIGHT = 32

type Props = HallProps<Beast> & { dens: Den[] }

/** The walk of the Bestiary: an open map where every monster has its den. */
export default function WildsScene({
  items,
  dens,
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
  const floor = useMemo(() => floorOf(dens), [dens])
  /** The first den of every island. */
  const firsts = useMemo(
    () => ISLANDS.map((_, island) => Math.max(dens.findIndex((den) => den.island === island), 0)),
    [dens],
  )
  const [around, setAround] = useState<number[]>([])
  const [island, setIsland] = useState<number>()
  const told = useRef('')
  const looked = useRef('')

  const shown = useMemo(
    () => new Set(picked === undefined ? around : [...around, picked]),
    [around, picked],
  )

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    const away = dens.map(({ position }) => Math.hypot(pose.x - position[0], pose.z - position[2]))
    const close = away
      .map((distance, index) => ({ distance, index }))
      .filter(({ distance }) => distance < SIGHT)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MOST)
    const seen = close.map(({ index }) => index).sort((a, b) => a - b)
    if (looked.current !== seen.join()) {
      looked.current = seen.join()
      setAround(seen)
    }

    // The den that the walker is at: the open one, or else the one in reach that is most
    // straight ahead.
    const reaches = (index: number) => away[index] < lookingDistance(dens[index]) + 1
    /** How much a den is in front of the eyes: 1 straight ahead, -1 right behind. */
    const ahead = (index: number) => {
      const [x, , z] = dens[index].position
      return (
        (-Math.sin(pose.yaw) * (x - pose.x) - Math.cos(pose.yaw) * (z - pose.z)) / away[index]
      )
    }
    const found =
      picked !== undefined && reaches(picked)
        ? picked
        : seen.filter(reaches).sort((a, b) => ahead(b) - ahead(a))[0]
    const here = closestIsland(pose.x, pose.z)
    // Around the camp, no island is the one the walker is at, so the first one is named.
    const row = found ?? firsts[here.distance < ISLANDS[here.index].walk + 20 ? here.index : 0]
    setIsland(here.distance < ISLANDS[here.index].walk + 6 ? here.index : undefined)
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    const words = `${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : items[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  return (
    <>
      <Air roam={roam} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[-12, 22, 14]} intensity={1.7} />
      <WildsMap />
      <Gates list={items} />
      <Markers dens={dens} list={items} shown={shown} />

      {island !== undefined && (
        <group position={[ISLANDS[island].x, 0, ISLANDS[island].z]} scale={8}>
          <ElementParticles
            key={island}
            element={ELEMENTS[island]}
            theme={themeOf(ELEMENTS[island])}
          />
        </group>
      )}

      {[...shown].map((index) => {
        const beast = items[index]
        const den = dens[index]
        if (!beast || !den) return null
        const { model, icon, rank } = beast.record
        const active = index === near || index === picked
        const [x, , z] = den.position
        const tall = model ? den.height : 1.6
        return (
          <group key={beast.id}>
            {/* One monster that fails to load does not take the map with it. */}
            <Optional>
              <Suspense fallback={null}>
                {model ? (
                  <Creature model={model} den={den} roam={roam} active={active} />
                ) : (
                  icon && (
                    <group position={den.position}>
                      <Portrait url={assetUrl(icon)} height={tall} color={rankColor(rank)} />
                    </group>
                  )
                )}
              </Suspense>
            </Optional>
            {/* One simple shape takes the clicks, so the pointer is never tested against a model. */}
            <mesh
              visible={false}
              position={[x, tall / 2, z]}
              onClick={(event) => {
                event.stopPropagation()
                // A drag that looks around also ends in a click.
                if (event.delta <= 6) onPick(index)
              }}
            >
              <cylinderGeometry args={[den.radius, den.radius, tall, 8]} />
            </mesh>
            <Billboard position={[x, tall + 0.55, z]} scale={active ? 0.85 : 0.65}>
              <Sign solid title={beast.name} note={rank} shadow={rankColor(rank)} position={[0, 0, 0]} />
            </Billboard>
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
        floor={floor}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
