import type { DayLogEntry, GameState } from '@midnight-garage/content'
import type { SimContext } from './context'
import { hashStringToSeed } from './rng'

export interface MarketHeatUpdateResult {
  state: GameState
  log: DayLogEntry[]
}

/** Below this decayed ledger value, a counter is dropped entirely rather
 * than kept as a vanishingly small float forever. */
const LEDGER_PRUNE_THRESHOLD = 0.01

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function decayedEntry(
  ledger: Readonly<Record<string, number>>,
  modelId: string,
  decay: number,
): number {
  return (ledger[modelId] ?? 0) * decay
}

/**
 * Bumps `lotSupply[modelId]` by 1 for each fresh lot generated this catalog
 * refresh (Sprint 21) - one entry per lot, so a tier that generates 3 lots
 * of the same model bumps that model 3 times. Called from `advanceDay.ts`'s
 * daily-arrivals step (Sprint 30 decision 4: every day now, not just a
 * weekly boundary), right beside the `freshLots` append (`catalogs.ts`'s
 * generators stay pure - they never touch state themselves). The weekly
 * market-pressure update below still only READS the accumulated ledger on
 * its own 7-day cadence, so smaller, more frequent bumps land the same
 * total supply signal, just smoother.
 */
export function bumpLotSupply(state: GameState, modelIds: readonly string[]): GameState {
  if (modelIds.length === 0) return state
  const lotSupply = { ...state.marketLedger.lotSupply }
  for (const modelId of modelIds) {
    lotSupply[modelId] = (lotSupply[modelId] ?? 0) + 1
  }
  return { ...state, marketLedger: { ...state.marketLedger, lotSupply } }
}

/**
 * Bumps `playerSales[modelId]` by 1 for one resolved player sale (Sprint
 * 21) - called from `resolveSellViaWalkIn` (selling.ts) and the public-
 * listing resolution step in `advanceDay.ts`.
 */
export function bumpPlayerSales(state: GameState, modelId: string): GameState {
  const playerSales = { ...state.marketLedger.playerSales }
  playerSales[modelId] = (playerSales[modelId] ?? 0) + 1
  return { ...state, marketLedger: { ...state.marketLedger, playerSales } }
}

/**
 * Weekly market-pressure update (Sprint 21 - replaces the old pure random
 * walk, `+/-4` weekly on every tracked model). Three deterministic signals
 * combine into a target heat each model's real heat smooths toward:
 *
 * 1. A slow per-model demand wave (`WAVE_AMPLITUDE x sin(...)`), phase-offset
 *    per model by `hashStringToSeed(modelId)` so models don't all crest
 *    together.
 * 2. A supply-glut penalty (`SUPPLY_WEIGHT x lotSupply`) - a model the
 *    catalog keeps producing runs cooler.
 * 3. A flood-the-market penalty (`SALES_WEIGHT x playerSales`) - the player
 *    dumping copies of one model softens its own price for a few weeks.
 *
 * Plus a flat scarcity bonus when `lotSupply` is below `SCARCITY_THRESHOLD`
 * (a model absent from catalogs for a while runs hot). The target is
 * clamped to `[HEAT_MIN, HEAT_MAX]`; real heat closes `SMOOTHING` of the gap
 * to it per update, so heat drifts rather than jumps. Both ledger counters
 * decay by `LEDGER_DECAY` first (dropped below `LEDGER_PRUNE_THRESHOLD`),
 * so a burst of activity fades over a few weeks rather than lingering
 * forever. Fully deterministic - no `Date.now()`/`Math.random()` - and a
 * no-op off the day-7 boundary, same pipeline position `driftMarketHeat`
 * used to occupy.
 */
export function updateMarketHeat(state: GameState, context: SimContext): MarketHeatUpdateResult {
  if (state.day % 7 !== 0) {
    return { state, log: [] }
  }

  const { marketPressure } = context.economy
  const weekIndex = Math.floor(state.day / 7)
  const marketHeat = { ...state.marketHeat }
  const lotSupply: Record<string, number> = {}
  const playerSales: Record<string, number> = {}
  const log: DayLogEntry[] = []

  for (const model of context.models) {
    const modelId = model.id
    const current = marketHeat[modelId] ?? 100

    const decayedLotSupply = decayedEntry(
      state.marketLedger.lotSupply,
      modelId,
      marketPressure.LEDGER_DECAY,
    )
    const decayedPlayerSales = decayedEntry(
      state.marketLedger.playerSales,
      modelId,
      marketPressure.LEDGER_DECAY,
    )
    if (decayedLotSupply >= LEDGER_PRUNE_THRESHOLD) lotSupply[modelId] = decayedLotSupply
    if (decayedPlayerSales >= LEDGER_PRUNE_THRESHOLD) playerSales[modelId] = decayedPlayerSales

    const phase = hashStringToSeed(modelId) % marketPressure.WAVE_PERIOD_WEEKS
    const wave =
      marketPressure.WAVE_AMPLITUDE *
      Math.sin((2 * Math.PI * (weekIndex + phase)) / marketPressure.WAVE_PERIOD_WEEKS)
    const scarcityBonus =
      decayedLotSupply < marketPressure.SCARCITY_THRESHOLD ? marketPressure.SCARCITY_BONUS : 0
    const rawTarget =
      100 +
      wave -
      marketPressure.SUPPLY_WEIGHT * decayedLotSupply -
      marketPressure.SALES_WEIGHT * decayedPlayerSales +
      scarcityBonus
    const target = clamp(rawTarget, marketPressure.HEAT_MIN, marketPressure.HEAT_MAX)

    const next = Math.round(current + marketPressure.SMOOTHING * (target - current))
    marketHeat[modelId] = next
    if (next !== current) {
      log.push({ type: 'market-heat-shift', modelId, deltaPercent: next - current })
    }
  }

  return {
    state: { ...state, marketHeat, marketLedger: { lotSupply, playerSales } },
    log,
  }
}
