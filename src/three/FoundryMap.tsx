import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Group,
  type InstancedMesh,
  type Material,
  type PointLight,
  type Points,
} from 'three'
import foundryUrl from '../assets/armory/foundry.glb?url'
import { playClang } from '../lib/ambience'
import { arc, KINDS, LAYOUT, middleOf, type Kind, type Stand } from '../lib/foundry'
import type { Roam } from '../lib/roam'
import { rarityTheme, type Weapon } from '../lib/weapons'
import { noise, paintGlow, usePainting } from './painting'

/** The meshes of a part: the lit one, and the one that shines by itself. */
type Parts = (name: string) => Mesh[]

type Triple = [number, number, number]

/** The meshes of the foundry, painted for the page. */
function useParts(): Parts {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(foundryUrl, false, true)

  // The file has no normals; flat shading takes them from the faces.
  const paint = useMemo(
    () => Object.assign(new MeshToonMaterial({ vertexColors: true, side: DoubleSide }), { flatShading: true }),
    [],
  )
  // What shines by itself needs no light.
  const glow = useMemo(() => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }), [])
  useEffect(() => () => paint.dispose(), [paint])
  useEffect(() => () => glow.dispose(), [glow])

  return useMemo(() => {
    const mesh = (name: string, material: Material) => {
      const node = nodes[name]
      if (!(node instanceof Mesh)) return []
      const copy = node.clone()
      copy.material = material
      return [copy]
    }
    return (name: string) => [...mesh(`${name}_paint`, paint), ...mesh(`${name}_glow`, glow)]
  }, [nodes, paint, glow])
}

/** A part that stands at the zero point of its group. */
function Solid({ part }: { part: Mesh[] }) {
  return (
    <>
      {part.map((mesh) => (
        <mesh key={mesh.name} geometry={mesh.geometry} material={mesh.material} raycast={() => null} />
      ))}
    </>
  )
}

/**
 * How high a hammer is raised at a point of its beat: 0 on the work, 1 at the top. It rises
 * slowly, waits, and falls fast.
 */
function raised(beat: number) {
  if (beat < 0.6) return (1 - Math.cos((beat / 0.6) * Math.PI)) / 2
  if (beat < 0.88) return 1
  if (beat < 0.94) return 1 - ((beat - 0.88) / 0.06) ** 2
  return 0
}

/** Seconds between two blows of the smith. */
const BEAT = 4.2
/** How far the arm of the smith swings up, in radians. */
const SWING = 1.65
const SPARKS = 110

