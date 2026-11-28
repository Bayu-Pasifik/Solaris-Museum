// Copies the phone chats of the game into the Messages page of the Library.
//
//   node scripts/add-chat.mjs            downloads the pictures that are missing
//   node scripts/add-chat.mjs --force    every picture again
//
// Writes the list to public/data/chat.json, the messages of each conversation to
// public/data/chat/<id>.json and the pictures to public/art/chat/. Needs no Blender.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { API, addPicture, get, root } from './encore.mjs'
import { plain } from './profile.mjs'

const AT_ONCE = 6
const force = process.argv.includes('--force')

const save = (path, data) => {
  const file = join(root, 'public', 'data', path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data) + '\n')
}

/** Runs run for every item, a few at a time. A failure stops the script. */
async function each(items, run) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (queue.length > 0) await run(queue.shift())
    }),
  )
}

/** ".../T_ChatEmo_A_01.webp" is kept as art/chat/T_ChatEmo_A_01.webp. */
const pictureName = (url) => url?.match(/([\w-]+)\.webp$/)?.[1]

const pictures = new Map()

/** Notes a picture for the download and returns its name. */
function want(url) {
  const name = pictureName(url)
  if (name) pictures.set(name, url)
  return name
}

/** Some lines hold only their text key, such as "Huanglong_8_1": the API has no text. */
const isKey = (text) => /^[A-Za-z0-9]+(_[A-Za-z0-9]+){2,}$/.test(text)

const textOf = (value) => {
  const text = plain(value)
  return isKey(text) ? '' : text
}

/**
 * One chat of a conversation. A line leads to the next one in the list, unless it or the
 * chosen answer names another line. Both are written as the index of that line.
 */
function thread(lines) {
  const indexOf = new Map(lines.map((line, index) => [line.Id, index]))
  const goTo = (id, index) => indexOf.get(id) ?? index + 1

  return lines.map((line, index) => {
    const speaker = plain(line.Speaker)
    const system = speaker === 'SystemTip'
    const me = line.Speaker?.trim() === '{PlayerName}'
    const sticker = want(line.EmojiIcon)
    const attached = Boolean(line.AttachmentId)
    // Some attachments are animations; their still thumbnail is shown instead.
    const picture = attached
      ? [want(line.AttachmentPath), want(line.AttachmentThumbnail)].filter(Boolean)
      : []
    const text = textOf(line.PlotLineKey)

    const choices = (line.Options ?? []).map((option, number) => {
      const next = goTo(option.JumpToId, index)
      const target = lines[next]
      // An answer without text that sends a sticker or a picture is named after it.
      const sent = target?.EmojiIcon
        ? `Stiker: ${plain(target.EmojiName)}`
        : target?.AttachmentId
          ? 'Kirim gambar'
          : ''
      return { text: textOf(option.PlotLineKey) || sent || `Jawaban ${number + 1}`, next }
    })

    return {
      ...(!system && speaker && { speaker }),
      ...(me && { me }),
      ...(system && { system }),
      ...(!system && { avatar: want(line.HeadIconAsset) }),
      // With a sticker or a picture, the text only describes it.
      text,
      sticker,
      picture,
      // A line without any text key is silent in the game too.
      silent: !line.PlotLineKey && !sticker && !attached,
      ...(choices.length > 0 && { choices }),
      next: goTo(line.JumpToId, index),
    }
  })
}

const contacts = (await get(`${API}phone`)).json()
const conversations = []

await each(contacts, async (contact) => {
  const chats = (await get(`${API}phone/${contact.Id}`)).json()
  const threads = chats
    .map((chat) => thread(chat.Dialogues ?? []))
    .filter((lines) => lines.some((line) => !line.silent))
  if (threads.length > 0) conversations.push({ contact, threads, avatar: want(contact.Icon) })
})
conversations.sort((a, b) => Number(a.contact.Id) - Number(b.contact.Id))

const artOf = (name) => join(root, 'public', 'art', 'chat', `${name}.webp`)
await each(pictures, async ([name, url]) => {
  if (force || !existsSync(artOf(name))) await addPicture('picture', url, `chat/${name}`)
})

/** The path of a picture inside public/, or nothing when the API did not have it. */
const saved = (name) => (name && existsSync(artOf(name)) ? `art/chat/${name}.webp` : undefined)

/** The line as the site reads it, with the pictures that were saved. */
function message({ text, sticker, picture, silent, avatar, ...line }) {
  const image = saved(sticker)
  // An attachment without a picture is a file, which only its text describes.
  const photo = picture.map(saved).find(Boolean)
  return {
    ...line,
    avatar: saved(avatar),
    sticker: image,
    picture: photo,
    ...(text && { text }),
    ...(!silent && !text && !image && !photo && { missing: true }),
  }
}

let missing = 0
const list = conversations.map(({ contact, threads, avatar }) => {
  const id = String(contact.Id)
  const messages = threads.map((lines) => lines.map(message))
  missing += messages.flat().filter((line) => line.missing).length
  save(`chat/${id}.json`, { id, threads: messages })
  const first = messages.flat().find((line) => line.text && !line.system && !line.sticker)
  return {
    id,
    name: plain(contact.Name),
    description: plain(contact.Desc),
    ...(String(contact.IsGroupChat) === 'true' && { members: Number(contact.PeopleNum) }),
    avatar: saved(avatar),
    threads: messages.length,
    preview: first?.text.split('\n')[0] ?? '',
  }
})
save('chat.json', list)

console.log(
  `${list.length} of ${contacts.length} conversations saved, ` +
    `${pictures.size} pictures, ${missing} messages without content`,
)
