import { useJson } from './characters'

/** One entry of public/data/chat.json, written by scripts/add-chat.mjs. */
export type Contact = {
  id: string
  name: string
  /** The status line of the contact. Many have none. */
  description: string
  /** Number of people. Only group chats have it. */
  members?: number
  /** Path inside public/, like every picture here. */
  avatar?: string
  threads: number
  preview: string
}

/** An answer that the player can give, and the index of the message that it leads to. */
export type Reply = { text: string; next: number }

export type Message = {
  speaker?: string
  /** Sent by the player. */
  me?: boolean
  /** A notice of the app instead of a message. */
  system?: boolean
  avatar?: string
  /** For a sticker or a picture, this only describes it. */
  text?: string
  sticker?: string
  picture?: string
  /** The source has neither the text nor the picture of this message. */
  missing?: boolean
  choices?: Reply[]
  /** Index of the message that follows when there are no choices. */
  next: number
}

/** The file public/data/chat/<id>.json. */
export type Conversation = { id: string; threads: Message[][] }

export const useContacts = () => useJson<Contact[]>('data/chat.json', Array.isArray)

export const isConversation = (data: Conversation) => Array.isArray(data.threads)

/**
 * The messages to show after the answers given so far (the choice number by message index),
 * up to the first question without an answer.
 */
export function play(thread: Message[], answers: Record<number, number>) {
  const shown: { message: Message; index: number; reply?: string }[] = []
  let index = 0
  // A jump always goes down the list, which also rules out a loop.
  while (index < thread.length) {
    const message = thread[index]
    if (!message.choices) {
      shown.push({ message, index })
      index = Math.max(message.next, index + 1)
      continue
    }
    const reply = message.choices[answers[index]]
    if (!reply) {
      shown.push({ message, index })
      return { shown, question: { index, choices: message.choices } }
    }
    // Mostly the answer leads to the message of the player that says it. Otherwise it is
    // shown on its own.
    shown.push({ message, index, reply: thread[reply.next]?.me ? undefined : reply.text })
    index = Math.max(reply.next, index + 1)
  }
  return { shown, question: undefined }
}