/** The smith and the blade, with the sparks, the ring and the sound of every blow. */
function Smith({ part, roam }: { part: Parts; roam: RefObject<Roam> }) {
  const arm = useRef<Group>(null)
  const sparks = useRef<InstancedMesh>(null)
  const ring = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const last = useRef(0)
  /** Seconds since the last blow. */
  const since = useRef(Infinity)
  const [ax, ay, az] = LAYOUT.anvil

  // The blade grows white when it is struck, so it has a material of its own.
  const work = useMemo(() => {
    const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
    const meshes = part('blade').map((mesh) => {
      const copy = mesh.clone()
      copy.material = material
      return copy
    })
    return { material, meshes }
  }, [part])
  useEffect(() => () => work.material.dispose(), [work])

  useFrame(({ clock }, delta) => {
    const calm = window.SakugaFX?.calm
    const beat = calm ? 0 : (clock.elapsedTime % BEAT) / BEAT
    if (arm.current) arm.current.rotation.x = -SWING * raised(beat)

    // The hammer lands when the beat passes the end of its fall.
    since.current += Math.min(delta, 0.05)
    if (!calm && last.current < 0.94 && beat >= 0.94) {
      since.current = 0
      const away = Math.hypot(roam.current.x - ax, roam.current.z - az)
      playClang(Math.max(1 - away / 55, 0))
    }
    last.current = beat
    const age = since.current
    const flash = Math.max(1 - age / 0.7, 0)
    work.material.color.setScalar(0.85 + flash * 1.4)
    if (light.current) light.current.intensity = 30 + flash * 260

    if (ring.current) {
      const spread = Math.min(age / 1.1, 1)
      ring.current.visible = spread < 1
      ring.current.scale.setScalar(2 + spread * 15)
      ;(ring.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - spread)
    }

    const target = sparks.current
    if (!target) return
    target.visible = age < 1.5
    if (!target.visible) return
    for (let index = 0; index < SPARKS; index++) {
      const angle = noise(index + 1) * Math.PI * 2
      const out = 2 + noise(index + 200) * 9
      const up = 3 + noise(index + 400) * 9
      const vx = Math.cos(angle) * out
      const vy = up - 14 * age
      const vz = Math.sin(angle) * out
      dummy.position.set(ax + vx * age, ay + up * age - 7 * age * age, az + vz * age)
      // A spark is a streak along its way.
      dummy.lookAt(dummy.position.x + vx, dummy.position.y + vy, dummy.position.z + vz)
      const left = Math.max(1 - age / (0.6 + noise(index + 600) * 0.9), 0)
      dummy.scale.set(left, left, left * (1 + out * 0.12))
      dummy.updateMatrix()
      target.setMatrixAt(index, dummy.matrix)
    }
    target.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <Solid part={part('smith')} />
      <Solid part={work.meshes} />
      <group position={LAYOUT.shoulder as Triple}>
        <group ref={arm}>
          <Solid part={part('hammer')} />
        </group>
      </group>
      <instancedMesh
        ref={sparks}
        args={[undefined, undefined, SPARKS]}
        visible={false}
        frustumCulled={false}
        raycast={() => null}
      >
        <boxGeometry args={[0.09, 0.09, 0.42]} />
        <meshBasicMaterial color="#ffe27a" />
      </instancedMesh>
      <mesh
        ref={ring}
        position={[0, 0.07, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        raycast={() => null}
      >
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial
          color="#ffb43a"
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <pointLight ref={light} position={[ax, ay + 2, az + 1]} color="#ff8a2a" distance={34} decay={1.6} />
    </>
  )
}

/** The part of a landmark that moves. */
function Rotor({ kind, part }: { kind: Kind; part: Parts }) {
  const spin = LAYOUT.spins[kind]
  const [x, y, z] = spin.at
  const turning = useRef<Group>(null)
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    if (turning.current) turning.current.rotation[spin.axis as 'x' | 'y' | 'z'] = time * spin.speed
    // The two fists of the press strike in turn.
    ;[left.current, right.current].forEach((fist, index) => {
      if (fist) fist.position.y = y + 3.4 * raised((time / spin.speed + index * 0.5) % 1)
    })
  })

  if (spin.axis === 'pump') {
    return (
      <>
        <group ref={left} position={[-x, y, z]}>
          <Solid part={part(`rotor_${kind}_left`)} />
        </group>
        <group ref={right} position={[x, y, z]}>
          <Solid part={part(`rotor_${kind}_right`)} />
        </group>
      </>
    )
  }
  return (
    <group position={[x, y, z]}>
      <group ref={turning}>
        <Solid part={part(`rotor_${kind}`)} />
      </group>
    </group>
  )
}

/** The wheels on the walls, the chains from the roof and the pots that run along the rail. */
function Machines({ part }: { part: Parts }) {
  const gears = useRef<Group>(null)
  const chains = useRef<Group>(null)
  const ladles = useRef<Group>(null)
  const { radius, height } = LAYOUT.rail

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    gears.current?.children.forEach((gear, index) => {
      gear.children[0].rotation.z = time * LAYOUT.gears[index][5]
    })
    chains.current?.children.forEach((chain, index) => {
      chain.rotation.z = Math.sin(time * 0.5 + index * 2.1) * 0.035
      chain.rotation.x = Math.sin(time * 0.37 + index) * 0.025
    })
    ladles.current?.children.forEach((ladle, index, all) => {
      const bearing = time * 0.06 + (index / all.length) * Math.PI * 2 + 0.6
      ladle.position.set(...arc(radius, bearing, height))
      ladle.rotation.set(0, Math.PI / 2 - bearing, Math.sin(time * 1.3 + index * 1.7) * 0.05)
    })
  })

  return (
    <>
      <group ref={gears}>
        {LAYOUT.gears.map(([x, y, z, turn, size], index) => (
          <group key={index} position={[x, y, z]} rotation={[0, turn, 0]} scale={size}>
            <group>
              <Solid part={part('gear')} />
            </group>
          </group>
        ))}
      </group>
      <group ref={chains}>
        {LAYOUT.chains.map((at, index) => (
          <group key={index} position={at as Triple}>
            <Solid part={part('chain')} />
          </group>
        ))}
      </group>
      <group ref={ladles}>
        {Array.from({ length: 5 }, (_, index) => (
          <group key={index}>
            <Solid part={part('ladle')} />
          </group>
        ))}
      </group>
    </>
  )
}

