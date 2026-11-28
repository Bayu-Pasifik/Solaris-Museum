import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useContacts, type Contact } from '../lib/chats'
import type { SakugaInput } from '../lib/sakuga'
import Avatar from '../components/Avatar'
import ChatWindow from '../components/ChatWindow'
import Disclaimer from '../components/Disclaimer'

function ContactList({ contacts, current }: { contacts: Contact[]; current?: Contact }) {
  const [query, setQuery] = useState('')

  const search = useCallback((element: SakugaInput | null) => {
    if (!element) return
    const onInput = () => setQuery(element.value)
    element.addEventListener('input', onInput)
    return () => element.removeEventListener('input', onInput)
  }, [])

  const text = query.trim().toLowerCase()
  const matches = contacts.filter((contact) => contact.name.toLowerCase().includes(text))

  return (
    <aside className="card roster contacts">
      <sakuga-input type="search" placeholder="Cari kontak" label="Cari kontak" ref={search} />
      <p className="count" role="status">
        {matches.length} dari {contacts.length} percakapan
      </p>
      <ul>
        {matches.map((contact) => (
          <li key={contact.id}>
            <Link
              to={`/messages/${contact.id}`}
              aria-current={contact.id === current?.id ? 'page' : undefined}
            >
              <Avatar name={contact.name} path={contact.avatar} />
              <span>
                <b>{contact.name}</b>
                <span>{contact.preview || 'Pesan tidak tersedia'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {matches.length === 0 && <p>Tidak ditemukan.</p>}
    </aside>
  )
}

export default function Messages() {
  const { id } = useParams()
  const state = useContacts()
  const contacts = state.status === 'ready' ? state.data : []
  const current = id ? contacts.find((contact) => contact.id === id) : contacts[0]

  // On a narrow screen the list and a chat are separate pages, so each starts at its top.
  useEffect(() => {
    if (matchMedia('(max-width: 760px)').matches) scrollTo(0, 0)
  }, [id])

  return (
    <div className={id ? 'wrap messages picked' : 'wrap messages'}>
      <header>
        <h1>Pesan</h1>
        <p className="lede">Obrolan ponsel dari Solaris. Pilih jawaban untuk melanjutkan.</p>
        <p className="links">
          <Link to="/library" className="pill">
            ← Perpustakaan
          </Link>
        </p>
      </header>

      <main>
        {state.status === 'loading' && <p className="notice">Memuat data…</p>}
        {state.status === 'error' && (
          <p className="notice" role="alert">
            Data pesan gagal dimuat ({state.message}). Pastikan file data/chat.json ada.
          </p>
        )}
        {state.status === 'ready' && (
          <div className="hall">
            <ContactList contacts={contacts} current={current} />
            {current ? (
              <ChatWindow key={current.id} contact={current} />
            ) : (
              <p className="notice">Percakapan tidak ditemukan.</p>
            )}
          </div>
        )}
      </main>

      <Disclaimer />
    </div>
  )
}
