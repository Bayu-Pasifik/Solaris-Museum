import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useContacts, type Contact } from '../lib/chats'
import type { ElementTheme } from '../lib/elements'
import { useTitle } from '../lib/title'
import Avatar from '../components/Avatar'
import ChatWindow from '../components/ChatWindow'
import RingHall from '../components/RingHall'
import RingStrip from '../components/RingStrip'
import MessagesScene from '../three/MessagesScene'

type Kind = {
  id: 'all' | 'private' | 'group'
  label: string
  theme: ElementTheme
  has: (contact: Contact) => boolean
}

const KINDS: Kind[] = [
  {
    id: 'all',
    label: 'All',
    theme: { deep: '#4a47b8', pale: '#e6e5ff', accent: '#8f8df7' },
    has: () => true,
  },
  {
    id: 'private',
    label: 'Private',
    theme: { deep: '#a82a68', pale: '#ffe0ee', accent: '#ff5fa8' },
    has: (contact) => contact.members === undefined,
  },
  {
    id: 'group',
    label: 'Group',
    theme: { deep: '#1c7a4c', pale: '#dcf8e6', accent: '#45d38a' },
    has: (contact) => contact.members !== undefined,
  },
]

const NONE: Contact[] = []

export default function Messages() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useContacts()
  const [query, setQuery] = useState('')
  const [chosen, setKind] = useState(KINDS[0])

  const contacts = state.status === 'ready' ? state.data : NONE
  const current = id ? contacts.find((contact) => contact.id === id) : contacts[0]
  useTitle((id && current?.name) || 'Messages')
  // A link or a search can open a contact of another kind; then all of them are in the ring.
  const kind = current && !chosen.has(current) ? KINDS[0] : chosen
  const shelf = contacts.filter(kind.has)
  const index = shelf.findIndex((contact) => contact.id === current?.id)

  const text = query.trim().toLowerCase()
  const matches = text
    ? contacts.filter((contact) => contact.name.toLowerCase().includes(text))
    : shelf

  return (
    <RingHall
      name="signal-hall"
      theme={kind.theme}
      base="/messages"
      back={{ to: '/', label: 'Lobby' }}
      title="Messages"
      subtitle="Phone chats from Solaris"
      switches={{
        label: 'Chat type',
        children: KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="pill"
            aria-pressed={item.id === kind.id}
            onClick={() => {
              setKind(item)
              setQuery('')
              const first = contacts.find(item.has)
              if (first) navigate(`/messages/${first.id}`, { replace: true })
            }}
          >
            {item.label}
          </button>
        )),
      }}
      ids={shelf.map((contact) => contact.id)}
      current={current?.id}
      noun="Contact"
      notice={
        state.status === 'loading' ? (
          <p className="notice">Loading data…</p>
        ) : state.status === 'error' ? (
          <p className="notice" role="alert">
            Could not load message data ({state.message}). Check that data/chat.json exists.
          </p>
        ) : (
          !current && <p className="notice">Conversation not found.</p>
        )
      }
      caption={
        current && {
          title: current.name,
          detail: `${current.members ? `Group · ${current.members} people` : 'Private chat'} · ${index + 1} of ${shelf.length}`,
          action: 'Open chat',
        }
      }
      scene={(stage) => (
        <MessagesScene
          {...stage}
          contacts={shelf}
          current={index}
          kind={kind.id}
          theme={kind.theme}
        />
      )}
      strip={(pick) => (
        <RingStrip
          label="Contact list"
          search="Search contacts"
          base="/messages"
          entries={matches.map((contact) => ({
            id: contact.id,
            title: contact.name,
            detail: contact.preview ? (
              <bdi lang="en">{contact.preview}</bdi>
            ) : (
              'Message unavailable'
            ),
            lead: <Avatar name={contact.name} path={contact.avatar} />,
          }))}
          current={current?.id}
          query={query}
          onQuery={setQuery}
          onPick={pick}
          count={`${matches.length} of ${contacts.length} conversations`}
          list={text || kind.id}
          hint="Drag or scroll to browse · click a panel to open the chat"
        />
      )}
      report={current && <ChatWindow contact={current} />}
      reportLabel="Chat"
    />
  )
}
