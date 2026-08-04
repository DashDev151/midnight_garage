import {
  CONSUMABLE_TINS,
  PAINT_COLOURS,
  PAINT_TINS,
  paintStockKey,
  type DayLogEntry,
  type GameState,
  type Grade,
  type PaintFinish,
  type PaintTinSize,
  type PipelineStageId,
  type SimpleConsumableId,
} from '@midnight-garage/content'
import { PAINT_FINISH_BY_GRADE } from './bodyPipeline'
import type { SimContext } from './context'
import { bookCashMovements } from './financeLedger'

/**
 * One consumable a pipeline stage draws off the shelf, and how many uses it
 * takes - `stageConsumables`/`paintConsumableRequirement` below are the only
 * two producers, so a stage's live materials cost and its stock draw can
 * never disagree about what it needs.
 */
export interface ConsumableRequirement {
  key: string
  uses: number
}

/**
 * What one execution of a generic (non-paint) pipeline stage draws off the
 * shelf. `fillAndSand` draws both filler and sanding paper at once - the two
 * SKUs `bodyPipeline.ts`'s `FILL_AND_SAND_COST_YEN` already sums into one
 * stage cost - `prime` and `polish` each draw their own one tin, and the
 * three stages with no material cost draw nothing.
 */
export function stageConsumables(
  stage: Exclude<PipelineStageId, 'paint'>,
): readonly ConsumableRequirement[] {
  switch (stage) {
    case 'fillAndSand':
      return [
        { key: 'filler', uses: 1 },
        { key: 'paper', uses: 1 },
      ]
    case 'prime':
      return [{ key: 'primer', uses: 1 }]
    case 'polish':
      return [{ key: 'polish', uses: 1 }]
    case 'stripPrep':
    case 'beat':
    case 'weld':
      return []
  }
}

/**
 * What a `pipeline-paint` action of `grade` in `colour` draws off the
 * shelf - one use of that finish's tin, mixed to that exact colour
 * (`paintStockKey`).
 */
export function paintConsumableRequirement(grade: Grade, colour: string): ConsumableRequirement {
  return { key: paintStockKey(PAINT_FINISH_BY_GRADE[grade], colour), uses: 1 }
}

/**
 * Whether `stock` holds enough of every requirement - the live shelf gate a
 * staged pipeline action checks after its zone/capability plan already
 * succeeds. A repair bill quote never calls this: it prices the whole job as
 * though the shelf were stocked, the same fiction a bill's own full-capability
 * reading already applies to the body line (`bodyPipeline.ts`'s
 * `BILL_CAPABILITY`), so a quote can never depend on what happens to be on
 * the shelf today.
 */
export function hasStockFor(
  stock: Readonly<Record<string, number>>,
  requirements: readonly ConsumableRequirement[],
): boolean {
  return requirements.every((r) => (stock[r.key] ?? 0) >= r.uses)
}

/**
 * The first requirement `stock` cannot cover, or `undefined` when every one
 * is met - names which tin is short rather than just the fact of running
 * out, so a refusal can say what to go and buy.
 */
export function firstShortfall(
  stock: Readonly<Record<string, number>>,
  requirements: readonly ConsumableRequirement[],
): ConsumableRequirement | undefined {
  return requirements.find((r) => (stock[r.key] ?? 0) < r.uses)
}

/**
 * Draws every requirement down by its own use count - the live counterpart
 * to `hasStockFor`, called only once the caller has already confirmed the
 * shelf covers the whole list.
 */
export function consumeStock(
  stock: Readonly<Record<string, number>>,
  requirements: readonly ConsumableRequirement[],
): Record<string, number> {
  const next = { ...stock }
  for (const r of requirements) {
    next[r.key] = (next[r.key] ?? 0) - r.uses
  }
  return next
}

export interface BuyConsumableResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Buys one tin of a simple (non-paint) consumable - filler, paper, primer or
 * polish - crediting the whole `usesPerTin` to the shelf at once. Silent
 * no-op on insufficient cash or an id with no catalogue tin, the same
 * refusal idiom `resolveBuyPart` uses.
 */
export function resolveBuyConsumableTin(
  state: GameState,
  id: SimpleConsumableId,
  context: SimContext,
): BuyConsumableResult {
  const tin = CONSUMABLE_TINS.find((t) => t.id === id)
  if (!tin) return { state, log: [] }
  if (state.cashYen < tin.priceYen) return { state, log: [] }
  const log: DayLogEntry[] = [
    {
      type: 'consumable-bought',
      consumableKey: id,
      usesAdded: tin.usesPerTin,
      priceYen: tin.priceYen,
    },
  ]
  const stock = state.consumableStock ?? {}
  const next: GameState = {
    ...state,
    cashYen: state.cashYen - tin.priceYen,
    consumableStock: { ...stock, [id]: (stock[id] ?? 0) + tin.usesPerTin },
  }
  return { state: bookCashMovements(next, log, context.economy), log }
}

/**
 * Buys one paint tin of `finish`/`size`, mixed to `colour` - the one
 * consumable purchase that also names a colour
 * (docs/design/systems/consumables-as-stock.md). Silent no-op on
 * insufficient cash, an unrecognised finish/size pair, or a colour outside
 * the 34-shade palette.
 */
export function resolveBuyPaintTin(
  state: GameState,
  finish: PaintFinish,
  size: PaintTinSize,
  colour: string,
  context: SimContext,
): BuyConsumableResult {
  if (!PAINT_COLOURS.some((c) => c.id === colour)) return { state, log: [] }
  const tin = PAINT_TINS.find((t) => t.finish === finish && t.size === size)
  if (!tin) return { state, log: [] }
  if (state.cashYen < tin.priceYen) return { state, log: [] }
  const key = paintStockKey(finish, colour)
  const log: DayLogEntry[] = [
    {
      type: 'consumable-bought',
      consumableKey: key,
      usesAdded: tin.usesPerTin,
      priceYen: tin.priceYen,
    },
  ]
  const stock = state.consumableStock ?? {}
  const next: GameState = {
    ...state,
    cashYen: state.cashYen - tin.priceYen,
    consumableStock: { ...stock, [key]: (stock[key] ?? 0) + tin.usesPerTin },
  }
  return { state: bookCashMovements(next, log, context.economy), log }
}
