import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

/** A number from 0 to 1 that is always the same for the same seed. */
export const noise = (seed: number) => Math.abs((Math.sin(seed * 127.1) * 43758.5453) % 1)

/** A canvas as a texture that is freed with the component. It is square without a height. */
export function usePainting(
  size: number,
  paint: (g: CanvasRenderingContext2D, size: number) => void,
  height = size,
) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = height
    paint(canvas.getContext('2d')!, size)
    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    result.anisotropy = 8
    return result
  }, [size, height, paint])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

/** A soft round light of warm color. */
export function paintGlow(g: CanvasRenderingContext2D, size: number) {
  const middle = size / 2
  const light = g.createRadialGradient(middle, middle, 0, middle, middle, middle)
  light.addColorStop(0, '#ffe9a8ff')
  light.addColorStop(0.3, '#ffc85a66')
  light.addColorStop(1, '#ffc85a00')
  g.fillStyle = light
  g.fillRect(0, 0, size, size)
}
