import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { KINDS, NO_REGION, regionOf, useDocuments, type Shelved } from '../lib/documents'
import { reveal } from '../lib/insets'
import { categoryTheme } from '../lib/stories'
import { useTitle } from '../lib/title'
import { unique } from '../components/Chips'
import DocumentReader from '../components/DocumentReader'
import GroupSelect from '../components/GroupSelect'
import RingHall from '../components/RingHall'
import RingStrip from '../components/RingStrip'
import DocumentsScene from '../three/DocumentsScene'

/** A place from the game, or the words of the museum when none is recorded. */
function Where({ name }: { name?: string }) {
  return name ? <bdi lang="en">{name}</bdi> : NO_REGION
}

export default function Documents() {
  const { id } = useParams()
  const { state, documents } = useDocuments()
  const [query, setQuery] = useState('')

  const kinds = Object.keys(KINDS).filter((kind) => documents.some((item) => item.kind === kind))
  const current = id
    ? documents.find((item) => String(item.id) === id)
    : documents.find((item) => item.kind === kinds[0])
  useTitle((id && current?.title) || 'Documents')
  const shelf = documents.filter((item) => item.kind === current?.kind)
  const index = shelf.findIndex((item) => item.id === current?.id)
  const theme = categoryTheme(kinds, current?.kind ?? '')
  const regions = unique(shelf.map(regionOf))

  const text = query.trim().toLowerCase()
  const titled = (item: Shelved) => item.title.toLowerCase().includes(text)
  // A search looks through every shelf. A match in the title comes before one in the text.
  const matches = text
    ? [
        ...documents.filter(titled),
        ...documents.filter((item) => !titled(item) && item.text.toLowerCase().includes(text)),
      ]
    : shelf

  return (
    <RingHall
      name="paper-hall"
      theme={theme}
      base="/documents"
      back={{ to: '/', label: 'Lobby' }}
      title="Document Archive"
      subtitle={current ? `${shelf.length} ${shelf.length === 1 ? 'entry' : 'entries'} · ${KINDS[current.kind]}` : 'Records of Solaris'}
      switches={{
        label: 'Type',
        children: kinds.map((kind) => {
          const first = documents.find((item) => item.kind === kind)!
          const chosen = kind === current?.kind
          return (
            <Link
              key={kind}
              to={`/documents/${first.id}`}
              className="pill"
              aria-current={chosen ? 'page' : undefined}
              ref={chosen ? reveal : undefined}
              onClick={() => setQuery('')}
            >
              {KINDS[first.kind]}
            </Link>
          )
        }),
      }}
      ids={shelf.map((item) => String(item.id))}
      current={current && String(current.id)}
      noun="Document"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Loading data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Could not load documents ({state.message}). Check that data/documents.json exists.
          </p>
        ) : (
          !current && <p className="notice">Document not found.</p>
        )
      }
      caption={
        current && {
          title: current.title,
          detail: (
            <>
              <Where name={current.region} /> · {index + 1} of {shelf.length}
            </>
          ),
          action: 'Read',
        }
      }
      scene={(stage) => (
        <DocumentsScene {...stage} documents={shelf} current={index} theme={theme} />
      )}
      strip={(pick) => (
        <RingStrip
          label="Document list"
          search="Search documents"
          base="/documents"
          entries={matches.map((item) => ({
            id: String(item.id),
            title: item.title,
            detail: text ? (
              <>
                {KINDS[item.kind]} · <Where name={item.place ?? item.region} />
              </>
            ) : (
              <bdi lang="en">{item.place ?? item.text.replace(/<\/?s>/g, '')}</bdi>
            ),
            picture: item.picture,
          }))}
          current={current && String(current.id)}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} of ${documents.length} documents`}
          list={text || (current?.kind ?? '')}
          hint="Drag or scroll to browse · click a panel to read"
        >
          {!text && regions.length > 1 && (
            <GroupSelect
              label="Region"
              own={NO_REGION}
              groups={regions}
              value={current && regionOf(current)}
              to={(region) => `/documents/${shelf.find((item) => regionOf(item) === region)!.id}`}
            />
          )}
        </RingStrip>
      )}
      report={current && <DocumentReader document={current} />}
      reportLabel="Document text"
    />
  )
}
