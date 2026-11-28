import { Suspense, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { EXIT, rowOf, stand } from '../lib/armory'
import { assetUrl, type Character } from '../lib/characters'
import { BAY } from '../lib/corridor'
import type { Insets } from '../lib/insets'
import { farEnd, gateAhead, nearest, type Floor, type Mode, type Roam } from '../lib/roam'
import type { Room } from '../lib/rooms'
import { rarityTheme, type Weapon } from '../lib/weapons'
import Corridor from './Corridor'
import Optional from './Optional'
import Podium from './Podium'
import Portal from './Portal'
import Roamer from './Roamer'
import Sign from './Sign'
import WeaponModel from './WeaponModel'

const SKY = '#e4e0ff'
/** How many rows away a weapon is still loaded; farther ones are lost in the haze. */
const REACH = 6
/** Height of the top of a stand, and the size of what is on it. */
const TOP = 0.48
const SIZE = 0.8
const LOBBY: Room = { name: 'Lobby', description: '', color: '#8f8df7', path: '/' }

const noop = () => {}

type StandProps = {
  weapon: Weapon
  index: number
  /** True while the visitor stands here; the weapon then turns around. */
  active: boolean
  /** Only the weapons close by are loaded. */
  shown: boolean
  onPick: () => void
}

function Stand({ weapon, index, active, shown, onPick }: StandProps) {
  const spin = useRef<Group>(null)
  const theme = rarityTheme(weapon.rarity)
  const { position, turn } = stand(index)

  useFrame((_, delta) => {
    if (!spin.current || window.SakugaFX?.calm) return
    const now = spin.current.rotation.y
    // It goes round while somebody looks, and comes back to the front the short way.
    spin.current.rotation.y = active
      ? now + delta * 1.1
      : now * Math.exp(-4 * delta)
    if (active) spin.current.rotation.y %= Math.PI * 2
  })

  return (
    <group
      position={position}
      rotation={[0, turn, 0]}
      onClick={(event) => {
        event.stopPropagation()
        // A drag that looks around also ends in a click.
        if (event.delta <= 6) onPick()
      }}
    >
      <mesh position={[0, TOP / 2 - 0.06, 0]}>
        <cylinderGeometry args={[0.44, 0.58, TOP - 0.12, 8]} />
        <meshToonMaterial color="#ffffff" />
      </mesh>
      <group position={[0, TOP, 0]} scale={SIZE}>
        <Podium theme={theme} />
        {shown && (
          <group ref={spin}>
            <Optional>
              <Suspense fallback={null}>
                <WeaponModel url={assetUrl(weapon.model)} onReady={noop} />
              </Suspense>
            </Optional>
          </group>
        )}
      </group>
      {shown && (
        <group position={[0, 2.35, 0]} scale={0.75}>
          <Sign
            solid
            title={weapon.name}
            note={'★'.repeat(weapon.rarity)}
            shadow={theme.accent}
            position={[0, 0, 0]}
          />
        </group>
      )}
    </group>
  )
}

type Props = {
  /** The weapons of the open wing, in the order of their stands. */
  weapons: Weapon[]
  mode: Mode
  roam: RefObject<Roam>
  hero?: Character
  insets: Insets
  /** The row nearest along the corridor, and the stand the visitor is at. */
  row: number
  near?: number
  /** The stand whose report is open. */
  picked?: number
  /** Tells the row, the id of the weapon the visitor stands at, and whether the way out is near. */
  onPlace: (row: number, near: string | undefined, exit: boolean) => void
  onPick: (index: number) => void
  onExit: () => void
}

/** A wing of the Armory: a corridor with a weapon on a stand at both sides of every bay. */
export default function ArmoryScene({
  weapons,
  mode,
  roam,
  hero,
  insets,
  row,
  near,
  picked,
  onPlace,
  onPick,
  onExit,
}: Props) {
  const rows = Math.max(Math.ceil(weapons.length / 2), 1)
  const floor = useMemo<Floor>(
    () => ({
      gates: [EXIT],
      circles: weapons.map((_, index) => {
        const [x, , z] = stand(index).position
        return { x, z, radius: 0.9 }
      }),
      far: farEnd(rows),
    }),
    [weapons, rows],
  )
  const told = useRef('')

  const onFrame = (pose: Roam, entered: number | undefined) => {
    const at = Math.min(Math.max(Math.round(-pose.z / BAY), 0), rows - 1)
    const stands = weapons.map((_, index) => stand(index).position)
    const found = nearest(pose.x, pose.z, stands, 3.1)
    const exit = gateAhead(pose.x, pose.z, floor.gates) !== undefined
    // The wing is part of the words, so a new wing is told even at the same place.
    const words = `${weapons[0]?.type} ${at} ${found} ${exit}`
    if (told.current !== words) {
      told.current = words
      onPlace(at, found === undefined ? undefined : weapons[found].id, exit)
    }
    if (entered !== undefined) onExit()
  }

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 14, 34]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 7, 5]} intensity={1.8} />
      <Corridor bays={rows} carpet="#ffb86b" />

      {weapons.map((weapon, index) => (
        <Stand
          key={weapon.id}
          weapon={weapon}
          index={index}
          active={index === near || index === picked}
          shown={Math.abs(rowOf(index) - row) <= REACH || index === picked}
          onPick={() => onPick(index)}
        />
      ))}

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
