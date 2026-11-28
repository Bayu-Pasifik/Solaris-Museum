import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

const INK = '#1d1a4a'
const WIDTH = 512
const HEIGHT = 168
const FONT = "'Avenir Next', Nunito, 'Segoe UI', system-ui, sans-serif"

/** A white board with an ink border and a hard colored shadow, like the buttons of the page. */
function drawSign(title: string, note: string | undefined, shadow: string, ink: string) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const g = canvas.getContext('2d')!
  const board = (x: number, y: number) => {
    g.beginPath()
    g.roundRect(x, y, WIDTH - 30, HEIGHT - 30, 32)
  }

  board(22, 22)
  g.fillStyle = shadow
  g.fill()
  board(5, 5)
  g.fillStyle = '#ffffff'
  g.fill()
  g.strokeStyle = INK
  g.lineWidth = 8
  g.stroke()

  const middle = (WIDTH - 30) / 2 + 5
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = ink
  g.font = `italic 800 52px ${FONT}`
  g.fillText(title, middle, note ? 56 : 76, WIDTH - 70)
  if (note) {
    g.font = `600 32px ${FONT}`
    g.fillText(note, middle, 104, WIDTH - 70)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

type Props = {
  title: string
  note?: string
  shadow: string
  ink?: string
  position: [number, number, number]
  /** Hidden by what stands in front of it, and faded by the air, like any other thing. */
  solid?: boolean
}

/** The name board above a portal or a stand. */
export default function Sign({ title, note, shadow, ink = INK, position, solid = false }: Props) {
  const texture = useMemo(() => drawSign(title, note, shadow, ink), [title, note, shadow, ink])
  useEffect(() => () => texture.dispose(), [texture])

  // Above a portal it is drawn over the orbiting shards, so the name stays readable.
  return (
    <mesh position={position} renderOrder={solid ? 0 : 1}>
      <planeGeometry args={[1.7, (1.7 * HEIGHT) / WIDTH]} />
      <meshBasicMaterial map={texture} transparent depthTest={solid} fog={solid} />
    </mesh>
  )
}
