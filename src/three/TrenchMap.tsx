import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  ShaderMaterial,
  Vector3,
  type Group,
  type InstancedMesh,
  type Material,
  type Points,
} from 'three'
import trenchUrl from '../assets/documents/trench.glb?url'
import type { DocumentKind } from '../lib/documents'
import type { Roam } from '../lib/roam'
import { base, center, DEPTHS, LAYOUT, type Stand, type Trail } from '../lib/trench'

type Parts = Map<string, Mesh>

const PIVOTS = LAYOUT.pivots as unknown as Record<string, [number, number, number]>
const noRaycast = () => null
const calm = () => Boolean(window.SakugaFX?.calm)
const mod = (value: number, size: number) => ((value % size) + size) % size

/**
 * Adds to a lit material what the water does: a net of light on what is near the floor, and, for
 * plants, a slow sway that grows with the height.
 */
function water(material: Material, uniforms: object, sway: boolean) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vSea;')
      .replace(
        '#include <project_vertex>',
        `vec4 sea = modelMatrix * vec4(transformed, 1.0);
        ${
          sway
            ? `float reach = clamp(sea.y - 0.4, 0.0, 8.0);
        sea.x += sin(uTime * 1.2 + sea.z * 0.4 + sea.y * 0.55) * 0.045 * reach;
        sea.z += cos(uTime * 0.9 + sea.x * 0.3 + sea.y * 0.4) * 0.025 * reach;`
            : ''
        }
        vSea = sea.xyz;
        vec4 mvPosition = viewMatrix * sea;
        gl_Position = projectionMatrix * mvPosition;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uRipple;\nvarying vec3 vSea;',
      )
      .replace(
        '#include <opaque_fragment>',
        `float one = abs(sin(vSea.x * 1.1 + sin(vSea.z * 0.9 + uTime * 0.7) * 1.7 + uTime * 0.35));
        float two = abs(sin(vSea.z * 1.25 + sin(vSea.x * 0.8 - uTime * 0.6) * 1.6 - uTime * 0.3));
        float net = pow(1.0 - min(one, two), 5.0);
        outgoingLight += (diffuseColor.rgb * 0.8 + 0.12) * net * uRipple * smoothstep(6.0, 0.0, vSea.y);
        #include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => (sway ? 'sea-sway' : 'sea')
}

