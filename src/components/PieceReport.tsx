import { assetUrl } from '../lib/characters'
import { matches, type Choosable } from '../lib/exhibits'
import TitlePlate from './TitlePlate'

type Props = {
  piece: Choosable
  /** What is searched for, in lower case. A group then shows only what has it. */
  text: string
}

/** The drawer of the Gallery: the chosen piece up close. */
export default function PieceReport({ piece, text }: Props) {
  if (piece.kind === 'card') {
    const picture = piece.card.picture && assetUrl(piece.card.picture)
    return (
      <div className="report">
        {picture && <img className="view card-view" src={picture} alt="" />}
        <h2>{piece.card.name}</h2>
        <small>Namecard</small>
        {picture && (
          <p>
            <a className="button" href={picture} target="_blank" rel="noreferrer">
              Buka ukuran penuh
            </a>
          </p>
        )}
      </div>
    )
  }

  if (piece.kind === 'title') {
    return (
      <div className="report">
        <div className="plate-view">
          <TitlePlate title={piece.title} name />
        </div>
        <h2>{piece.title.name}</h2>
        <small>Title</small>
      </div>
    )
  }

  const { group, category } = piece
  // A group that is found by its name keeps its whole list.
  const filtered = text !== '' && !group.name.toLowerCase().includes(text)
  const list = filtered ? matches(group, text) : group.achievements
  return (
    <div className="report">
      <header className="group-head">
        {group.icon && <img src={assetUrl(group.icon)} alt="" />}
        <div>
          <h2>{group.name}</h2>
          <small>
            {category.name} ·{' '}
            {filtered
              ? `${list.length} dari ${group.achievements.length} achievement`
              : `${group.achievements.length} achievement`}
          </small>
        </div>
      </header>
      <ul className="feats">
        {list.map((item) => (
          <li key={item.id}>
            <h3>
              {item.name}
              <span role="img" aria-label={`Tingkat ${item.level}`}>
                {'★'.repeat(item.level)}
              </span>
              {item.hidden && <small>Tersembunyi</small>}
            </h3>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
