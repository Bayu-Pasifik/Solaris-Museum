// Copies the story archive of https://encore.moe/story into the Library.
//
//   node scripts/add-story.mjs            only the stories that are not on the site yet
//   node scripts/add-story.mjs --force    every story again
//
// Writes the list to public/data/story.json, the text of each story to
// public/data/story/<id>.json and the pictures to public/art/story/. Needs no Blender.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { API, addAll, addPicture, get, root } from './encore.mjs'
import { plain } from './profile.mjs'

const AT_ONCE = 6

const save = (path, data) => {
  const file = join(root, 'public', 'data', path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(data) + '\n')
}

/** ".../T_StoryPhoto_M0215.webp" is kept as art/story/T_StoryPhoto_M0215.webp. */
const pictureName = (url) => url?.match(/([\w-]+)\.webp$/)?.[1]

/** Game text without the counters and names that only the running game can fill in. */
const clean = (text) =>
  plain(text)
    .replace(/\s*[(（]?\{q_count\}\/\d+[)）]?/g, '')
    .replace(/\{Cus:Var,[^{}]*main_team_name\}/g, 'Your team')

/** The game leaves placeholders such as "Speaker_83" for lines without a name. */
const speakerOf = (name) => {
  const text = clean(name).replace(/^\{message\}\s*/, '')
  return /^Speaker_(\d+|undefined)$/.test(text) ? '' : text
}

/** Some lines hold only their text key, such as "Flow_135000000_13". */
const textOf = (value) => {
  const text = clean(value)
  return /^[A-Za-z0-9]+(_[A-Za-z0-9]+){2,}$/.test(text) ? '' : text
}

function line(speaker, text, options, note) {
  const choices = (options ?? [])
    .map((option) => textOf(option.PlotLineKey ?? option.Text))
    .filter(Boolean)
  return {
    ...(speakerOf(speaker) && { speaker: speakerOf(speaker) }),
    text: textOf(text),
    ...(choices.length > 0 && { choices }),
    ...(note && { note: true }),
  }
}

const spoken = (item) => item.text || item.choices

/** Quests: a list in which a title starts a section and the dialogues after it fill it. */
function fromChapters(chapters) {
  const sections = []
  for (const chapter of chapters) {
    if (chapter.Title) sections.push({ title: clean(chapter.Title), lines: [] })
    if (!chapter.Dialogues) continue
    if (sections.length === 0) sections.push({ lines: [] })
    sections.at(-1).lines.push(
      ...chapter.Dialogues.map((item) =>
        // "Outline", "VideoCaption" and "CenterText" are text on screen, not speech.
        line(item.Speaker, item.PlotLineKey, item.Options, Boolean(item.Type)),
      ).filter(spoken),
    )
  }
  return sections
}

/** The roguelike mode has its own two lists: story talks and events. */
const fromRogue = (data) => [
  ...(data.Stories ?? []).map((story) => ({
    title: clean(story.Title),
    lines: story.Items.map((item) => line(item.Speaker, item.Text, item.Options)).filter(spoken),
  })),
  ...(data.Events ?? []).map((event) => ({
    title: clean(event.Title),
    lines: event.Blocks.flat()
      .map((item) => line(item.Speaker, item.Text, [], item.Kind !== 'Line'))
      .filter(spoken),
  })),
]

/** The stories of the API, flat, in the order of the site. */
async function listStories() {
  const { storyTypes } = (await get(`${API}story`)).json()
  return storyTypes.flatMap((type) =>
    type.Stories.flatMap((group) =>
      group.Stories.map((item) => {
        // Side and event quests have no QuestDesc; their "Descrtption" is the summary.
        const summary = clean(item.QuestDesc || (item.Type ? item.Descrtption : ''))
        const subtitle = clean(item.Descrtption)
        return {
          id: String(item.Id),
          // One category has its number as its name.
          category: type.TypeDescription === type.TypeId ? group.Group : type.TypeDescription,
          group: clean(group.Group),
          name: clean(item.Name),
          subtitle: subtitle === summary ? '' : subtitle,
          summary,
          pictureUrl: item.MaleTexture,
        }
      }),
    ),
  )
}

const force = process.argv.includes('--force')
// A few event quests are also listed as side quests; the later entry wins.
const stories = [...new Map((await listStories()).map((story) => [story.id, story])).values()]
const ids = stories.map((story) => story.id)

const pictures = new Map(
  stories.map((story) => [pictureName(story.pictureUrl), story.pictureUrl]),
)
pictures.delete(undefined)
for (const [name, url] of pictures) {
  if (force || !existsSync(join(root, 'public', 'art', 'story', `${name}.webp`))) {
    await addPicture('picture', url, `story/${name}`)
  }
}

async function add(id) {
  const file = `story/${id}.json`
  if (!force && existsSync(join(root, 'public', 'data', file))) return
  const data = (await get(`${API}story/${id}`)).json()
  const sections = data.Chapters ? fromChapters(data.Chapters) : fromRogue(data)
  save(file, { id, sections: sections.filter((item) => item.title || item.lines.length > 0) })
  console.log(`${id} ${data.Name}`)
}

// The list is written first, so a failed story can be added by running the script again.
save(
  'story.json',
  stories.map(({ pictureUrl, ...story }) => {
    const name = pictureName(pictureUrl)
    const saved = name && existsSync(join(root, 'public', 'art', 'story', `${name}.webp`))
    return { ...story, ...(saved && { picture: `art/story/${name}.webp` }) }
  }),
)

const queue = [...ids]
const failed = []
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    while (queue.length > 0) {
      const id = queue.shift()
      try {
        await add(id)
      } catch (error) {
        failed.push(id)
        console.error(`  ${id}: ${error.message}`)
      }
    }
  }),
)
console.log(`\n${stories.length} stories, ${pictures.size} pictures`)
// A second try, one at a time; it reports what still fails.
if (failed.length > 0) await addAll(failed, add)
