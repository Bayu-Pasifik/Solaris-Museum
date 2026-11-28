import { assetUrl } from '../lib/characters'

/** A round face picture, or the first letter of the name when there is none. */
export default function Avatar({ name, path }: { name?: string; path?: string }) {
  return (
    <i className="avatar" aria-hidden="true">
      {path ? <img src={assetUrl(path)} alt="" loading="lazy" /> : name?.charAt(0)}
    </i>
  )
}
