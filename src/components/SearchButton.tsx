import { openSearch } from '../lib/search'

/** Opens the search box. */
export default function SearchButton({ label = 'Cari' }: { label?: string }) {
  return (
    <button
      type="button"
      className="pill search-open"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K /"
      title="Cari di seluruh museum (Ctrl+K)"
      onClick={() => openSearch()}
    >
      <span aria-hidden="true">🔍</span>
      {/* Small screens show only the icon, so the top bar keeps its height. */}
      <span className="label">{label}</span>
    </button>
  )
}
