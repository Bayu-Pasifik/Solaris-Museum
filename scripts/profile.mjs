// Turns the encore.moe data of one character into the profile that the hall shows.

/**
 * Game text to plain text. Line breaks become "\n", sub-headings become lines that start
 * with "# ", and only <s>strikethrough</s> stays as markup, because it carries meaning.
 */
export function plain(text) {
  if (typeof text !== 'string') return ''
  // "<SapTag=B>1</SapTag> {Cus:Sap,S=stack P=stacks SapTag=B}" picks the word by the number.
  const counts = Object.fromEntries(
    [...text.matchAll(/<SapTag=(\w+)>([^<]*)<\/SapTag>/g)].map(([, tag, count]) => [tag, count]),
  )
  return (
    text
      .replace(/\{Cus:Sap,S=(.*?) P=(.*?) SapTag=(\w+)\}/g, (_, one, many, tag) =>
        counts[tag] === '1' ? one : many,
      )
      // The game words some actions per device; the site shows the PC wording.
      .replace(/\{Cus:Ipt,[^{}]*?PC=([^\s{}]+)[^{}]*\}/g, '$1')
      .replace(/\{Male=([^;{}]*);Female=([^{}]*)\}/g, '$1/$2')
      .replaceAll('{PlayerName}', 'Rover')
      .replace(
        /<(?:span class="font-bold font-whitney text-3xl[^>]*|color=Title)>(.*?)<\/span>(?:<\/span>)?/g,
        '\n# $1\n',
      )
      .replace(/<br\s*\/?>/g, '\n')
      // Only known tags, so that text such as "< 100%" survives.
      .replace(/<\/?(?:te|span|size|color|i|b|ano|SapTag)\b[^>]*>/g, '')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** A field of the API, which is a string or { Content }. "Unknown" counts as empty. */
function field(value) {
  const text = plain(value?.Content ?? value)
  return text === 'Unknown' ? '' : text
}

/** Our language codes, with the suffixes of the voice URL and of the voice actor name. */
const LANGUAGES = [
  ['ja', 'Ja', 'Jp'],
  ['en', 'En', 'En'],
  ['zh', 'Zh', 'Cn'],
  ['ko', 'Ko', 'Ko'],
]

const bySort = (a, b) => a.Sort - b.Sort

/** The API gives some pictures as a URL and others as a game path ("/Game/…"). */
function pictureUrl(path) {
  if (path?.startsWith('http')) return path
  return path?.startsWith('/Game/') ? `https://api-v2.encore.moe/resource/Data${path}` : ''
}

export function buildProfile(data) {
  const favor = data.favorRole ?? {}

  // Some characters list the same skill twice.
  const skills = new Map()
  for (const skill of data.Skills ?? []) {
    skills.set(`${skill.SkillType}|${skill.SkillName}`, {
      type: skill.SkillType,
      name: plain(skill.SkillName),
      description: plain(skill.SkillDescribe),
      icon: skill.Icon?.startsWith('http') ? skill.Icon : '',
    })
  }

  return {
    // NickName holds placeholders for the newer characters; TalentName is filled in for them.
    nickname: field(favor.TalentName),
    introduction: field(data.Introduction),
    birthday: field(favor.Birthday),
    country: field(favor.Country),
    faction: field(favor.Influence),
    voiceActors: Object.fromEntries(
      LANGUAGES.map(([language, , suffix]) => [language, field(favor[`CVName${suffix}`])]).filter(
        ([, name]) => name,
      ),
    ),
    stories: [...(data.Stories ?? [])]
      .sort(bySort)
      .map((story) => ({ title: plain(story.Title), text: plain(story.Content) })),
    voices: [...(data.Words ?? [])].sort(bySort).map((word) => ({
      id: word.Id,
      // Type 1 is talk in the menu; type 2 is spoken while playing.
      combat: word.Type === 2,
      title: plain(word.Title),
      text: plain(word.Content),
      audio: Object.fromEntries(
        LANGUAGES.map(([language, suffix]) => [language, word[`Voice${suffix}`]]).filter(
          ([, url]) => url,
        ),
      ),
    })),
    skills: [...skills.values()],
    chain: [...(data.ResonantChain ?? [])]
      .sort((a, b) => a.GroupIndex - b.GroupIndex)
      .map((node) => ({
        name: plain(node.NodeName),
        description: plain(node.AttributesDescription),
        icon: pictureUrl(node.NodeIcon),
      })),
    keepsakes: [...(data.Goods ?? [])].sort(bySort).map((item) => ({
      name: plain(item.Title),
      text: plain(item.Content),
      picture: pictureUrl(item.Pic),
    })),
  }
}

/** True only when the server says that the file does not exist. */
async function isGone(url) {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-1' } })
    await response.arrayBuffer()
    return response.status === 404
  } catch {
    return false
  }
}

/**
 * The API lists audio files that its server does not have, mostly for new characters.
 * Three lines are tried first; only when one of them is missing, every file is checked.
 * Returns the number of links removed.
 */
export async function dropMissingAudio(voices) {
  const links = voices.flatMap((voice) =>
    Object.keys(voice.audio).map((language) => ({ voice, language })),
  )
  const gone = ({ voice, language }) => isGone(voice.audio[language])
  const sample = [voices[0], voices[voices.length >> 1], voices.at(-1)]
  const probes = links.filter((link) => sample.includes(link.voice))
  if (!(await Promise.all(probes.map(gone))).includes(true)) return 0

  let removed = 0
  for (let start = 0; start < links.length; start += 8) {
    await Promise.all(
      links.slice(start, start + 8).map(async (link) => {
        if (!(await gone(link))) return
        delete link.voice.audio[link.language]
        removed += 1
      }),
    )
  }
  return removed
}
