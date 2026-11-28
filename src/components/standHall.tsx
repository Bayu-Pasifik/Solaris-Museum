import { rowOf, spotAtStand } from '../lib/wings'
import WingScene, { type Exhibit, type Stands } from '../three/WingScene'
import type { Hall, HallProps } from './WingWalk'

/** A hall of stands, with the stars of an item below its name. */
export default function standHall<T extends Exhibit & { rarity: number }>(
  stands: Stands<T>,
): Hall<T> {
  return {
    theme: stands.theme,
    note: (item) => '★'.repeat(item.rarity),
    spot: spotAtStand,
    rowOf,
    rowStart: (row) => row * 2,
    Scene: (props: HallProps<T>) => <WingScene {...props} stands={stands} />,
  }
}
