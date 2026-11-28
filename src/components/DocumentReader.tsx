import { assetUrl } from '../lib/characters'
import { KINDS, type Shelved } from '../lib/documents'
import { useTerms } from '../lib/glossary'
import GameText from './GameText'
import Marks from './Marks'

/** One document: where it is from, its pictures and its text. */
export default function DocumentReader({ document }: { document: Shelved }) {
  const terms = useTerms()
  const { title, kind, region, place, source, pictures, text } = document
  // A place can have the name of its region.
  const where = [...new Set([region, place, source].filter(Boolean))].join(' · ')

  return (
    <section className="card dossier reader" aria-label={`Document ${title}`}>
      <h2 lang="en">{title}</h2>
      <p className="how">
        {KINDS[kind]}
        {where && (
          <>
            {' · '}
            <bdi lang="en">{where}</bdi>
          </>
        )}
      </p>
      <Marks path={`/documents/${document.id}`} readable />

      <div className="panel">
        {pictures?.map((picture) => (
          <img
            key={picture}
            src={assetUrl(picture)}
            alt=""
            onError={(event) => (event.currentTarget.hidden = true)}
          />
        ))}
        {text ? (
          <GameText text={terms.link(text, new Set())} terms={terms.byId} />
        ) : (
          <p className="notice">This picture has no text.</p>
        )}
      </div>
    </section>
  )
}
