import { assetUrl } from '../lib/characters'
import { KINDS, type Shelved } from '../lib/documents'
import { useTerms } from '../lib/glossary'
import GameText from './GameText'

/** One document: where it is from, its pictures and its text. */
export default function DocumentReader({ document }: { document: Shelved }) {
  const terms = useTerms()
  const { title, kind, region, place, source, pictures, text } = document
  // A place can have the name of its region.
  const where = [...new Set([KINDS[kind], region, place, source].filter(Boolean))]

  return (
    <section className="card dossier reader" aria-label={`Dokumen ${title}`}>
      <h2>{title}</h2>
      <p className="how">{where.join(' · ')}</p>

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
          <p className="notice">Tidak ada teks pada gambar ini.</p>
        )}
      </div>
    </section>
  )
}
