import type { ValueLedger, ValueLedgerLine, ValueLedgerLineId } from '@midnight-garage/sim'
import { formatYen, formatYenDelta } from './formatYen'

/**
 * Display labels for the value ledger's line ids - the one place the
 * ledger's copy lives. The sim emits ids and exact yen; every screen
 * renders its lines through this map and never computes a figure of its
 * own.
 */
export const LEDGER_LINE_LABELS: Record<ValueLedgerLineId, string> = {
  book: 'Book',
  mileage: 'Mileage',
  heat: 'Market heat',
  wear: 'Work outstanding',
  polish: 'Polish',
  floor: 'Scrap floor',
  coherence: 'Build risk',
  aftermarket: 'Fitted upgrades',
  fear: 'Doubts, at the odds',
}

/** A ledger line's yen for display: the 'book' base plain, every
 * adjustment line explicitly signed. */
export function formatLedgerLineYen(line: ValueLedgerLine): string {
  return line.id === 'book' ? formatYen(line.yen) : formatYenDelta(line.yen)
}

/** Every line the demoted breakdown shows: the ledger's own lines, minus
 * 'wear' - the work row above already reads that line forward, so keeping
 * it in the breakdown too would double it. */
export function ledgerBreakdownLines(ledger: ValueLedger): ValueLedgerLine[] {
  return ledger.lines.filter((line) => line.id !== 'wear')
}

/** The forward-looking work row's three honesty cases, all read off the
 * ledger's own 'wear' and 'floor' lines plus the bill the sim has already
 * priced (`carCostToMintYen`) - never a second figure. */
export type WorkRowState = 'gain' | 'none' | 'floor'

export interface WorkRow {
  state: WorkRowState
  label: string
  /** null on the 'none' and 'floor' states, which carry no figure. */
  figure: string | null
  /** null on 'none', which carries no sub-text either. */
  subText: string | null
}

/**
 * The ledger reads forward: what fixing this car up adds, not what is
 * outstanding against it. Floor-pinned (the scrap floor is holding the
 * price up) takes priority, since a gain figure there would be a lie; then
 * a zero 'wear' line reads as nothing left to do; otherwise the gain is the
 * 'wear' line's own magnitude, positive, priced at `billYen` (the bill to
 * mint, `carCostToMintYen` - already computed by the sim, never a second
 * bill).
 */
export function workRowFor(ledger: ValueLedger, billYen: number): WorkRow {
  if (ledger.lines.some((line) => line.id === 'floor')) {
    return {
      state: 'floor',
      label: 'Work adds nothing yet',
      figure: null,
      subText: 'worth scrap until the bill comes down',
    }
  }
  const wearYen = ledger.lines.find((line) => line.id === 'wear')?.yen ?? 0
  if (wearYen === 0) {
    return { state: 'none', label: 'Nothing outstanding', figure: null, subText: null }
  }
  return {
    state: 'gain',
    label: 'Work adds',
    figure: formatYenDelta(-wearYen),
    subText: `for ${formatYen(billYen)} in parts and labour`,
  }
}