/** The meshes of the file, each with the material that the end of its name asks for. */
export function useTrenchParts(kind: DocumentKind): Parts {
  // Draco is off (models use Meshopt), so no decoder is fetched from a CDN.
  const { nodes } = useGLTF(trenchUrl, false, true)

  const kit = useMemo(() => {
    const uniforms = { uTime: { value: 0 }, uRipple: { value: 0 } }
    const painted = { vertexColors: true, side: DoubleSide }
    const lit = new MeshLambertMaterial({ ...painted, flatShading: true })
    const sway = new MeshLambertMaterial({ ...painted, flatShading: true })
    water(lit, uniforms, false)
    water(sway, uniforms, true)
    const materials = {
      lit,
      sway,
      glow: new MeshBasicMaterial(painted),
      // Plants that shine move like the others.
      shine: new MeshBasicMaterial(painted),
      glass: new MeshBasicMaterial({ ...painted, transparent: true, opacity: 0.34, depthWrite: false }),
      beam: new MeshBasicMaterial({
        ...painted,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    }
    return { uniforms, materials }
  }, [])
  useEffect(
    () => () => Object.values(kit.materials).forEach((item) => item.dispose()),
    [kit],
  )

  useFrame(({ clock }) => {
    kit.uniforms.uTime.value = calm() ? 0 : clock.elapsedTime
    kit.uniforms.uRipple.value = DEPTHS[kind].ripple
  })

  return useMemo(() => {
    const { materials } = kit
    const found = Object.values(nodes)
      .filter((node): node is Mesh => node instanceof Mesh)
      .map((node) => {
        const mesh = node.clone()
        const { name } = node
        const end = name.slice(name.lastIndexOf('_') + 1)
        // Letters that glow keep their light when they move.
        const bright = /^dr_(stand_foreign|mark_foreign|mark_picture)_move$/.test(name)
        mesh.material =
          bright || end === 'glow'
            ? materials.glow
            : end === 'sway'
              ? materials.sway
              : end === 'glass'
                ? materials.glass
                : end === 'beam'
                  ? materials.beam
                  : materials.lit
        mesh.updateMatrix()
        return mesh
      })
    return new Map(found.map((mesh) => [mesh.name, mesh]))
  }, [nodes, kit])
}

/** One mesh of the file, with the place that the file gives it. */
function Part({ mesh }: { mesh?: Mesh }) {
  if (!mesh) return null
  return (
    <mesh
      geometry={mesh.geometry}
      material={mesh.material}
      position={mesh.position}
      quaternion={mesh.quaternion}
      scale={mesh.scale}
      raycast={noRaycast}
    />
  )
}

/** Where a thing of one document stands, and what of it wakes when a visitor comes. */
export function StandModel({
  parts,
  kind,
  at,
  awake,
}: {
  parts: Parts
  kind: DocumentKind
  at: Stand
  awake: boolean
}) {
  const name = `dr_stand_${kind}`
  const [x, y, z] = PIVOTS[`${name}_move`]
  const moving = useRef<Group>(null)
  const level = useRef(0)
  const angle = useRef(at.s)

  useFrame(({ clock }, delta) => {
    const thing = moving.current
    if (!thing) return
    const step = Math.min(delta, 0.05)
    const still = calm()
    level.current = still ? Number(awake) : MathUtils.damp(level.current, Number(awake), 3, step)
    const open = level.current
    const time = still ? 0 : clock.elapsedTime + at.s
    if (kind === 'text') {
      // The cork leaves the bottle and floats beside the letter.
      thing.position.set(x + open * 1.65, y + open * (0.9 + Math.sin(time * 2) * 0.14), z)
      thing.rotation.set(0, 0, -open * (0.8 + Math.sin(time * 1.3) * 0.25))
    } else if (kind === 'picture') {
      // The clam breathes while it sleeps, and opens for a visitor.
      thing.rotation.x = -(0.16 + open * 1.5 + Math.sin(time * 0.9) * 0.08 * (1 - open))
    } else {
      if (!still) angle.current += step * (kind === 'record' ? open * 3.4 : 0.25 + open * 1.3)
      thing.rotation.y = angle.current
      if (kind === 'foreign') thing.position.y = y + open * 0.4
    }
  })

  return (
    <group position={[at.x, base(at.s), -at.s]} rotation={[0, at.turn, 0]}>
      <Part mesh={parts.get(`${name}_paint`)} />
      <Part mesh={parts.get(`${name}_glow`)} />
      <Part mesh={parts.get(`${name}_glass`)} />
      <group ref={moving} position={[x, y, z]}>
        <Part mesh={parts.get(`${name}_move`)} />
      </group>
    </group>
  )
}

/** The tiles of the sea floor around the visitor, one after the other. */
function Floor({ parts, kind, roam }: { parts: Parts; kind: DocumentKind; roam: RefObject<Roam> }) {
  const range = () => {
    const s = -roam.current.z
    return [
      Math.floor((s - 36) / LAYOUT.tile),
      Math.floor((s + LAYOUT.tile + 24) / LAYOUT.tile),
    ] as const
  }
  const [[low, high], setRange] = useState(range)
  useFrame(() => {
    const next = range()
    if (next[0] !== low || next[1] !== high) setRange(next)
  })

  return (
    <>
      {Array.from({ length: high - low + 1 }, (_, index) => low + index).map((tile) => (
        <group key={tile} position={[0, 0, -tile * LAYOUT.tile]}>
          {['paint', 'sway', 'glow'].map((end) => (
            <Part key={end} mesh={parts.get(`dr_tile_${kind}_${end}`)} />
          ))}
        </group>
      ))}
    </>
  )
}

/** What the path ends at, with the things that circle it. */
function Landmark({ parts, kind, end }: { parts: Parts; kind: DocumentKind; end: number }) {
  const name = `dr_mark_${kind}`
  const [x, y, z] = PIVOTS[`${name}_move`]
  const circling = useRef<Group>(null)
  useFrame(({ clock }) => {
    const ring = circling.current
    if (!ring || calm()) return
    ring.rotation.y = clock.elapsedTime * 0.16
    ring.position.y = y + Math.sin(clock.elapsedTime * 0.7) * 0.25
  })
  return (
    <group position={[center(end), base(end), -end]}>
      {['paint', 'sway', 'glow'].map((part) => (
        <Part key={part} mesh={parts.get(`${name}_${part}`)} />
      ))}
      <group ref={circling} position={[x, y, z]}>
        <Part mesh={parts.get(`${name}_move`)} />
      </group>
    </group>
  )
}

/** The diving bell behind the start, with a wheel that turns at its side. */
function Bell({ parts }: { parts: Parts }) {
  const wheel = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (wheel.current && !calm()) wheel.current.rotation.x = clock.elapsedTime * 0.5
  })
  return (
    <group position={[center(-4), base(-4), 4]}>
      <Part mesh={parts.get('dr_bell_paint')} />
      <Part mesh={parts.get('dr_bell_glow')} />
      <group ref={wheel} position={PIVOTS.dr_bell_move}>
        <Part mesh={parts.get('dr_bell_move')} />
      </group>
    </group>
  )
}

