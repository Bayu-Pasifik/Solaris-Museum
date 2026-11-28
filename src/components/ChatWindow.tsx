import { useEffect, useRef, useState } from 'react'
import { assetUrl, useJson } from '../lib/characters'
import { isConversation, play, type Contact, type Conversation, type Message } from '../lib/chats'
import Avatar from './Avatar'
import { Struck } from './GameText'

function Bubble({ message, group }: { message: Message; group: boolean }) {
  const { speaker, me, system, avatar, text, sticker, picture, missing } = message

  if (!text && !sticker && !picture && !missing) return null
  if (system) {
    return (
      <li className="system" lang={text ? 'en' : undefined}>
        {text ?? 'Message unavailable'}
      </li>
    )
  }

  return (
    <li className={me ? 'bubble mine' : 'bubble'}>
      <Avatar name={speaker} path={avatar} />
      <div>
        {/* In a private chat the name stands above the window already. */}
        <b className={group && !me ? undefined : 'hidden-name'} lang="en">
          {speaker}
        </b>
        {sticker ? (
          <img
            className="sticker"
            src={assetUrl(sticker)}
            alt={text ?? 'Sticker'}
            lang={text ? 'en' : undefined}
          />
        ) : picture ? (
          <a href={assetUrl(picture)} target="_blank" rel="noreferrer">
            <img
              className="photo"
              src={assetUrl(picture)}
              alt={text ?? 'Photo'}
              lang={text ? 'en' : undefined}
            />
          </a>
        ) : (
          <p className={missing ? 'gone' : undefined} lang={missing ? undefined : 'en'}>
            {missing ? 'Message unavailable' : <Struck>{text ?? ''}</Struck>}
          </p>
        )}
      </div>
    </li>
  )
}

/** One chat, shown up to the next answer that the visitor has to give. */
function Thread({ thread, group }: { thread: Message[]; group: boolean }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const log = useRef<HTMLDivElement>(null)
  const { shown, question } = play(thread, answers)
  const answered = Object.keys(answers).length

  // A new chat starts at its top; after an answer the new messages come into view.
  useEffect(() => {
    const box = log.current
    if (!box || answered === 0) return
    const mine = box.querySelectorAll('.bubble.mine')
    const last = mine[mine.length - 1]
    if (!last) return
    const top = last.getBoundingClientRect().top - box.getBoundingClientRect().top
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollBy({ top: top - 60, behavior: calm ? 'auto' : 'smooth' })
  }, [answered])

  return (
    <>
      <div className="log" ref={log} tabIndex={0} role="log" aria-label="Chat messages">
        <ol>
          {shown.map(({ message, index, reply }) => (
            <li key={index} className="turn-of">
              <ol>
                <Bubble message={message} group={group} />
                {reply && (
                  <Bubble message={{ speaker: 'Rover', me: true, text: reply, next: 0 }} group={group} />
                )}
              </ol>
            </li>
          ))}
        </ol>
      </div>

      <div className="replies">
        {question ? (
          question.choices.map((choice, number) => (
            <button
              key={`${question.index} ${number}`}
              type="button"
              className="pill"
              lang="en"
              onClick={() => setAnswers({ ...answers, [question.index]: number })}
            >
              {choice.text}
            </button>
          ))
        ) : (
          <p>End of chat.</p>
        )}
        {answered > 0 && (
          <button type="button" className="pill again" onClick={() => setAnswers({})}>
            ↺ Replay
          </button>
        )}
      </div>
    </>
  )
}

function Threads({ id, group }: { id: string; group: boolean }) {
  const state = useJson<Conversation>(`data/chat/${id}.json`, isConversation)
  const [open, setOpen] = useState(0)

  if (state.status === 'loading') return <p className="notice">Loading chat…</p>
  if (state.status === 'error') {
    return (
      <p className="notice" role="alert">
        This chat is not available yet.
      </p>
    )
  }
  const { threads } = state.data

  return (
    <>
      {threads.length > 1 && (
        <nav className="turn" aria-label="Switch chat">
          <button type="button" className="pill" disabled={open === 0} onClick={() => setOpen(open - 1)}>
            ←<span className="long"> Previous</span>
          </button>
          <label>
            Chat{' '}
            <select value={open} onChange={(event) => setOpen(Number(event.target.value))}>
              {threads.map((_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                </option>
              ))}
            </select>{' '}
            of {threads.length}
          </label>
          <button
            type="button"
            className="pill"
            aria-label="Next chat"
            disabled={open === threads.length - 1}
            onClick={() => setOpen(open + 1)}
          >
            <span className="long">Next </span>→
          </button>
        </nav>
      )}
      <Thread key={open} thread={threads[open]} group={group} />
    </>
  )
}

/** The phone with one conversation. Render it with the contact id as key. */
export default function ChatWindow({ contact }: { contact: Contact }) {
  const group = contact.members !== undefined

  return (
    <section className="card phone" aria-label={`Chat with ${contact.name}`}>
      <header>
        <Avatar name={contact.name} path={contact.avatar} />
        <div>
          <h2 lang="en">{contact.name}</h2>
          <p lang={group ? undefined : 'en'}>
            {group ? `Group · ${contact.members} people` : contact.description}
          </p>
        </div>
      </header>
      <Threads id={contact.id} group={group} />
    </section>
  )
}
