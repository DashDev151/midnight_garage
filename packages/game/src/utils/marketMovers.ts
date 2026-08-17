/**
 * The stand's weekly sheet: which models moved the most since the last
 * heat update, split into risers and fallers, each capped to a handful so
 * the page reads as a short bulletin rather than a table of the whole
 * roster. Pure and state-free by design - `gameStore.ts` supplies the raw
 * per-model shift, the resolved display names, and which models the player
 * owns or has been selling; this module only selects and shapes the list.
 *
 * Deliberately carries no absolute heat figure anywhere in its output: only
 * the delta from the most recent weekly update, which is the one number the
 * design calls "a fact a trade paper prints" rather than the game coaching
 * the player toward a solved cycle.
 */

/** How many rows the sheet prints on each side - a handful, not the roster. */
export const MARKET_MOVERS_PER_SIDE = 3

export type MarketMoverInvolvement = 'owned' | 'sold' | null

export interface MarketMover {
  modelId: string
  label: string
  deltaPercent: number
  involvement: MarketMoverInvolvement
}

export interface MarketMoversResult {
  risers: MarketMover[]
  fallers: MarketMover[]
}

/**
 * Selects the biggest risers and fallers from the most recent weekly shift.
 * `lastShift` is a per-model delta (positive up, negative down); a model
 * absent from it, or carrying a zero, did not move and is left out
 * entirely rather than printed as "steady". `ownedModelIds` and
 * `soldModelIds` mark a row `owned` or `sold` so the player's own models
 * stand out without any explanation of why they moved.
 */
export function computeMarketMovers(
  lastShift: Readonly<Record<string, number>>,
  resolveLabel: (modelId: string) => string,
  ownedModelIds: ReadonlySet<string>,
  soldModelIds: ReadonlySet<string>,
  perSide: number = MARKET_MOVERS_PER_SIDE,
): MarketMoversResult {
  const movers: MarketMover[] = Object.entries(lastShift)
    .filter(([, deltaPercent]) => deltaPercent !== 0)
    .map(([modelId, deltaPercent]) => ({
      modelId,
      label: resolveLabel(modelId),
      deltaPercent,
      involvement: ownedModelIds.has(modelId) ? 'owned' : soldModelIds.has(modelId) ? 'sold' : null,
    }))

  const risers = movers
    .filter((mover) => mover.deltaPercent > 0)
    .sort((a, b) => b.deltaPercent - a.deltaPercent)
    .slice(0, perSide)

  const fallers = movers
    .filter((mover) => mover.deltaPercent < 0)
    .sort((a, b) => a.deltaPercent - b.deltaPercent)
    .slice(0, perSide)

  return { risers, fallers }
}
