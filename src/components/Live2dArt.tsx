import { useEffect, useRef, useState } from 'react'
import { SpinePlayer } from '@esotericsoftware/spine-player'
import '@esotericsoftware/spine-player/dist/spine-player.css'
import { assetUrl, type Live2d } from '../lib/characters'

/** The animated splash art. Render it with the character id as key. */
export default function Live2dArt({ art, label }: { art: Live2d; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    if (!host.current) return
    // The player fills the element it gets, so each run gets a new one.
    const box = host.current.appendChild(document.createElement('div'))
    const player = new SpinePlayer(box, {
      binaryUrl: assetUrl(art.skeleton),
      atlasUrl: assetUrl(art.atlas),
      alpha: true,
      backgroundColor: '#00000000',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      showControls: false,
      showLoading: false,
      // The picture is wide, so it gets the whole stage.
      viewport: { padLeft: '0%', padRight: '0%', padTop: '0%', padBottom: '0%' },
      success: () => setState('ready'),
      error: (_, message) => {
        console.error(message)
        setState('failed')
      },
    })
    // The pictures are stored without premultiplied alpha, and the screen and multiply layers
    // of the art then show their transparent pixels as white blocks. The GPU is asked to
    // premultiply them when the pictures arrive, which is after this line.
    const gl = player.context?.gl
    gl?.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

    return () => {
      const canvas = box.querySelector('canvas')
      player.dispose()
      // Browsers allow only a few WebGL contexts, so this one is given back at once.
      canvas?.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
      box.remove()
    }
  }, [art])

  return (
    <div className="live2d" role="img" aria-label={label} data-state={state}>
      <div ref={host} />
      {state === 'loading' && <p className="notice">Memuat L2D…</p>}
      {state === 'failed' && (
        <p className="notice" role="alert">
          L2D gagal dimuat.
        </p>
      )}
    </div>
  )
}
