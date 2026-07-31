import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type EconomyConfig,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { bandIndex } from '../src/bands'
import { hasZoneImproveHeadroom, isBodyDerivedPart } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GAME_YEAR = 1995
const ENTRY_MODEL = CARS.find((c) => c.tier === 'entry')!

/**
 * `generateAuctionCarInstance` rolls symptoms after its existing
 * `enforceMaxBillFraction` softening pass. Tested entirely through the
 * public generation function (no need to export the private
 * `applySymptoms`/`rollSymptomCount` helpers): the Law 2 drop rule is
 * forced by overriding `partsGeneration.maxBillFraction` to an
 * impossible-to-clear value, and a guaranteed-roll economy override
 * drives the "symptomatic car" tests without depending on a hand-found
 * lucky seed.
 */

function economyWithGuaranteedSymptom(overrides: Partial<EconomyConfig['diagnosis']> = {}) {
  return {
    ...ECONOMY,
    diagnosis: {
      ...ECONOMY.diagnosis,
      symptomChanceByTier: {
        entry: 1,
        everyday: 1,
        enthusiast: 1,
        flagship: 1,
      },
      secondSymptomChance: 0,
      ...overrides,
    },
  }
}

describe('symptom generation (Sprint 73 decision 2)', () => {
  it('an honest car (allowSymptoms: false) always has an empty symptom list and a null apparent record', () => {
    for (let seed = 0; seed < 20; seed++) {
      const car = generateAuctionCarInstance(
        ENTRY_MODEL,
        `honest-${seed}`,
        createRng(seed),
        CONTEXT,
        GAME_YEAR,
        true,
        0,
        false,
      )
      expect(car.symptoms).toEqual([])
      expect(car.apparentBandByPartId).toBeNull()
    }
  })

  it('whenever real generation rolls zero symptoms, the apparent record stays null (never a stray empty object)', () => {
    let sawZeroSymptoms = false
    for (let seed = 0; seed < 200; seed++) {
      const car = generateAuctionCarInstance(
        ENTRY_MODEL,
        `sweep-${seed}`,
        createRng(seed),
        CONTEXT,
        GAME_YEAR,
      )
      if (car.symptoms.length === 0) {
        sawZeroSymptoms = true
        expect(car.apparentBandByPartId).toBeNull()
      }
    }
    expect(sawZeroSymptoms, 'expected at least one seed to roll zero symptoms').toBe(true)
  })

  it("a symptomatic car's true band is never better than its recorded apparent band, for every damaged part", () => {
    const guaranteedContext = buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      undefined,
      undefined,
      undefined,
      undefined,
      economyWithGuaranteedSymptom(),
    )
    let sawSymptom = false
    for (let seed = 0; seed < 40; seed++) {
      const car = generateAuctionCarInstance(
        ENTRY_MODEL,
        `worse-${seed}`,
        createRng(seed),
        guaranteedContext,
        GAME_YEAR,
      )
      if (car.symptoms.length === 0 || !car.apparentBandByPartId) continue
      sawSymptom = true
      for (const [partId, apparentBand] of Object.entries(car.apparentBandByPartId)) {
        const trueBand = car.parts[partId as keyof CarInstance['parts']].installed?.band
        expect(trueBand, `${partId} should still be installed on a symptomatic car`).toBeDefined()
        expect(
          bandIndex(trueBand!),
          `${partId}: true band ${trueBand} should be at or worse than apparent ${apparentBand}`,
        ).toBeLessThanOrEqual(bandIndex(apparentBand))
      }
    }
    expect(sawSymptom, 'expected at least one seed to roll a surviving symptom').toBe(true)
  })

  it('the Law 2 drop rule fires when a symptom would push the car over its bill ceiling - no symptom carrying real money cost ever survives, and every affected part reverts to its cheapest state', () => {
    const impossibleBudget: EconomyConfig = {
      ...ECONOMY,
      partsGeneration: {
        ...ECONOMY.partsGeneration,
        maxBillFraction: 0.0001,
        // The damage budget is a separate mechanism from the Law 2 drop rule
        // this test targets - every grade AND the work-guarantee floor
        // zeroed here so it never degrades a part away from mint and
        // confounds the "every part reverts" assertion below.
        damageGrades: {
          ...ECONOMY.partsGeneration.damageGrades,
          bandStepsByGrade: { tidy: 0, used: 0, rough: 0, project: 0 },
          minWorkSteps: 0,
        },
      },
      diagnosis: economyWithGuaranteedSymptom().diagnosis,
    }
    const guardedContext = buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      undefined,
      undefined,
      undefined,
      undefined,
      impossibleBudget,
    )
    for (let seed = 0; seed < 20; seed++) {
      const car = generateAuctionCarInstance(
        ENTRY_MODEL,
        `dropped-${seed}`,
        createRng(seed),
        guardedContext,
        GAME_YEAR,
      )
      // A cause on a zone-derived body part can add ZERO money cost by two
      // routes, and the money-driven Law 2 veto then correctly has nothing
      // to drop. First, `panels`' money bill rides on `surface` alone -
      // `metal` is repaired by hand and never priced in yen - so damage
      // routed through metal (the real content's "quarter-panel-filler"
      // symptom: `panel-respray`, `rust-patch`) is free. Second,
      // `setZoneCarrierToAtLeastBand` is a no-op when the zone ALREADY
      // carries at least that severity, so a cause describing damage the
      // car had anyway (the real content's `rotted-subframe-mount`, which
      // sets `underbody` to scrap) adds nothing to the bill either.
      //
      // Both are real, disclosed consequences of pricing body work outside
      // yen, not a broken guard, and neither can hide a genuine violation:
      // the per-part loop below independently asserts that no zone-derived
      // carrier has any money-improve headroom left. Every OTHER surviving
      // symptom would be a genuine violation.
      const survivingCause = car.symptoms[0]
        ? guardedContext.symptomsById[car.symptoms[0].symptomId]?.causes.find(
            (c) => c.id === car.symptoms[0]!.trueCauseId,
          )
        : undefined
      const survivorIsMoneyFreeBodyDamage =
        survivingCause !== undefined && isBodyDerivedPart(survivingCause.carPartId)
      if (!survivorIsMoneyFreeBodyDamage) {
        expect(
          car.symptoms,
          `seed ${seed}: no money-costing symptom should survive an impossible bill ceiling`,
        ).toEqual([])
        expect(car.apparentBandByPartId).toBeNull()
      }
      for (const partId of ALL_CAR_PART_IDS) {
        const installed = car.parts[partId].installed
        if (!installed) continue
        // `panels`/`paint`/`underbody` are derived from zone state
        // (`bodyPipeline.ts`) and the softening pass never touches metal (it
        // is money-free, so improving it would never lower the bill) - a
        // high-metal zone (from the original roll, or a surviving
        // money-free symptom cause) can pin the derived band below `mint`
        // PERMANENTLY even once the carrier's own money contribution is
        // fully exhausted at zero. The real claim for these three is "no
        // more money left to soften", not "band is mint".
        if (car.zoneState && isBodyDerivedPart(partId)) {
          expect(
            hasZoneImproveHeadroom(car.zoneState, partId),
            `${partId}: should have no money-improve headroom left under an impossible budget`,
          ).toBe(false)
          continue
        }
        expect(installed.band, `${partId} should have reverted to mint`).toBe('mint')
      }
    }
  })

  it('is deterministic: the same seed always rolls the same symptoms', () => {
    const guaranteedContext = buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      undefined,
      undefined,
      undefined,
      undefined,
      economyWithGuaranteedSymptom(),
    )
    for (const seed of [1, 7, 42]) {
      const first = generateAuctionCarInstance(
        ENTRY_MODEL,
        `det-${seed}`,
        createRng(seed),
        guaranteedContext,
        GAME_YEAR,
      )
      const second = generateAuctionCarInstance(
        ENTRY_MODEL,
        `det-${seed}`,
        createRng(seed),
        guaranteedContext,
        GAME_YEAR,
      )
      expect(second.symptoms).toEqual(first.symptoms)
      expect(second.apparentBandByPartId).toEqual(first.apparentBandByPartId)
    }
  })
})
