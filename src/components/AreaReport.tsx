import { assetUrl } from '../lib/characters'
import { useTerms } from '../lib/glossary'
import type { Area } from '../lib/map'
import GameText from './GameText'

/** One area: its picture and name, and the exploration reports about it. */
export default function AreaReport({ area }: { area: Area }) {
  const terms = useTerms()
  const seen = new Set<number>()

  return (
    <div className="report">
      {area.picture && <img className="view" src={assetUrl(area.picture)} alt="" />}
      <h2 lang="en">{area.name}</h2>
      {area.reports.map((report) => (
        <article key={report.id}>
          <h3 lang="en">{report.title}</h3>
          <small>Unlocks in game at exploration {report.unlock}%</small>
          <GameText text={terms.link(report.text, seen)} terms={terms.byId} />
        </article>
      ))}
    </div>
  )
}
