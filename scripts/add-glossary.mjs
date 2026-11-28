// Copies the term explanations of the game into the glossary.
//
//   node scripts/add-glossary.mjs
//
// Writes public/data/glossary.json. Needs no Blender.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, get, root } from './encore.mjs'
import { plain } from './profile.mjs'

const AT_ONCE = 6

// The list cuts every explanation short, so each term is read on its own.
const queue = (await get(`${API}term`)).json().termList.map((term) => term.Id)
const total = queue.length
const terms = []
const empty = []

// A failed download stops the script, so the file is never written with terms missing.
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    while (queue.length > 0) {
      const data = (await get(`${API}term/${queue.shift()}`)).json()
      const name = plain(data.TermTitle)
      // "{0}" in a text stands for the first placeholder.
      const text = plain(
        data.TermDesc?.replace(/\{(\d+)\}/g, (all, index) => data.Placeholder?.[index] ?? all),
      )
      if (name && text) terms.push({ id: data.Id, name, text })
      else empty.push(data.Id)
    }
  }),
)

terms.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id)

const file = join(root, 'public', 'data', 'glossary.json')
mkdirSync(join(root, 'public', 'data'), { recursive: true })
writeFileSync(file, JSON.stringify(terms) + '\n')
console.log(`${terms.length} of ${total} terms saved, ${empty.length} without a text`)
