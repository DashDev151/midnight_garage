import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeRosterCoherence } from '../src/coherence'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

/**
 * Sprint 55 (economy-bible.md law 4): the closed-form coherence invariants,
 * checked here as a fast, CI-gated unit test against the real shipped roster
 * - the same numbers `tools/balance/data/coherence.csv` exports for the
 * human-readable per-model report, computed by the exact same function
 * (`computeRosterCoherence`), so a failure here and a failure in
 * `balance.cli check` can never disagree.
 */
describe('roster coherence invariants (economy-bible.md law 4)', () => {
  const rows = computeRosterCoherence(CARS, CONTEXT)

  it('covers every roster model exactly once', () => {
    expect(rows.map((r) => r.modelId).sort()).toEqual(CARS.map((c) => c.id).sort())
  })

  it('Law 2: the worst plausible bill never exceeds maxBillFraction of clean value, for every model', () => {
    const { maxBillFraction } = CONTEXT.economy.partsGeneration
    const failures = rows
      .filter((r) => r.billToCleanRatio > maxBillFraction + 1e-9)
      .map((r) => `${r.modelId}: ratio ${r.billToCleanRatio.toFixed(3)} > ${maxBillFraction}`)
    expect(failures).toEqual([])
  })

  it('Law 1: buy-at-reserve + full-restore + sell-at-guide clears a positive margin, for every model at its worst roll', () => {
    const failures = rows
      .filter((r) => r.flipMarginYen <= 0)
      .map(
        (r) =>
          `${r.modelId}: margin ${r.flipMarginYen} (${(r.flipMarginFraction * 100).toFixed(1)}% of clean)`,
      )
    expect(failures).toEqual([])
  })

  it("Law 3: the full consumable set never approaches a model's own book value", () => {
    const { maxConsumablesShareOfBookValue } = CONTEXT.economy.coherence
    const failures = rows
      .filter((r) => r.consumablesShare > maxConsumablesShareOfBookValue)
      .map((r) => `${r.modelId}: consumables share ${(r.consumablesShare * 100).toFixed(1)}%`)
    expect(failures).toEqual([])
  })
})
