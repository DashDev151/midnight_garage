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
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GAME_YEAR = 1995
const SHITBOX_MODEL = CARS.find((c) => c.tier === 'shitbox')!

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
        shitbox: 1,
        common: 1,
        uncommon: 1,
        rare: 1,
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
        SHITBOX_MODEL,
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
        SHITBOX_MODEL,
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
        SHITBOX_MODEL,
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

  it('the Law 2 drop rule fires when a symptom would push the car over its bill ceiling - no symptom ever survives, and every part reverts to its pre-symptom (mint) band', () => {
    const impossibleBudget: EconomyConfig = {
      ...ECONOMY,
      partsGeneration: {
        ...ECONOMY.partsGeneration,
        maxBillFraction: 0.0001,
        // The core-loop floor is a separate mechanism from the Law 2 drop
        // rule this test targets - zeroed here so it never tops up a part
        // away from mint and confounds the "every part reverts to mint"
        // assertion below.
        minWorkBillFractionByTier: { shitbox: 0, common: 0, uncommon: 0, rare: 0 },
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
        SHITBOX_MODEL,
        `dropped-${seed}`,
        createRng(seed),
        guardedContext,
        GAME_YEAR,
      )
      // The pre-symptom softening pass's own second pass guarantees an
      // all-mint, zero-bill car under an unreachable budget - so if a
      // symptom had actually survived it would show up as a non-mint band.
      expect(
        car.symptoms,
        `seed ${seed}: no symptom should survive an impossible bill ceiling`,
      ).toEqual([])
      expect(car.apparentBandByPartId).toBeNull()
      for (const partId of ALL_CAR_PART_IDS) {
        const installed = car.parts[partId].installed
        if (!installed) continue
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
        SHITBOX_MODEL,
        `det-${seed}`,
        createRng(seed),
        guaranteedContext,
        GAME_YEAR,
      )
      const second = generateAuctionCarInstance(
        SHITBOX_MODEL,
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
