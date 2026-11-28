import { useMemo } from 'react'
import type { Stage } from '../components/RingHall'
import type { Contact } from '../lib/chats'
import type { ElementTheme } from '../lib/elements'
import { drawContact } from './contactFace'
import RingStage from './RingStage'
import Rooftop from './Rooftop'

type Props = Stage & {
  /** The contacts of the open kind, in order. */
  contacts: Contact[]
  /** Index of the chosen contact. */
  current: number
  kind: string
  theme: ElementTheme
}

/** The rooftop with a ring of contact panels around the chosen one. */
export default function MessagesScene({ contacts, current, kind, theme, ...stage }: Props) {
  // The panel takes its picture from "picture".
  const items = useMemo(
    () => contacts.map((contact) => ({ ...contact, picture: contact.avatar })),
    [contacts],
  )

  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[-3, 6, 5]} intensity={1.6} />
      <Rooftop accent={theme.accent} />
      <RingStage
        {...stage}
        items={items}
        current={current}
        theme={theme}
        paint={drawContact}
        group={kind}
      />
    </>
  )
}
