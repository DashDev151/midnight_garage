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
  computeRosterBalanceProbe,
  computeRosterDonorBalanceProbe,
  computeSymptomBalanceProbe,
} from '../src/balanceProbes'
import { computeGeneratedLotPlayRanking } from '../src/plays'

/** Lots per model for the donor law below, which is asked of the cars the
 * game actually deals rather than of a constructed worst case. */
const LOT_SEEDS = 60
const LOT_GAME_YEAR = 1995

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
 * Economy-bible law 4's closed-form coherence invariants, checked here as
 * a fast, CI-gated unit test against the real shipped roster - the same
 * numbers `tools/balance/data/coherence.csv` exports for the
 * human-readable per-model report, computed by the exact same function
 * (`computeRosterBalanceProbe`), so a failure here and a failure in
 * `balance.cli check` can never disagree.
 */
describe('roster coherence invariants (economy-bible.md law 4)', () => {
  const rows = computeRosterBalanceProbe(CARS, CONTEXT)

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
  const modelRows = computeRosterBalanceProbe(CARS, CONTEXT)
  const donorRows = computeRosterDonorBalanceProbe(CARS, CONTEXT)

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

  it('the roster reaches both sides of the donor break-even bill ratio', () => {
    // `donorBreakEvenBillRatio` is a DISCLOSED measurement threshold rather
    // than a gate: the roster's worst rolls genuinely reach both sides of it,
    // and repair wins on both sides, because the real yield depends on the
    // whole model (book value, parts mix, expectation band) and never on
    // `billToCleanRatio` alone. This keeps the disclosure honest - if the
    // roster ever sat entirely on one side, the threshold would be measuring
    // nothing.
    const donorBreakEvenBillRatio = CONTEXT.economy.teardown.donorBreakEvenBillRatio
    const ratios = modelRows.map((r) => r.billToCleanRatio)
    expect(ratios).toHaveLength(CARS.length)
    expect(ratios.some((ratio) => ratio > donorBreakEvenBillRatio)).toBe(true)
    expect(ratios.some((ratio) => ratio <= donorBreakEvenBillRatio)).toBe(true)
  })

  it('parting out never beats repairing, on the lots the game actually deals', () => {
    // The donor law, asked of real cars. It used to be asked of
    // `buildWorstCaseRawCar`, an all-scrap construction with every zone at one
    // severity, and it compared a GROSS parted yield (no purchase deducted) on
    // that car against a NET repair margin on a different one - two accounting
    // bases and two cars that no catalogue can offer.
    //
    // Measured on 10,400 real lots (26 models x 400 seeds), parting out beats
    // repairing on ZERO of them: the median lot loses ¥531,789 stripped, and
    // the most strip-friendly lot anywhere on the roster still loses ¥3,745.
    // So the honest gate is the one below, on real cars, at one buy price,
    // net against net - and it fails the moment breaking a car becomes the
    // better play than fixing it.
    const lots = computeGeneratedLotPlayRanking(CARS, CONTEXT, LOT_SEEDS, LOT_GAME_YEAR)
    expect(lots).toHaveLength(CARS.length * LOT_SEEDS)
    const partingWins = lots
      .filter(
        (row) =>
          Math.max(row.plays[2]!.profitYen, row.plays[3]!.profitYen) >=
          Math.min(row.plays[0]!.profitYen, row.plays[1]!.profitYen),
      )
      .map(
        (row) =>
          `${row.modelId} seed ${row.seed}: strip ${row.plays[2]!.profitYen}/${row.plays[3]!.profitYen} against repair ${row.plays[0]!.profitYen}/${row.plays[1]!.profitYen}`,
      )
    expect(partingWins).toEqual([])
  }, 60_000)
})

describe('symptom coherence invariants (Sprint 73 decision 6, room formula updated Sprint 216)', () => {
  const rows = computeSymptomBalanceProbe(CONTEXT)

  it('covers every symptom x every fitment tier exactly once', () => {
    expect(rows).toHaveLength(CONTEXT.symptoms.length * 4)
    for (const symptom of CONTEXT.symptoms) {
      const tiers = rows.filter((r) => r.symptomId === symptom.id).map((r) => r.fitmentClass)
      expect(new Set(tiers)).toEqual(new Set(['entry', 'everyday', 'enthusiast', 'flagship']))
    }
  })

  /**
   * The original "blindBuyEvYen stays near zero" gate is RETIRED, on
   * purpose: it measured whether the room's sheet equalled the honest
   * expectation, which the fearful room (knowledge-and-diagnosis.md
   * section 4) intentionally stops being true - the room now fear-biases
   * toward the worst chain-priced candidate, a genuinely different quantity
   * from the value-weighted mean. `blindBuyEvYen`'s own doc comment
   * (`balanceProbes.ts`) carries the disclosure; what stays gated here is
   * the two structural facts that must ALWAYS hold regardless of formula:
   * the room never prices a symptomatic car at or above its own undamaged
   * (apparent) value, and never at zero or below.
   */
  it('the room never prices a symptomatic lot at or above its own apparent value, and never non-positive', () => {
    const failures = rows
      .filter((r) => r.sheetGuideValueYen >= r.apparentValueYen || r.sheetGuideValueYen <= 0)
      .map(
        (r) =>
          `${r.symptomId} (${r.fitmentClass}): sheet ${r.sheetGuideValueYen} vs apparent ${r.apparentValueYen}`,
      )
    expect(failures).toEqual([])
  })

  it('every symptom shows both a sleeper and a trap cause against the honest average (edges on both sides of zero), on every tier', () => {
    const failures = rows
      .filter(
        (r) =>
          !(
            r.edgePerCauseYen.some((e) => e.edgeVsExpectedYen > 0) &&
            r.edgePerCauseYen.some((e) => e.edgeVsExpectedYen < 0)
          ),
      )
      .map((r) => `${r.symptomId} (${r.fitmentClass}): edges ${JSON.stringify(r.edgePerCauseYen)}`)
    expect(failures).toEqual([])
  })
})