const MOLTEN_VERTEX = /* glsl */ `
  varying vec2 vPoint;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vPoint = position.xy;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

/** Crust that drifts on the melt; with "fall", streaks that pour down. */
const MOLTEN_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float fall;
  varying vec2 vPoint;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float cloud(vec2 p) {
    return 0.6 * smoothNoise(p) + 0.28 * smoothNoise(p * 2.3) + 0.12 * smoothNoise(p * 5.1);
  }
  void main() {
    vec2 p = mix(vPoint * 0.085, vec2(vPoint.x * 0.85, vPoint.y * 0.14 + time * 1.1), fall);
    vec2 drift = vec2(cloud(p + time * 0.045), cloud(p.yx - time * 0.035));
    float melt = cloud(p + drift * 1.6);
    // Bright seams run between the plates of the crust.
    float seam = pow(1.0 - abs(melt * 2.0 - 1.0), 5.0);
    vec3 color = mix(vec3(0.16, 0.025, 0.035), vec3(0.93, 0.22, 0.02), smoothstep(0.38, 0.72, melt));
    color = mix(color, vec3(1.0, 0.72, 0.2), seam * 0.85);
    color = mix(color, color * 1.35 + vec3(0.12, 0.05, 0.0), fall);
    // The sides of a fall are ragged.
    float edge = abs(vUv.x - 0.5) * 2.0;
    float alpha = mix(1.0, 1.0 - smoothstep(0.55, 1.0, edge + (drift.x - 0.5) * 0.6), fall);
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }
`

const molten = (fall: number) =>
  new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { time: { value: 0 }, fall: { value: fall } }]),
    vertexShader: MOLTEN_VERTEX,
    fragmentShader: MOLTEN_FRAGMENT,
    transparent: fall > 0,
    side: DoubleSide,
    fog: true,
  })

