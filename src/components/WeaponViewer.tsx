import { Suspense, useRef, useState, type ComponentRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils, Vector3 } from 'three'
import { assetUrl } from '../lib/characters'
import { rarityTheme, type Weapon } from '../lib/weapons'
import Podium from '../three/Podium'
import WeaponModel from '../three/WeaponModel'
import SceneBoundary from './SceneBoundary'

/** Where the camera starts, and the point that it looks at. */
const EYE: [number, number, number] = [0, 1.15, 3.65]
const CENTER: [number, number, number] = [0, 0.9, 0]
/** The closest and the farthest the camera goes. */
const NEAR = 0.45
const FAR = 5

const noop = () => {}

type Props = {
  weapon: Weapon
  /** Called when the model is on the stage. */
  onReady?: () => void
}

/**
 * The model of a weapon, to turn, move and zoom. It fills its parent, which needs a size and a
 * position of its own.
 */
export default function WeaponViewer({ weapon, onReady = noop }: Props) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  // It turns by itself until the visitor takes hold of it.
  const [held, setHeld] = useState(false)

  /** Moves the camera along its line of sight, for the buttons. */
  const zoom = (factor: number) => {
    const orbit = controls.current
    if (!orbit) return
    setHeld(true)
    const away = new Vector3().subVectors(orbit.object.position, orbit.target)
    away.setLength(MathUtils.clamp(away.length() * factor, NEAR, FAR))
    orbit.object.position.copy(orbit.target).add(away)
    orbit.update()
  }

  const reset = () => {
    const orbit = controls.current
    if (!orbit) return
    orbit.object.position.set(...EYE)
    orbit.target.set(...CENTER)
    orbit.update()
    setHeld(false)
  }

  const buttons = [
    { label: 'Perbesar', sign: '+', act: () => zoom(0.75) },
    { label: 'Perkecil', sign: '−', act: () => zoom(1 / 0.75) },
    { label: 'Kembalikan tampilan', sign: '↺', act: reset },
  ]

  return (
    <>
      <SceneBoundary message={`Model ${weapon.name} gagal dimuat.`}>
        {/* flat: no tone mapping, so unlit anime textures keep their colors. */}
        <Canvas flat camera={{ position: EYE, fov: 35 }} dpr={[1, 2]}>
          <Podium theme={rarityTheme(weapon.rarity)} />
          <Suspense fallback={null}>
            <WeaponModel url={assetUrl(weapon.model)} onReady={onReady} />
          </Suspense>
          <OrbitControls
            ref={controls}
            target={CENTER}
            minDistance={NEAR}
            maxDistance={FAR}
            // The wheel and the pinch go toward what is pointed at, to look at a detail.
            zoomToCursor
            maxPolarAngle={Math.PI / 1.9}
            autoRotate={!held && !window.SakugaFX?.calm}
            autoRotateSpeed={1.5}
            onStart={() => setHeld(true)}
          />
        </Canvas>
      </SceneBoundary>
      <div className="zoom" role="group" aria-label="Perbesaran model">
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            className="pill"
            aria-label={button.label}
            title={button.label}
            onClick={(event) => {
              // The focus leaves the button, so the keys still walk after a click.
              if (event.detail > 0) event.currentTarget.blur()
              button.act()
            }}
          >
            {button.sign}
          </button>
        ))}
      </div>
    </>
  )
}
