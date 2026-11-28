import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { KINDS, regionOf, useDocuments, type Shelved } from '../lib/documents'
import { reveal } from '../lib/insets'
import { categoryTheme } from '../lib/stories'
import { unique } from '../components/Chips'
import DocumentReader from '../components/DocumentReader'
import GroupSelect from '../components/GroupSelect'
import RingHall from '../components/RingHall'
import RingStrip from '../components/RingStrip'
import DocumentsScene from '../three/DocumentsScene'

export default function Documents() {
  const { id } = useParams()
  const { state, documents } = useDocuments()
  const [query, setQuery] = useState('')

  const kinds = Object.keys(KINDS).filter((kind) => documents.some((item) => item.kind === kind))
  const current = id
    ? documents.find((item) => String(item.id) === id)
    : documents.find((item) => item.kind === kinds[0])
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
      title="Arsip Dokumen"
      subtitle={current ? `${shelf.length} entri · ${KINDS[current.kind]}` : 'Catatan Solaris'}
      switches={{
        label: 'Jenis',
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
      noun="Dokumen"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Memuat data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Dokumen gagal dimuat ({state.message}). Pastikan file data/documents.json ada.
          </p>
        ) : (
          !current && <p className="notice">Dokumen tidak ditemukan.</p>
        )
      }
      caption={
        current && {
          title: current.title,
          detail: `${regionOf(current)} · ${index + 1} dari ${shelf.length}`,
          action: 'Baca',
        }
      }
      scene={(stage) => (
        <DocumentsScene {...stage} documents={shelf} current={index} theme={theme} />
      )}
      strip={(pick) => (
        <RingStrip
          label="Daftar dokumen"
          search="Cari dokumen"
          base="/documents"
          entries={matches.map((item) => ({
            id: String(item.id),
            title: item.title,
            detail: text
              ? `${KINDS[item.kind]} · ${item.place ?? regionOf(item)}`
              : (item.place ?? item.text.replace(/<\/?s>/g, '')),
            picture: item.picture,
          }))}
          current={current && String(current.id)}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} dari ${documents.length} dokumen`}
          list={text || (current?.kind ?? '')}
          hint="Seret atau gulir untuk menyusuri · klik panel untuk membaca"
        >
          {!text && regions.length > 1 && (
            <GroupSelect
              label="Wilayah"
              groups={regions}
              value={current && regionOf(current)}
              to={(region) => `/documents/${shelf.find((item) => regionOf(item) === region)!.id}`}
            />
          )}
        </RingStrip>
      )}
      report={current && <DocumentReader document={current} />}
      reportLabel="Isi dokumen"
    />
  )
}
