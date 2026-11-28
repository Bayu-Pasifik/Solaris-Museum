import { useNavigate } from 'react-router'

type Props = {
  /** Name of the control for screen readers. */
  label: string
  groups: string[]
  value?: string
  /** The address of the first entry of a group. */
  to: (group: string) => string
}

/** Jumps to the first entry of a group of the open shelf. */
export default function GroupSelect({ label, groups, value, to }: Props) {
  const navigate = useNavigate()
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => navigate(to(event.target.value), { replace: true })}
    >
      {groups.map((group) => (
        <option key={group}>{group}</option>
      ))}
    </select>
  )
}
