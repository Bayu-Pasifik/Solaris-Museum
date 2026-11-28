import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type Group,
  type PointsMaterial,
} from 'three'
import type { HallProps } from '../components/WingWalk'
import { playNote, playRustle } from '../lib/ambience'
import { airOf, colorsOf, GROUND, layOut, spotAtSite, type Land } from '../lib/atlas'
import { useWorldMap } from '../lib/map'
import type { Floor } from '../lib/roam'
import type { Room } from '../lib/rooms'
import { AreaSite, Ground, Heavens, Orbiters, SUN, Trail, useAtlasParts, Part, type Ink } from './AtlasMap'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#ffb02e', path: '/' }
const noop = () => {}
const calm = () => Boolean(window.SakugaFX?.calm)
const UP = new Vector3(0, 1, 0)

/** The areas that were surveyed, by their ids, until the page is closed. */
const surveyed = new Set<string>()

/** How close a visitor comes to an area to be at it, and to survey it. */
const REACH = 10
const SURVEY = 8.5
/** How far around the visitor the pictures are painted. */
const PAINTED = 27
/** The seconds that a landing on another planet takes. */
const LANDING = 1.7

/** The sky: a color at the top, one at the horizon, which lies below the eyes of a small world. */
function skyMaterial() {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: { top: { value: new Color() }, low: { value: new Color() } },
    vertexShader: `varying vec3 vWay;
      void main() {
        vWay = position;
        gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
      }`,
    fragmentShader: `uniform vec3 top;
      uniform vec3 low;
      varying vec3 vWay;
      void main() {
        float up = normalize(vWay).y + 0.38;
        vec3 color = mix(low, top, smoothstep(0.0, 0.85, up));
        color = mix(top * 0.35, color, smoothstep(-0.75, 0.0, up));
        color += low * 0.22 * exp(-abs(up) * 11.0);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}

/** The walk of the Map room: over a small planet that turns under the feet of the visitor. */
export default function AtlasScene({
  items,
  mode,
  roam,
  hero,
  insets,
  near,
  picked,
  onPlace,
  onPick,
  onWing,
  onExit,
}: HallProps<Land>) {
  // The list is a new one at every render, and what stands on a planet does not change.
  const region = items[0].region
  const key = `${region.id} ${items.length}`
  const lands = useMemo(() => items, [key])
  const planet = useMemo(() => layOut(lands), [lands])
  const { radius, sites, exit } = planet
  const parts = useAtlasParts()
  const air = airOf(region.id)
  const theme = colorsOf(lands[0])
  const map = useWorldMap()
  const others =
    map.status === 'ready' ? map.data.regions.filter((item) => item.id !== region.id) : []
  const third = mode === 'third'

  /** The turn of the planet, and what it is on its way to. */
  const turn = useRef(new Quaternion())
  const flight = useRef<Quaternion>(undefined)
  const landing = useRef({ key: '', time: 0 })
  const night = useRef(0)
  const world = useRef<Group>(null)
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<AmbientLight>(null)
  const needle = useRef<Group>(null)
  const flies = useRef<Group>(null)
  const glow = useRef<PointsMaterial>(null)
  const ink = useRef<Ink>(null)
  const [drawn, setDrawn] = useState<number[]>([])
  const [, setCount] = useState(surveyed.size)
  const told = useRef('')
  const clocked = useRef(0)
  const flags = lands.map((land) => surveyed.has(land.id))
  const done = flags.filter(Boolean).length

  const sky = useMemo(skyMaterial, [])
  useEffect(() => () => sky.dispose(), [sky])
  const shades = useMemo(
    () => ({
      top: [new Color(), new Color()],
      low: [new Color(), new Color()],
      day: new Color(),
      dark: new Color('#9aaeff'),
    }),
    [],
  )

  const swarm = useMemo(() => {
    const geometry = new BufferGeometry()
    const points = Array.from({ length: 70 }, (_, index) => {
      const angle = index * 2.4
      const away = 2.5 + (index % 17) * 0.75
      const down = (away * away) / 30
      return [Math.cos(angle) * away, 0.4 + (index % 7) * 0.34 - down, Math.sin(angle) * away]
    })
    geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
    return geometry
  }, [])
  useEffect(() => () => swarm.dispose(), [swarm])

  const floor = useMemo<Floor>(() => {
    const blocks = sites.flatMap((site) => [
      { up: site.up, angle: GROUND / radius },
      { up: site.easel.up, angle: 1.15 / radius },
    ])
    const back = new Quaternion()
    const here = new Vector3()
    const there = new Vector3()
    return {
      gates: [],
      circles: [],
      far: 0,
      // The camera behind a walker is never held in.
      side: 100,
      inside: (x, z) => {
        back.copy(turn.current).invert()
        here.copy(UP).applyQuaternion(back)
        there.set(x, radius, z).normalize().applyQuaternion(back)
        // A walker who starts inside a circle can still walk out of it.
        return blocks.every(({ up, angle }) => {
          const away = there.angleTo(up)
          return away >= angle || away > here.angleTo(up)
        })
      },
      roll: (x, z) => {
        const length = Math.hypot(x, z)
        if (!length) return
        // Walking ends a flight.
        flight.current = undefined
        const axis = new Vector3(-z / length, 0, x / length)
        turn.current.premultiply(new Quaternion().setFromAxisAngle(axis, length / radius))
      },
    }
  }, [sites, radius])

  const work = useMemo(
    () => ({ back: new Quaternion(), here: new Vector3(), way: new Vector3() }),
    [],
  )

  useFrame(({ clock, camera }) => {
    const time = calm() ? 0 : clock.elapsedTime

    // Day on the side of the sun, night on the other one.
    const light = work.way.copy(SUN).applyQuaternion(turn.current)
    const day = MathUtils.smoothstep(light.y, -0.55, 0.3)
    night.current = 1 - day
    const mix = (to: Color, [a, b]: Color[], dayColor: string, nightColor: string) =>
      to.lerpColors(b.set(nightColor), a.set(dayColor), day)
    mix(sky.uniforms.top.value, shades.top, air.day[0], air.night[0])
    mix(sky.uniforms.low.value, shades.low, air.day[1], air.night[1])
    if (sun.current) {
      sun.current.position.set(light.x, Math.max(light.y, 0.4), light.z).multiplyScalar(20)
      sun.current.color.lerpColors(shades.dark, shades.day.set(air.sun), day)
      sun.current.intensity = 0.9 + day * 0.9
    }
    if (ambient.current) {
      ambient.current.color.lerpColors(shades.dark, shades.day.set(air.sun), day)
      ambient.current.intensity = 1.25 + day * 0.35
    }
    if (glow.current) glow.current.opacity = night.current * 0.95
    if (flies.current) {
      flies.current.rotation.y = time * 0.07
      flies.current.position.y = Math.sin(time * 1.4) * 0.15
    }

    // The needle on the ground shows the way to the next area without a flag.
    const pointer = needle.current
    if (!pointer) return
    const next = lands.findIndex((land) => !surveyed.has(land.id))
    let show = false
    if (next >= 0) {
      const target = work.way.copy(sites[next].up).applyQuaternion(turn.current)
      show = target.angleTo(UP) * radius > REACH + 1
      const flat = Math.hypot(target.x, target.z)
      if (flat > 1e-3) {
        const [x, z] = [target.x / flat, target.z / flat]
        // In front of the eyes without a body, and at the feet with one.
        const away = third ? 1.35 : 3.1
        const ahead = third ? 0 : 1
        const eye = camera.getWorldDirection(work.here).setY(0).normalize()
        pointer.position.set(
          ahead ? eye.x * away : x * away,
          -(away * away) / (2 * radius) + 0.16 + Math.sin(time * 3) * 0.03,
          ahead ? eye.z * away : z * away,
        )
        pointer.rotation.y = Math.atan2(-x, -z)
      }
    }
    pointer.visible = show
  })

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose) => {
    const now = performance.now() / 1000
    const step = Math.min(now - clocked.current, 0.05)
    clocked.current = now
    const fresh = landing.current.key !== key
    if (fresh) {
      landing.current = { key, time: now }
      turn.current.identity()
      flight.current = undefined
      told.current = ''
    }
    if (pose.to !== undefined) {
      const site = sites[pose.to]
      pose.to = undefined
      if (site) {
        flight.current = site.view.clone()
        // A walk that starts at an area, or on another planet, is there at once.
        if (fresh || calm()) turn.current.copy(flight.current)
      }
    }
    if (flight.current) {
      // The planet spins until the chosen area is on top.
      turn.current.slerp(flight.current, 1 - Math.exp(-4 * step))
      if (turn.current.angleTo(flight.current) < 0.004) {
        turn.current.copy(flight.current)
        flight.current = undefined
      }
    }

    const group = world.current
    if (group) {
      // A new planet rises from below while it spins into place.
      const part = calm() ? 1 : Math.min((now - landing.current.time) / LANDING, 1)
      const left = (1 - part) ** 3
      group.position.y = -radius - left * 55
      group.scale.setScalar(1 - left * 0.65)
      group.quaternion.copy(turn.current)
      if (left) group.quaternion.premultiply(work.back.setFromAxisAngle(UP, left * 5))
    }

    /** The point of the planet under the feet. */
    const here = work.here.copy(UP).applyQuaternion(work.back.copy(turn.current).invert())
    const away = sites.map((site) => here.angleTo(site.up) * radius)
    if (!flight.current) ink.current?.drop(here)

    const seen = away.flatMap((far, index) => (far < PAINTED || index === picked ? index : []))
    if (seen.join() !== drawn.join()) setDrawn(seen)

    /** How much a place is in front of the eyes: 1 straight ahead, -1 right behind. */
    const facing = (up: Vector3) => {
      const target = work.way.copy(up).applyQuaternion(turn.current)
      const flat = Math.hypot(target.x, target.z) || 1
      return (-Math.sin(pose.yaw) * target.x - Math.cos(pose.yaw) * target.z) / flat
    }
    // The area that the walker is at: the open one, or else the one in reach that is most
    // straight ahead.
    const reaches = (index: number) => away[index] !== undefined && away[index] < REACH
    const found =
      picked !== undefined && reaches(picked)
        ? picked
        : sites
            .flatMap((_, index) => (reaches(index) ? index : []))
            .sort((a, b) => facing(sites[b].up) - facing(sites[a].up))[0]
    const row = found ?? away.indexOf(Math.min(...away))

    // An area is surveyed when the visitor stands before it, after the planet came to rest.
    if (found !== undefined && !flight.current && away[found] < SURVEY) {
      const id = lands[found].id
      if (!surveyed.has(id)) {
        surveyed.add(id)
        setCount(surveyed.size)
        playRustle(0.5)
        air.notes.forEach((note, index) =>
          window.setTimeout(() => playNote(note), 220 + index * 150),
        )
      }
    }

    const gate = here.angleTo(exit.up) * radius
    const settled = !flight.current && now - landing.current.time > LANDING
    const out = settled && gate < 2.4 && facing(exit.up) > 0.3
    const words = `${key} ${row} ${found} ${out}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : lands[found].id, out)
    }
    if (settled && gate < 0.85) onExit()
  }

  const focus = near ?? picked

  return (
    <>
      <mesh material={sky} renderOrder={-10} frustumCulled={false} raycast={() => null}>
        <sphereGeometry args={[10, 32, 20]} />
      </mesh>
      <ambientLight ref={ambient} intensity={1.5} />
      <directionalLight ref={sun} position={[4, 16, -8]} intensity={1.6} />

      <group ref={world} position={[0, -radius, 0]}>
        <Ground parts={parts} region={region.id} planet={planet} flags={flags} />
        <Trail key={key} ink={ink} radius={radius} color={theme.deep} />

        {lands.map((land, index) => (
          <AreaSite
            key={land.id}
            parts={parts}
            land={land}
            site={sites[index]}
            radius={radius}
            index={index}
            awake={index === focus}
            drawn={drawn.includes(index)}
            surveyed={flags[index]}
            onPick={() => {
              // A landmark that is chosen from afar turns the planet until it is before the eyes.
              if (index !== focus) Object.assign(roam.current, spotAtSite(index, third))
              onPick(index)
            }}
          />
        ))}

        {/* The board of the planet, beside the place of arrival. */}
        <group position={[-4.2, radius - 2, -6.8]} rotation={[0, 0.5, 0.14]} scale={1.35}>
          <Sign
            solid
            title={region.name}
            note={
              done === lands.length
                ? 'Every area surveyed ★'
                : `Surveyed ${done} of ${lands.length}`
            }
            shadow={theme.accent}
            position={[0, 1.5, 0]}
          />
        </group>

        <group position={exit.up.clone().multiplyScalar(radius - 0.05)} quaternion={exit.frame}>
          <Portal
            room={LOBBY}
            position={[0, 0, 0]}
            turn={0}
            scale={1}
            active={false}
            onHover={noop}
            onClick={(event) => {
              event.stopPropagation()
              if (event.delta <= 6) onExit()
            }}
          />
        </group>

        <Orbiters parts={parts} region={region.id} radius={radius} night={night} />
        <Heavens
          parts={parts}
          others={others}
          night={night}
          onTravel={(next) => onWing(next.name)}
        />
      </group>

      <group ref={needle} scale={0.75} visible={false}>
        <Part mesh={parts.get('or_needle_glow')} />
      </group>
      {/* Fireflies that wake in the night. */}
      <group ref={flies}>
        <points geometry={swarm} raycast={() => null}>
          <pointsMaterial
            ref={glow}
            color="#e8ff9a"
            size={0.09}
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </points>
      </group>

      <Roamer
        roam={roam}
        third={third}
        hero={hero}
        floor={floor}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
