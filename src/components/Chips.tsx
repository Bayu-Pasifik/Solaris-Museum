/** An empty choice lets every value through. */
export const allows = <T,>(chosen: T[], value: T) => chosen.length === 0 || chosen.includes(value)

export const toggled = <T,>(chosen: T[], value: T) =>
  chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value]

export const unique = <T,>(values: T[]) => [...new Set(values)]

/** One row of filter buttons for values of the game. Several can be on at the same time. */
export default function Chips<T extends string | number>({
  label,
  options,
  chosen,
  onToggle,
  text = String,
  color,
}: {
  label: string
  options: T[]
  chosen: T[]
  onToggle: (value: T) => void
  text?: (value: T) => string
  /** Color of the dot in front of the text. */
  color?: (value: T) => string
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <span aria-hidden="true">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="pill"
          lang="en"
          aria-pressed={chosen.includes(option)}
          onClick={() => onToggle(option)}
        >
          {color && <i style={{ background: color(option) }} />}
          {text(option)}
        </button>
      ))}
    </div>
  )
}