/** Where a big swimmer is: it loops far around the stretch where the visitor is. */
function loop(time: number, which: number, wide: number, long: number, speed: number) {
  return {
    x: Math.sin(time * speed * 2 + which * 2.2) * wide,
    ahead: 28 + Math.sin(time * speed + which * 2.1) * long,
  }
}

function Whale({ parts, roam }: { parts: Parts; roam: RefObject<Roam> }) {
  const body = useRef<Group>(null)
  const tail = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!body.current || !tail.current) return
    const time = calm() ? 12 : clock.elapsedTime
    const now = loop(time, 0, 22, 34, 0.05)
    const next = loop(time + 0.5, 0, 22, 34, 0.05)
    body.current.position.set(now.x, 12.5 + Math.sin(time * 0.3) * 1.2, roam.current.z - now.ahead)
    body.current.rotation.y = Math.atan2(next.x - now.x, now.ahead - next.ahead)
    tail.current.rotation.x = Math.sin(time * 1.5) * 0.28
  })
  return (
    <group ref={body} scale={1.15}>
      <Part mesh={parts.get('dr_whale_paint')} />
      <Part mesh={parts.get('dr_whale_glow')} />
      <group ref={tail} position={PIVOTS.dr_whale_move}>
        <Part mesh={parts.get('dr_whale_move')} />
      </group>
    </group>
  )
}

function Manta({ parts, roam, which }: { parts: Parts; roam: RefObject<Roam>; which: number }) {
  const body = useRef<Group>(null)
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!body.current || !left.current || !right.current) return
    const time = calm() ? 7 : clock.elapsedTime
    const now = loop(time, which + 1, 17, 40, 0.07)
    const next = loop(time + 0.5, which + 1, 17, 40, 0.07)
    body.current.position.set(
      now.x,
      6.5 + which * 1.9 + Math.sin(time * 0.6 + which) * 0.8,
      roam.current.z - now.ahead,
    )
    body.current.rotation.y = Math.atan2(next.x - now.x, now.ahead - next.ahead)
    const flap = Math.sin(time * 1.8 + which * 2) * 0.4
    left.current.rotation.z = -flap
    right.current.rotation.z = flap
  })
  return (
    <group ref={body}>
      <Part mesh={parts.get('dr_manta_paint')} />
      <group ref={left}>
        <Part mesh={parts.get('dr_manta_left')} />
      </group>
      <group ref={right}>
        <Part mesh={parts.get('dr_manta_right')} />
      </group>
    </group>
  )
}

const SCHOOLS = 4
const FISH = SCHOOLS * 22
/** How close a walker comes before the paper fish part. */
const SHY = 5

