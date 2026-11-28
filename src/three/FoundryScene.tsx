import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, type Group } from 'three'
import type { HallProps } from '../components/WingWalk'
import {
  arc,
  EXIT,
  FORGE_NAMES,
  floorOf,
  kindOf,
  KINDS,
  LAYOUT,
  middleOf,
  standsOf,
  type Kind,
  type Stand,
} from '../lib/foundry'
import { gateAhead, nearest } from '../lib/roam'
import type { Room } from '../lib/rooms'
import { rarityTheme, type Weapon } from '../lib/weapons'
import FoundryMap from './FoundryMap'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'
import SpinningWeapon from './SpinningWeapon'

const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }
const noop = () => {}

/** The dark of the cavern, warmed by the lake. */
const SMOKE = '#1c0b16'

/**
 * The weapons are much heavier than the foundry, so only those of the forge that the visitor is
 * at are loaded: from this far outside its floor on.
 */
const DOORSTEP = 4
/** How far a name board is drawn; farther ones only crowd the view. */
const SIGHT = 13
/** Height of the name board above a weapon. */
const BOARD = 2.35

/** The board in the arch of every forge. */
function Boards({ weapons }: { weapons: Weapon[] }) {
  const { far, radius } = LAYOUT.forge
  return (
    <>
      {KINDS.map((kind) => {
        const own = weapons.filter((weapon) => kindOf(weapon.type) === kind)
        if (own.length === 0) return null
        const bearing = LAYOUT.bearings[kind]
        return (
          <group
            key={kind}
            position={arc(far - radius + 0.2, bearing, 4.9)}
            rotation={[0, -bearing, 0]}
            scale={2.5}
          >
            <Sign
              solid
              title={own[0].type}
              note={`${FORGE_NAMES[kind]} · ${own.length}`}
              shadow="#ff8a2a"
              position={[0, 0, 0]}
            />
          </group>
        )
      })}
    </>
  )
}

/** A shaft of light over a stand. */
function Shaft({ stand, color, strong }: { stand: Stand; color: string; strong: boolean }) {
  const shaft = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!shaft.current || window.SakugaFX?.calm) return
    shaft.current.rotation.y = clock.elapsedTime * (strong ? 0.9 : 0.25)
  })
  const [x, , z] = stand.position
  const height = strong ? 5.5 : 3.6
  return (
    <group ref={shaft} position={[x, LAYOUT.standTop + height / 2, z]}>
      <mesh raycast={() => null}>
        <cylinderGeometry args={[strong ? 0.8 : 0.3, 0.46, height, strong ? 8 : 6, 1, true]} />
        {/* Only its far half is drawn, so the light stays behind the weapon. */}
        <meshBasicMaterial
          color={color}
          transparent
          opacity={strong ? 0.17 : 0.08}
          blending={AdditiveBlending}
          depthWrite={false}
          side={BackSide}
        />
      </mesh>
    </group>
  )
}

/** The walk of the Armory: a foundry with a forge for every kind of weapon. */
export default function FoundryScene({
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
}: HallProps<Weapon>) {
  // The list is a new one at every render, and the stands only change with what is on them.
  const shelved = items.map((item) => item.id).join()
  const stands = useMemo(() => standsOf(items), [shelved])
  const floor = useMemo(() => floorOf(stands), [stands])
  // The forge that is loaded, and the stands whose names are close enough to be read. The
  // names are one string, so it is easy to compare.
  const [open, setOpen] = useState<Kind>()
  const [seen, setSeen] = useState('')
  const close = useMemo(() => new Set(seen.split(',').filter(Boolean).map(Number)), [seen])
  const told = useRef('')
  const lastRow = useRef(0)

  const onFrame: Parameters<typeof Roamer>[0]['onFrame'] = (pose, entered) => {
    const spots = stands.map((stand) => stand.position)
    const within = spots
      .flatMap(([x, , z], index) => (Math.hypot(x - pose.x, z - pose.z) < SIGHT ? [index] : []))
      .join()
    if (within !== seen) setSeen(within)
    const at = KINDS.find((kind) => {
      const [x, , z] = middleOf(kind)
      return Math.hypot(x - pose.x, z - pose.z) < LAYOUT.forge.radius + DOORSTEP
    })
    if (at !== open) setOpen(at)

    const found = nearest(pose.x, pose.z, spots, 2.9)
    // The last stand that was passed says where in the foundry the visitor is. Whoever comes
    // into another forge starts at its first one.
    if (found !== undefined) lastRow.current = found
    else if (at && stands[lastRow.current]?.forge !== at) {
      lastRow.current = Math.max(stands.findIndex((stand) => stand.forge === at), 0)
    }
    const row = lastRow.current
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    const words = `${shelved.length} ${row} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(row, found === undefined ? undefined : items[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  return (
    <>
      <color attach="background" args={[SMOKE]} />
      <fog attach="fog" args={[SMOKE, 45, 180]} />
      {/* Light from the dark above, and from the lava below. */}
      <hemisphereLight args={['#b9b2ff', '#ff7a30', 1.9]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[-8, 20, 22]} color="#ffe3c4" intensity={1.2} />
      <FoundryMap roam={roam} stands={stands} weapons={items} />
      <Boards weapons={items} />

      {items.map((weapon, index) => {
        const stand = stands[index]
        const active = index === near || index === picked
        const loaded = stand.forge === open || index === picked
        const named = close.has(index) || index === picked
        const color = rarityTheme(weapon.rarity).accent
        const [x, , z] = stand.position
        return (
          <group key={weapon.id}>
            {/* The best weapons can be seen from across the foundry. */}
            {(active || weapon.rarity >= 5) && <Shaft stand={stand} color={color} strong={active} />}
            {loaded && (
              <>
                <SpinningWeapon
                  weapon={weapon}
                  position={[x, LAYOUT.standTop, z]}
                  turn={stand.turn}
                  active={active}
                />
                {/* One simple shape takes the clicks, so the pointer is never tested against a model. */}
                <mesh
                  visible={false}
                  position={[x, BOARD / 2, z]}
                  onClick={(event) => {
                    event.stopPropagation()
                    // A drag that looks around also ends in a click.
                    if (event.delta <= 6) onPick(index)
                  }}
                >
                  <cylinderGeometry args={[0.65, 0.65, BOARD, 8]} />
                </mesh>
              </>
            )}
            {named && (
              <group position={[x, BOARD, z]} rotation={[0, stand.turn, 0]} scale={0.65}>
                <Sign
                  solid
                  title={weapon.name}
                  note={'★'.repeat(weapon.rarity)}
                  shadow={color}
                  position={[0, 0, 0]}
                />
              </group>
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
        floor={floor}
        insets={insets}
        onFrame={onFrame}
      />
    </>
  )
}
