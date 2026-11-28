import { assetUrl } from '../lib/characters'
import type { Title } from '../lib/gallery'

/** The layers of a title, as the game stacks them. Without "name" only the plate is drawn. */
export default function TitlePlate({ title, name }: { title: Title; name?: boolean }) {
  return (
    <span className="title-plate">
      {(['background', 'left', 'right', 'avatar'] as const).map((layer) => {
        const path = title[layer]
        return (
          path && (
            <img key={layer} className={layer} src={assetUrl(path)} alt="" loading="lazy" />
          )
        )
      })}
      {name && <span>{title.name}</span>}
    </span>
  )
}