/** Schools of fish folded from paper. They part around the visitor. */
function PaperFish({ mesh, roam, tints }: { mesh: Mesh; roam: RefObject<Roam>; tints: string[] }) {
  const copies = useRef<InstancedMesh>(null)
  const work = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    const target = copies.current!
    const color = new Color()
    for (let index = 0; index < FISH; index++) {
      target.setColorAt(index, color.set(tints[(index + Math.floor(index / 22)) % tints.length]))
    }
    if (target.instanceColor) target.instanceColor.needsUpdate = true
  }, [tints])

  useFrame(({ clock }) => {
    const target = copies.current
    if (!target) return
    const time = calm() ? 3 : clock.elapsedTime
    const walker = -roam.current.z
    for (let index = 0; index < FISH; index++) {
      const school = Math.floor(index / 22)
      const one = index % 22
      // A school stays where it is until it falls far behind; then it comes back ahead.
      const s = walker - 14 + mod(school * 19 + time * 0.5 - walker + 20, 76)
      const turn = time * (0.55 + (one % 4) * 0.08) * (school % 2 ? -1 : 1) + one * 2.399
      const wide = 0.7 + (one % 5) * 0.34
      let x = center(s) + Math.sin(time * 0.21 + school * 2.4) * 4.5 + Math.cos(turn) * wide
      let y = 4.9 + (school % 3) * 0.8 + Math.sin(turn * 1.3 + one) * 0.4
      let z = -s + Math.sin(turn) * wide
      const dx = x - roam.current.x
      const dz = z - roam.current.z
      const away = Math.hypot(dx, y - 1.7, dz)
      if (away < SHY) {
        const push = (SHY - away) ** 2 * 0.22
        const flat = Math.max(Math.hypot(dx, dz), 0.01)
        x += (dx / flat) * push
        z += (dz / flat) * push
        y += push * 0.45
      }
      const way = school % 2 ? -1 : 1
      work.position.set(x, y, z)
      work.rotation.set(
        0,
        Math.atan2(-Math.sin(turn) * way, Math.cos(turn) * way) + Math.sin(time * 9 + one) * 0.22,
        0,
      )
      work.scale.setScalar(0.62 + (one % 3) * 0.12)
      work.updateMatrix()
      target.setMatrixAt(index, work.matrix.multiply(mesh.matrix))
    }
    target.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={copies}
      args={[mesh.geometry, mesh.material as Material, FISH]}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}

const JELLIES = 18

function Jellies({ mesh, roam, color }: { mesh: Mesh; roam: RefObject<Roam>; color: string }) {
  const copies = useRef<InstancedMesh>(null)
  const work = useMemo(() => new Object3D(), [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        vertexColors: true,
        side: DoubleSide,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => void material.color.set(color), [material, color])

  useFrame(({ clock }) => {
    const target = copies.current
    if (!target) return
    const time = calm() ? 5 : clock.elapsedTime
    const walker = -roam.current.z
    for (let index = 0; index < JELLIES; index++) {
      const s = walker - 20 + mod(index * 5.7 - walker, 100)
      const side = index % 2 ? -1 : 1
      const pulse = Math.sin(time * 2.3 + index) * 0.13
      const size = 0.45 + ((index * 7) % 5) * 0.14
      work.position.set(
        center(s) + side * (4.2 + ((index * 37) % 11)),
        4.6 + (index % 5) * 1.25 + Math.sin(time * 0.45 + index * 1.7) * 0.9,
        -s,
      )
      work.rotation.set(0, index, Math.sin(time * 0.35 + index) * 0.18)
      work.scale.set(size * (1 + pulse), size * (1 - pulse), size * (1 + pulse))
      work.updateMatrix()
      target.setMatrixAt(index, work.matrix.multiply(mesh.matrix))
    }
    target.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={copies}
      args={[mesh.geometry, material, JELLIES]}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}

const SHAFTS = 9

/** Shafts of light that come down through the water. */
function Shafts({ mesh, roam }: { mesh: Mesh; roam: RefObject<Roam> }) {
  const copies = useRef<InstancedMesh>(null)
  const work = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    const target = copies.current
    if (!target) return
    const time = calm() ? 0 : clock.elapsedTime
    const walker = -roam.current.z
    for (let index = 0; index < SHAFTS; index++) {
      const s = walker - 12 + mod(index * 9.4 - walker, 85)
      work.position.set(center(s) + (((index * 29) % 17) - 8) * 1.4, -0.5, -s)
      work.rotation.set(0, index * 1.9, -0.28 + Math.sin(time * 0.25 + index) * 0.07)
      work.scale.setScalar(0.8 + (index % 3) * 0.25)
      work.updateMatrix()
      target.setMatrixAt(index, work.matrix.multiply(mesh.matrix))
    }
    target.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={copies}
      args={[mesh.geometry, mesh.material as Material, SHAFTS]}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}

const BUBBLES = 80

type Bubble = { x: number; y: number; z: number; age: number; life: number; size: number }

/** Air that leaves the helmet of the visitor, and the stand that has woken. */
function Bubbles({ roam, third, awake }: { roam: RefObject<Roam>; third: boolean; awake?: Stand }) {
  const copies = useRef<InstancedMesh>(null)
  const work = useMemo(() => new Object3D(), [])
  const pool = useMemo<Bubble[]>(
    () => Array.from({ length: BUBBLES }, () => ({ x: 0, y: 0, z: 0, age: 1, life: 1, size: 0 })),
    [],
  )
  const wait = useRef({ walker: 0, stand: 0, next: 0 })

  const free = (x: number, y: number, z: number, size: number) => {
    const bubble = pool[wait.current.next++ % BUBBLES]
    Object.assign(bubble, { x, y, z, size, age: 0, life: 1.8 + Math.random() * 1.8 })
  }

  useFrame(({ camera }, delta) => {
    const target = copies.current
    if (!target) return
    const step = Math.min(delta, 0.05)
    const pose = roam.current
    const timers = wait.current
    if (!calm()) {
      timers.walker -= step
      if (timers.walker <= 0) {
        // A breath: a few bubbles at once, then a pause.
        timers.walker = 1.6 + Math.random()
        for (let index = 0; index < 5; index++) {
          const spread = () => (Math.random() - 0.5) * 0.3
          if (third) {
            free(pose.x + spread(), base(-pose.z) + 1.7 + index * 0.09, pose.z + spread(), 0.045)
          } else {
            // Seen from inside the helmet, they rise at the sides of the view.
            const side = (index % 2 ? 1 : -1) * (0.75 + spread())
            free(
              camera.position.x - Math.sin(pose.yaw) * 1.6 + Math.cos(pose.yaw) * side,
              camera.position.y - 0.9 + index * 0.1,
              camera.position.z - Math.cos(pose.yaw) * 1.6 - Math.sin(pose.yaw) * side,
              0.022,
            )
          }
        }
      }
      timers.stand -= step
      if (awake && timers.stand <= 0) {
        timers.stand = 0.09
        const a = Math.random() * Math.PI * 2
        free(
          awake.x + Math.cos(a) * 1.3,
          base(awake.s) + 0.3 + Math.random(),
          -awake.s + Math.sin(a) * 0.9,
          0.03 + Math.random() * 0.05,
        )
      }
    }
    pool.forEach((bubble, index) => {
      bubble.age += step
      const left = bubble.age < bubble.life
      bubble.y += step * (0.7 + bubble.size * 6)
      work.position.set(bubble.x + Math.sin(bubble.age * 5 + index) * 0.07, bubble.y, bubble.z)
      work.scale.setScalar(left ? bubble.size * Math.min(bubble.age * 5, 1) : 0)
      work.updateMatrix()
      target.setMatrixAt(index, work.matrix)
    })
    target.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={copies}
      args={[undefined, undefined, BUBBLES]}
      frustumCulled={false}
      raycast={noRaycast}
    >
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="#e8fdff" transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  )
}

const SPECKS = 600
const BOX = [34, 15, 34] as const

/** The slow snow of the sea, which fills the water around the eyes. */
function Snow() {
  const points = useRef<Points>(null)
  const [start, positions] = useMemo(() => {
    const at = Float32Array.from({ length: SPECKS * 3 }, (_, index) => Math.random() * BOX[index % 3])
    return [at, at.slice()]
  }, [])
  useFrame(({ camera, clock }) => {
    const cloud = points.current
    if (!cloud) return
    const time = calm() ? 0 : clock.elapsedTime
    const eye = camera.position
    const from = [eye.x - BOX[0] / 2, eye.y - BOX[1] / 2, eye.z - BOX[2] / 2]
    for (let index = 0; index < SPECKS; index++) {
      const i = index * 3
      positions[i] = from[0] + mod(start[i] + Math.sin(time * 0.3 + index) * 0.5 - from[0], BOX[0])
      positions[i + 1] = from[1] + mod(start[i + 1] - time * 0.22 - from[1], BOX[1])
      positions[i + 2] = from[2] + mod(start[i + 2] - from[2], BOX[2])
    }
    cloud.geometry.attributes.position.needsUpdate = true
  })
  return (
    <points ref={points} frustumCulled={false} raycast={noRaycast}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f2ffff" size={0.055} transparent opacity={0.55} depthWrite={false} />
    </points>
  )
}

/** The water far away: darker at the level of the eyes, lighter toward the surface. */
function Dome({ kind }: { kind: DocumentKind }) {
  const dome = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uLow: { value: new Color() }, uHigh: { value: new Color() } },
        vertexShader: `varying vec3 vWay;
          void main() {
            vWay = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `uniform vec3 uLow;
          uniform vec3 uHigh;
          varying vec3 vWay;
          void main() {
            gl_FragColor = vec4(mix(uLow, uHigh, pow(clamp(vWay.y, 0.0, 1.0), 0.75)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    material.uniforms.uLow.value.set(DEPTHS[kind].water)
    material.uniforms.uHigh.value.set(DEPTHS[kind].above)
  }, [material, kind])
  useFrame(({ camera }) => dome.current?.position.copy(camera.position))
  return (
    <mesh ref={dome} material={material} renderOrder={-1} frustumCulled={false} raycast={noRaycast}>
      <sphereGeometry args={[160, 24, 16]} />
    </mesh>
  )
}

const FISH_TINTS: Record<DocumentKind, string[]> = {
  text: ['#fff3d6', '#ffd9a0', '#ffffff'],
  picture: ['#ffd1e8', '#bfeaff', '#fff1a8'],
  record: ['#d9c4ff', '#a8f4ff', '#ffc4ee'],
  foreign: ['#6df4ff', '#b8ff9a', '#b48cff'],
}

type Props = {
  parts: Parts
  kind: DocumentKind
  trail: Trail
  roam: RefObject<Roam>
  third: boolean
  /** The stand that the visitor is at. */
  awake?: Stand
}

/** The sea around the stands, as scripts/build-trench.py models it. */
export default function TrenchMap({ parts, kind, trail, roam, third, awake }: Props) {
  const fish = parts.get('dr_fish_glow')
  const jelly = parts.get('dr_jelly_glow')
  const shaft = parts.get('dr_shaft_beam')
  // The arches near the visitor are enough; the water hides the others.
  const [at, setAt] = useState(() => new Vector3(0, 0, roam.current.z))
  useFrame(() => {
    if (Math.abs(roam.current.z - at.z) > 8) setAt(new Vector3(0, 0, roam.current.z))
  })
  const arches = trail.arches.filter((arch) => Math.abs(arch.s + at.z) < 100)
  const places = useMemo(
    () =>
      arches.map((arch) =>
        new Matrix4().makeTranslation(center(arch.s), base(arch.s), -arch.s),
      ),
    [arches.map((arch) => arch.s).join()],
  )

  return (
    <>
      <Dome kind={kind} />
      <Floor parts={parts} kind={kind} roam={roam} />
      <Bell parts={parts} />
      {trail.end + at.z < 130 && <Landmark parts={parts} kind={kind} end={trail.end} />}
      {places.map((place, index) => (
        <group key={arches[index].s} matrix={place} matrixAutoUpdate={false}>
          <Part mesh={parts.get('dr_arch_paint')} />
          <Part mesh={parts.get('dr_arch_glow')} />
        </group>
      ))}
      <Whale parts={parts} roam={roam} />
      {[0, 1, 2].map((which) => (
        <Manta key={which} parts={parts} roam={roam} which={which} />
      ))}
      {fish && <PaperFish mesh={fish} roam={roam} tints={FISH_TINTS[kind]} />}
      {jelly && <Jellies mesh={jelly} roam={roam} color={DEPTHS[kind].jelly} />}
      {shaft && kind !== 'foreign' && <Shafts mesh={shaft} roam={roam} />}
      <Bubbles roam={roam} third={third} awake={awake} />
      <Snow />
    </>
  )
}

useGLTF.preload(trenchUrl, false, true)
