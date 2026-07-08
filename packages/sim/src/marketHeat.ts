import type { DayLogEntry, GameState } from '@midnight-garage/content'
import { MARKET_HEAT_WEEKLY_DRIFT_RANGE } from './constants'
import type { Rng } from './rng'

export interface MarketHeatDriftResult {
  state: GameState
  log: DayLogEntry[]
}

/** Weekly seeded random walk on each model's demand index (GDD 6.4). */
export function driftMarketHeat(state: GameState, rng: Rng): MarketHeatDriftResult {
  if (state.day % 7 !== 0) {
    return { state, log: [] }
  }

  const [min, max] = MARKET_HEAT_WEEKLY_DRIFT_RANGE
  const marketHeat = { ...state.marketHeat }
  const log: DayLogEntry[] = []

  for (const modelId of Object.keys(marketHeat)) {
    const delta = rng.int(min, max)
    if (delta === 0) continue
    const current = marketHeat[modelId] ?? 100
    marketHeat[modelId] = Math.max(0, current + delta)
    log.push({ type: 'market-heat-shift', modelId, deltaPercent: delta })
  }

  return { state: { ...state, marketHeat }, log }
}
