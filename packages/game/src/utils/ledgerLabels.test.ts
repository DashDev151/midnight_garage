import type { ValueLedger } from '@midnight-garage/sim'
import { describe, expect, it } from 'vitest'
import { formatYen, formatYenDelta } from './formatYen'
import { ledgerBreakdownLines, workRowFor } from './ledgerLabels'

/** A minimal, hand-built ledger - never a real sim call, since these tests
 * pin the display law itself (three honesty cases off a ledger's own
 * 'wear'/'floor' lines) rather than any economy figure. */
function ledgerWith(lines: ValueLedger['lines']): ValueLedger {
  return { lines, totalYen: lines.reduce((sum, line) => sum + line.yen, 0) }
}

describe('workRowFor', () => {
  it('reads a normal below-band bill forward: "Work adds", the wear line\'s own magnitude positive, the bill beside it', () => {
    const ledger = ledgerWith([
      { id: 'book', yen: 900_000 },
      { id: 'wear', yen: -48_191 },
    ])
    const row = workRowFor(ledger, 37_070)
    expect(row).toEqual({
      state: 'gain',
      label: 'Work adds',
      figure: formatYenDelta(48_191),
      subText: `for ${formatYen(37_070)} in parts and labour`,
    })
    expect(row.figure).toBe('+¥48,191')
    expect(row.subText).toBe('for ¥37,070 in parts and labour')
  })

  it('reads a zero wear line as nothing left to do, with no figure', () => {
    const ledger = ledgerWith([
      { id: 'book', yen: 900_000 },
      { id: 'wear', yen: 0 },
    ])
    const row = workRowFor(ledger, 0)
    expect(row).toEqual({
      state: 'none',
      label: 'Nothing outstanding',
      figure: null,
      subText: null,
    })
  })

  it('a floor-pinned car never claims a gain it cannot deliver, whatever the wear line or bill say', () => {
    const ledger = ledgerWith([
      { id: 'book', yen: 900_000 },
      { id: 'wear', yen: -700_000 },
      { id: 'floor', yen: 250_000 },
    ])
    const row = workRowFor(ledger, 900_000)
    expect(row).toEqual({
      state: 'floor',
      label: 'Work adds nothing yet',
      figure: null,
      subText: 'worth scrap until the bill comes down',
    })
  })
})

describe('ledgerBreakdownLines', () => {
  it('drops the wear line and keeps every other line, in order', () => {
    const ledger = ledgerWith([
      { id: 'book', yen: 900_000 },
      { id: 'mileage', yen: -50_000 },
      { id: 'wear', yen: -48_191 },
      { id: 'polish', yen: 0 },
      { id: 'aftermarket', yen: 12_000 },
    ])
    expect(ledgerBreakdownLines(ledger).map((line) => line.id)).toEqual([
      'book',
      'mileage',
      'polish',
      'aftermarket',
    ])
  })

  it('leaves a ledger with no wear line untouched', () => {
    const ledger = ledgerWith([{ id: 'book', yen: 900_000 }])
    expect(ledgerBreakdownLines(ledger)).toEqual(ledger.lines)
  })
})
