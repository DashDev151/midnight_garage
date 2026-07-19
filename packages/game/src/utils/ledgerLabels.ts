import type { ValueLedgerLine, ValueLedgerLineId } from '@midnight-garage/sim'
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
  aftermarket: 'Fitted upgrades',
  fear: 'Doubts, at the odds',
}

/** A ledger line's yen for display: the 'book' base plain, every
 * adjustment line explicitly signed. */
export function formatLedgerLineYen(line: ValueLedgerLine): string {
  return line.id === 'book' ? formatYen(line.yen) : formatYenDelta(line.yen)
}
