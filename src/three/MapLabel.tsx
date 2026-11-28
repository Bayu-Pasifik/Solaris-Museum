import { useEffect, useMemo } from 'react'
import { useThree, type ThreeElements } from '@react-three/fiber'
import { CanvasTexture, MathUtils, PerspectiveCamera, SRGBColorSpace } from 'three'

const INK = '#1d1a4a'
const MUTE = '#8580b0'
const FONT = "'Avenir Next', Nunito, 'Segoe UI', system-ui, sans-serif"
/** Canvas pixels per screen pixel, so the text stays sharp. */
const SHARP = 3

/** A white pill with an ink border and a hard shadow, with one or two lines in it. */
function draw(text: string, note: string | undefined, shadow: string) {
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')!
  const title = `italic 800 13px ${FONT}`
  const small = `600 11px ${FONT}`
  g.font = title
  let inner = g.measureText(text).width
  if (note) {
    g.font = small
    inner = Math.max(inner, g.measureText(note).width)
  }
  const width = Math.ceil(inner) + 28
  const height = note ? 38 : 24
  canvas.width = (width + 4) * SHARP
  canvas.height = (height + 4) * SHARP
  g.scale(SHARP, SHARP)

  const pill = (x: number, y: number) => {
    g.beginPath()
    g.roundRect(x, y, width, height, height / 2)
  }
  pill(4, 4)
  g.fillStyle = shadow
  g.fill()
  pill(1, 1)
  g.fillStyle = '#ffffff'
  g.fill()
  g.strokeStyle = INK
  g.lineWidth = 2
  g.stroke()

  const middle = width / 2 + 1
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = INK
  g.font = title
  g.fillText(text, middle, 14)
  if (note) {
    g.fillStyle = MUTE
    g.font = small
    g.fillText(note, middle, 29)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return { texture, width: width + 4, height: height + 4 }
}

type Props = Omit<ThreeElements['sprite'], 'scale'> & {
  text: string
  note?: string
  shadow?: string
}

/** A name over the map. It keeps its size on screen however far the camera is. */
export default function MapLabel({ text, note, shadow = '#b8b3ff', ...sprite }: Props) {
  const label = useMemo(() => draw(text, note, shadow), [text, note, shadow])
  useEffect(() => () => label.texture.dispose(), [label])

  const camera = useThree((state) => state.camera)
  const screen = useThree((state) => state.size.height)
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 50
  // The world size, one unit away, of one pixel of the screen.
  const pixel = (2 * Math.tan(MathUtils.degToRad(fov / 2))) / screen

  return (
    <sprite {...sprite} scale={[label.width * pixel, label.height * pixel, 1]} renderOrder={2}>
      <spriteMaterial
        map={label.texture}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        transparent
      />
    </sprite>
  )
}
