import { Fragment } from 'react'

/** Shows <s>…</s> parts as strikethrough. All other markup is already removed. */
export function Struck({ children }: { children: string }) {
  // The odd parts are the ones that were inside <s>.
  return children
    .split(/<s>(.*?)<\/s>/)
    .map((part, index) =>
      index % 2 ? <s key={index}>{part}</s> : <Fragment key={index}>{part}</Fragment>,
    )
}

/** Long text from a profile: one paragraph per line, and "# " lines as sub-headings. */
export default function GameText({ text }: { text: string }) {
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
              <Struck>{line}</Struck>
            </p>
          ),
        )}
    </div>
  )
}
