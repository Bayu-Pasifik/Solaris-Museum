import { Fragment } from 'react'
import type { Term } from '../lib/glossary'
import TermTip from './TermTip'

/** The terms that <t=id> marks of a text refer to, by id. */
type Terms = Map<number, Term>

/** Shows <t=id>…</t> parts, written by the glossary linker, with their explanation. */
function Marked({ text, terms }: { text: string; terms?: Terms }) {
  // The split gives, in turn: plain text, the id of a term and the word.
  const parts = text.split(/<t=(\d+)>(.*?)<\/t>/)
  return parts.map((part, index) => {
    if (index % 3 === 1) return null
    const term = index % 3 === 2 ? terms?.get(Number(parts[index - 1])) : undefined
    return term ? (
      <TermTip key={index} term={term} word={part} />
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  })
}

/** Shows <s>…</s> parts as strikethrough. All other markup of the game is already removed. */
export function Struck({ children, terms }: { children: string; terms?: Terms }) {
  // The odd parts are the ones that were inside <s>.
  return children.split(/<s>(.*?)<\/s>/).map((part, index) => {
    const content = <Marked text={part} terms={terms} />
    return index % 2 ? <s key={index}>{content}</s> : <Fragment key={index}>{content}</Fragment>
  })
}

/** Long text from a profile: one paragraph per line, and "# " lines as sub-headings. */
export default function GameText({ text, terms }: { text: string; terms?: Terms }) {
  return (
    <div className="prose">
      {text
        .split('\n')
        .filter(Boolean)
        .map((line, index) =>
          line.startsWith('# ') ? (
            <h4 key={index}>{line.slice(2)}</h4>
          ) : (
            <p key={index}>
              <Struck terms={terms}>{line}</Struck>
            </p>
          ),
        )}
    </div>
  )
}