/** The lake below, and the lava that pours into it from the walls. */
function Lava() {
  const lake = useMemo(() => molten(0), [])
  const falls = useMemo(() => molten(1), [])
  useEffect(() => () => lake.dispose(), [lake])
  useEffect(() => () => falls.dispose(), [falls])

  useFrame(({ clock }) => {
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    lake.uniforms.time.value = time
    falls.uniforms.time.value = time
  })

  return (
    <>
      <mesh
        position={[0, LAYOUT.lava, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={lake}
        raycast={() => null}
      >
        <circleGeometry args={[LAYOUT.cave + 18, 64]} />
      </mesh>
      {LAYOUT.falls.map(([bearing, radius, top, wide]) => {
        const tall = top - LAYOUT.lava
        return (
          <mesh
            key={bearing}
            position={arc(radius, bearing, LAYOUT.lava + tall / 2)}
            rotation={[0, -bearing, 0]}
            material={falls}
            raycast={() => null}
          >
            <planeGeometry args={[wide, tall]} />
          </mesh>
        )
      })}
    </>
  )
}

const EMBERS = 420
/** The height that an ember climbs before it starts again. */
const CLIMB = 26

/** Embers that rise from the lake, around the visitor. */
function Embers({ roam }: { roam: RefObject<Roam> }) {
  const embers = useRef<Points>(null)
  const places = useMemo(() => new Float32Array(EMBERS * 3), [])
  const glow = usePainting(64, paintGlow)

  useFrame(({ clock }) => {
    const points = embers.current
    if (!points) return
    const time = window.SakugaFX?.calm ? 0 : clock.elapsedTime
    const { x, z } = roam.current
    // Every ember keeps its place in the world, and one that is left behind comes back ahead.
    const wrap = (value: number, middle: number) =>
      middle + ((((value - middle) % 60) + 90) % 60) - 30
    for (let index = 0; index < EMBERS; index++) {
      const climbed = (noise(index + 50) * CLIMB + time * (0.7 + noise(index + 90) * 1.5)) % CLIMB
      const sway = Math.sin(time * 0.8 + index) * 0.7
      places[index * 3] = wrap(noise(index + 7) * 60 + sway, x)
      places[index * 3 + 1] = LAYOUT.lava + climbed
      places[index * 3 + 2] = wrap(noise(index + 970) * 60, z)
    }
    points.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={embers} frustumCulled={false} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[places, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glow}
        color="#ffa63c"
        size={0.34}
        transparent
        opacity={0.95}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

/** A part at the place of every stand in "stands", with the light of its rarity if given. */
function Copies({ mesh, stands, weapons }: { mesh: Mesh; stands: Stand[]; weapons?: Weapon[] }) {
  const copies = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const target = copies.current
    if (!target) return
    const dummy = new Object3D()
    const color = new Color()
    stands.forEach(({ position, turn }, index) => {
      dummy.position.set(...position)
      dummy.rotation.set(0, turn, 0)
      dummy.updateMatrix()
      target.setMatrixAt(index, dummy.matrix)
      if (weapons) target.setColorAt(index, color.set(rarityTheme(weapons[index].rarity).accent))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  })

  if (stands.length === 0) return null
  return (
    <instancedMesh
      // A new number of stands needs a new buffer.
      key={stands.length}
      ref={copies}
      args={[mesh.geometry, mesh.material as Material, stands.length]}
      frustumCulled={false}
      raycast={() => null}
    />
  )
}

type Props = {
  roam: RefObject<Roam>
  stands: Stand[]
  weapons: Weapon[]
}

/** The foundry and its stands, as scripts/build-foundry.py models them. */
export default function FoundryMap({ roam, stands, weapons }: Props) {
  const part = useParts()
  const [plinth, shine] = part('plinth')

  return (
    <>
      <Solid part={part('hub')} />
      <Solid part={part('entry')} />
      <Solid part={part('cave')} />
      <Solid part={part('rail')} />
      {KINDS.map((kind) => {
        const turn: Triple = [0, -LAYOUT.bearings[kind], 0]
        return (
          <group key={kind}>
            <group rotation={turn}>
              <Solid part={part('bridge')} />
            </group>
            <group position={middleOf(kind)} rotation={turn}>
              <Solid part={part(`deck_${kind}`)} />
              <Solid part={part(`mark_${kind}`)} />
              <Rotor kind={kind} part={part} />
            </group>
          </group>
        )
      })}
      {plinth && <Copies mesh={plinth} stands={stands} />}
      {shine && <Copies mesh={shine} stands={stands} weapons={weapons} />}
      <Smith part={part} roam={roam} />
      <Machines part={part} />
      <Lava />
      <Embers roam={roam} />
    </>
  )
}

useGLTF.preload(foundryUrl, false, true)
