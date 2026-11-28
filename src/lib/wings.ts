/* A hall of wings: one wing for every kind of what is on show. */

/** The kinds in the order of "order". A kind that is not listed comes after these. */
export const wingsOf = (kinds: string[], order: readonly string[]) => {
  const rank = (kind: string) => order.indexOf(kind) + 1 || order.length + 1
  return [...new Set(kinds)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** The order of the items in a wing: the best ones first. */
export const byRank = (
  a: { name: string; rarity: number },
  b: { name: string; rarity: number },
) => b.rarity - a.rarity || a.name.localeCompare(b.name)
