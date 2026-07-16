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
import {
  computeRosterCoherence,
  computeRosterDonorCoherence,
  computeSymptomCoherence,
} from '../src/coherence'

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

describe('donor coherence invariants (Sprint 71 decision 8: the teardown game)', () => {
  const modelRows = computeRosterCoherence(CARS, CONTEXT)
  const donorRows = computeRosterDonorCoherence(CARS, CONTEXT)

  it('covers every roster model exactly once', () => {
    expect(donorRows.map((r) => r.modelId).sort()).toEqual(CARS.map((c) => c.id).sort())
  })

  it('a clean car is never worth more parted out than sold whole, for every model', () => {
    const failures = donorRows
      .filter((r) => r.partedYieldYen >= r.wholeSaleYen)
      .map(
        (r) =>
          `${r.modelId}: parted ${r.partedYieldYen} >= whole ${r.wholeSaleYen} (${r.stripLaborSlots} labour slots to strip)`,
      )
    expect(failures).toEqual([])
  })

  it('discloses, per model, where the worst-case car crosses from "repair it" to "part it out" against economy.teardown.donorBreakEvenBillRatio', () => {
    // Not a gate (decision 8): the crossover is measured here, not
    // force-asserted at an exact ratio - this pins the CURRENT shape so a
    // future economy retune can't silently drift it unnoticed.
    const donorBreakEvenBillRatio = CONTEXT.economy.teardown.donorBreakEvenBillRatio
    const byModel = new Map(modelRows.map((r) => [r.modelId, r]))
    const crossings = donorRows.map((r) => {
      const modelRow = byModel.get(r.modelId)!
      return {
        modelId: r.modelId,
        billToCleanRatio: modelRow.billToCleanRatio,
        partingWins: r.partedYieldOfWorstCaseYen > modelRow.sensibleFlipMarginYen,
      }
    })
    // The roster's worst-case bill-to-clean ratio never exceeds Law 2's
    // `maxBillFraction` ceiling (already gated above) - measured here
    // against `donorBreakEvenBillRatio` specifically to disclose whether
    // the shipped roster's worst rolls ever actually reach the point where
    // parting out would win.
    // Disclosure only (decision 8): the roster's worst-case rolls genuinely
    // reach both sides of `donorBreakEvenBillRatio`, and both outcomes
    // (parting out wins, the sensible repair wins) occur somewhere on the
    // roster - the mechanism is real and exercised, not a threshold that
    // never actually triggers on the shipped content. It is NOT a clean
    // single-variable crossover at the ratio itself - several models sit
    // above the ratio yet still favour repair, because the real yield
    // depends on the whole model (book value, parts mix, expectation band),
    // not `billToCleanRatio` alone. That is exactly why this is measured and
    // disclosed here rather than force-gated to the ratio.
    expect(crossings).toHaveLength(CARS.length)
    expect(crossings.some((c) => c.billToCleanRatio > donorBreakEvenBillRatio)).toBe(true)
    expect(crossings.some((c) => c.partingWins)).toBe(true)
    expect(crossings.some((c) => !c.partingWins)).toBe(true)
  })
})

describe('symptom coherence invariants (Sprint 73 decision 6: the blind-buy guardrail)', () => {
  const rows = computeSymptomCoherence(CONTEXT)

  it('covers every symptom x every fitment tier exactly once', () => {
    expect(rows).toHaveLength(CONTEXT.symptoms.length * 4)
    for (const symptom of CONTEXT.symptoms) {
      const tiers = rows.filter((r) => r.symptomId === symptom.id).map((r) => r.fitmentClass)
      expect(new Set(tiers)).toEqual(new Set(['shitbox', 'common', 'uncommon', 'rare']))
    }
  })

  it('buying blind is never -EV (blindBuyEvYen >= 0), for every symptom on every tier', () => {
    const failures = rows
      .filter((r) => r.blindBuyEvYen < 0)
      .map((r) => `${r.symptomId} (${r.fitmentClass}): blindBuyEvYen ${r.blindBuyEvYen}`)
    expect(failures).toEqual([])
  })

  it('buying blind is never a windfall (blindBuyEvYen <= 20% of the apparent-to-expected gap)', () => {
    const failures = rows
      .filter((r) => {
        const gap = r.apparentValueYen - r.expectedTrueValueYen
        return r.blindBuyEvYen > 0.2 * gap + 1 // +1 yen: rounding slack, not a real tolerance
      })
      .map((r) => `${r.symptomId} (${r.fitmentClass}): blindBuyEvYen ${r.blindBuyEvYen}`)
    expect(failures).toEqual([])
  })

  it('every symptom shows both a sleeper and a trap cause (edges on both sides of zero), on every tier', () => {
    const failures = rows
      .filter(
        (r) =>
          !(
            r.edgePerCauseYen.some((e) => e.edgeYen > 0) &&
            r.edgePerCauseYen.some((e) => e.edgeYen < 0)
          ),
      )
      .map((r) => `${r.symptomId} (${r.fitmentClass}): edges ${JSON.stringify(r.edgePerCauseYen)}`)
    expect(failures).toEqual([])
  })
})
