// Copies the regions of https://encore.moe, their areas and the exploration reports of every
// area into the Map room.
//
//   node scripts/add-map.mjs            only the pictures that are not on the site yet
//   node scripts/add-map.mjs --force    every picture again
//
// Writes the list to public/data/map.json (the WorldMap type is in src/lib/map.ts) and the
// pictures to public/art/map/. Needs no Blender.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, get, root } from './encore.mjs'
import { plain } from './profile.mjs'

const AT_ONCE = 6

const force = process.argv.includes('--force')
const folder = join(root, 'public', 'art', 'map')
const failed = []

/** Runs task for every item, a few at the same time, and keeps the order of the results. */
async function each(items, task) {
  const results = []
  const queue = [...items.entries()]
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (queue.length > 0) {
        const [index, item] = queue.shift()
        results[index] = await task(item)
      }
    }),
  )
  return results
}

/** Saves a picture once and returns its path inside public/. It is absent when it fails. */
const saving = new Map()
function picture(url) {
  const name = url?.match(/([\w-]+)\.webp$/)?.[1]
  if (!name) return
  const save = async () => {
    const file = join(folder, `${name}.webp`)
    try {
      if (force || !existsSync(file)) writeFileSync(file, (await get(url)).buffer)
      return `art/map/${name}.webp`
    } catch (error) {
      failed.push(name)
      console.warn(`  ${error.message}`)
    }
  }
  if (!saving.has(name)) saving.set(name, save())
  return saving.get(name)
}

mkdirSync(folder, { recursive: true })
const countries = Object.values((await get(`${API}arearp`)).json())
const regions = []
for (const country of countries.sort((a, b) => b.SortIndex - a.SortIndex)) {
  const areas = await each(
    country.Areas.sort((a, b) => a.SortIndex - b.SortIndex || a.AreaId - b.AreaId),
    async (area) => {
      const detail = (await get(`${API}arearp/${area.AreaId}`)).json()
      const reports = detail.Reports.sort((a, b) => a.Stage - b.Stage)
      return {
        id: area.AreaId,
        name: plain(area.Title),
        // Only the first report of an area names a picture.
        picture: await picture(reports.find((report) => report.PicResource)?.PicResource),
        reports: reports.map((report) => ({
          id: report.Id,
          title: plain(report.StageTitle),
          // The share of the area that the game asks for before it shows the report.
          unlock: report.Unlock,
          text: plain(report.Content),
        })),
      }
    },
  )
  regions.push({
    id: country.Id,
    name: plain(country.Title),
    description: plain(country.Desc),
    icon: await picture(country.Icon),
    logo: await picture(country.Logo),
    areas,
  })
}

mkdirSync(join(root, 'public', 'data'), { recursive: true })
writeFileSync(join(root, 'public', 'data', 'map.json'), JSON.stringify({ regions }) + '\n')

const areas = regions.flatMap((region) => region.areas)
console.log(
  `${regions.length} regions, ${areas.length} areas, ` +
    `${areas.flatMap((area) => area.reports).length} reports, ` +
    `${saving.size - failed.length} pictures`,
)
if (failed.length > 0) {
  console.error(`Missing: ${failed.join(', ')}`)
  process.exit(1)
}
