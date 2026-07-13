import {
  ECONOMY,
  PARTS_TAXONOMY,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  bandForMigratedCondition,
  bandIndex,
  canRepair,
  carCostToMintYen,
  climbBand,
  costToMintYen,
  costWeightedBandFactor,
  gradesBetween,
  groupCostToMintYen,
  isPartMissing,
  isPartPresent,
  planGroupRepair,
  presentPartIdsInGroup,
  repairLevelForGroup,
  restorationCostFactorForTier,
  scrapValueYen,
  slotsNeededToClimb,
  worstRepairableBandInGroup,
} from '../src/bands'
import { buildSimContext } from '../src/context'
import {
  buildCarInstance,
  groupCarParts,
  mintCarParts,
  testToolTiers,
  uniformCarParts,
} from './testFixtures'

/**
 * Sprint 26: unit tests for the band-math primitives every other condition-
 * aware sim module (jobs, staged work, market value, save migration) builds
 * on. No models/parts/buyers are needed for this module's own functions, so
 * those catalogs are empty; the taxonomy context is real content.
 */
const CONTEXT = buildSimContext([], [], [], PARTS_TAXONOMY)
const TAXONOMY_BY_ID = CONTEXT.partsTaxonomyById

/**
 * Sprint 32: `carCostToMintYen`/`groupCostToMintYen`/`costWeightedBandFactor`
 * gained a `model` parameter to decide whether an empty `forcedInduction`
 * slot is a real defect or legitimate absence. `TEST_MODEL` is Turbo-tagged
 * (so a filled-or-missing forcedInduction slot behaves like every other
 * part); `NA_MODEL` drops the tag for the tests that specifically exercise
 * legitimate absence.
 */
const TEST_MODEL: CarModel = {
  id: 'test-model',
  displayName: 'Test Model',
  brand: 'Test',
  parodyName: 'Test Model',
  parodyBrand: 'Test',
  spec: {
    chassisCode: 'TM',
    engineCode: 'TM',
    yearFrom: 1990,
    curbWeightKg: 1200,
    stockPowerPs: 150,
  },
  tier: 'common',
  tags: ['FR', 'Turbo', 'Piston', '90s', 'JDM'],
  bookValueYen: 1_000_000,
}

const NA_MODEL: CarModel = {
  ...TEST_MODEL,
  id: 'test-model-na',
  tags: ['FR', 'NA', 'Piston', '90s', 'JDM'],
}

/** Sprint 41: TEST_MODEL/NA_MODEL are both tier 'common' (factor 0.35 in the
 * real content). Tests that isolate the pre-Sprint-41 band-math sums (not
 * the tier-scaling feature itself) use this neutral override (every tier at
 * factor 1) so their expected values stay the plain `grades * stepCostYen`
 * arithmetic; the scaling itself gets its own dedicated tests below. */
const NEUTRAL_ECONOMY: EconomyConfig = {
  ...ECONOMY,
  restoration: { partsCostFactorByTier: { shitbox: 1, common: 1, uncommon: 1, rare: 1 } },
}

describe('bandIndex - ordering (worst to best: scrap, poor, worn, fine, mint)', () => {
  it('orders every band strictly worst to best', () => {
    expect(bandIndex('scrap')).toBeLessThan(bandIndex('poor'))
    expect(bandIndex('poor')).toBeLessThan(bandIndex('worn'))
    expect(bandIndex('worn')).toBeLessThan(bandIndex('fine'))
    expect(bandIndex('fine')).toBeLessThan(bandIndex('mint'))
  })
})

describe('gradesBetween', () => {
  it('counts the steps from a worse band up to a better one', () => {
    expect(gradesBetween('scrap', 'mint')).toBe(4)
    expect(gradesBetween('scrap', 'poor')).toBe(1)
    expect(gradesBetween('worn', 'fine')).toBe(1)
    expect(gradesBetween('poor', 'mint')).toBe(3)
  })

  it('is 0 for a band compared to itself', () => {
    expect(gradesBetween('fine', 'fine')).toBe(0)
  })

  it('is never negative - clamps to 0 when "to" is worse than "from"', () => {
    expect(gradesBetween('mint', 'scrap')).toBe(0)
    expect(gradesBetween('fine', 'worn')).toBe(0)
  })
})

describe('climbBand', () => {
  it('climbs the requested number of grades toward mint', () => {
    expect(climbBand('poor', 2)).toBe('fine')
    expect(climbBand('scrap', 2)).toBe('worn')
  })

  it('caps at mint - never overshoots past the top of the scale', () => {
    expect(climbBand('fine', 5)).toBe('mint')
    expect(climbBand('mint', 3)).toBe('mint')
  })

  it('never returns anything below "from" - zero or negative grades leave the band unchanged', () => {
    expect(climbBand('worn', 0)).toBe('worn')
    expect(climbBand('worn', -3)).toBe('worn')
  })
})

describe('canRepair (Sprint 26 decision 5: scrap is terminal; Sprint 41 decision 2: non-repairable consumables)', () => {
  const dampers = TAXONOMY_BY_ID.dampers // repairable
  const tyres = TAXONOMY_BY_ID.tyres // non-repairable (Sprint 41)

  it('is false only for scrap on a repairable part - every other band is repairable', () => {
    expect(canRepair('scrap', dampers)).toBe(false)
    expect(canRepair('poor', dampers)).toBe(true)
    expect(canRepair('worn', dampers)).toBe(true)
    expect(canRepair('fine', dampers)).toBe(true)
    expect(canRepair('mint', dampers)).toBe(true)
  })

  it('is false at every band for a non-repairable consumable, even a non-scrap one', () => {
    expect(canRepair('scrap', tyres)).toBe(false)
    expect(canRepair('poor', tyres)).toBe(false)
    expect(canRepair('worn', tyres)).toBe(false)
    expect(canRepair('fine', tyres)).toBe(false)
    expect(canRepair('mint', tyres)).toBe(false)
  })
})

describe('restorationCostFactorForTier (Sprint 41 decision 1)', () => {
  it('resolves the real content factor for each of the four roster tiers', () => {
    const { shitbox, common, uncommon, rare } = ECONOMY.restoration.partsCostFactorByTier
    expect(restorationCostFactorForTier('shitbox', ECONOMY)).toBe(shitbox)
    expect(restorationCostFactorForTier('common', ECONOMY)).toBe(common)
    expect(restorationCostFactorForTier('uncommon', ECONOMY)).toBe(uncommon)
    expect(restorationCostFactorForTier('rare', ECONOMY)).toBe(rare)
  })

  it('throws for a tier with no matching entry (gaisha/legend are not in the roster yet)', () => {
    expect(() => restorationCostFactorForTier('gaisha', ECONOMY)).toThrow()
    expect(() => restorationCostFactorForTier('legend', ECONOMY)).toThrow()
  })
})

describe('costToMintYen (Sprint 26 decision 5; Sprint 41 decisions 1-2: tier factor + non-repairable)', () => {
  const dampers = TAXONOMY_BY_ID.dampers // repairable
  const tyres = TAXONOMY_BY_ID.tyres // non-repairable

  it('is gradesToMint times stepCostYen times factor for a repairable band, rounded', () => {
    expect(costToMintYen('fine', dampers, 1)).toBe(1 * dampers.stepCostYen)
    expect(costToMintYen('worn', dampers, 1)).toBe(2 * dampers.stepCostYen)
    expect(costToMintYen('poor', dampers, 1)).toBe(3 * dampers.stepCostYen)
    expect(costToMintYen('poor', dampers, 0.35)).toBe(Math.round(3 * dampers.stepCostYen * 0.35))
  })

  it('is zero for a repairable part already at mint, regardless of factor', () => {
    expect(costToMintYen('mint', dampers, 1)).toBe(0)
    expect(costToMintYen('mint', dampers, 0.12)).toBe(0)
  })

  it('is stockReplacementPriceYen for scrap, FLAT - unscaled by factor, since there is no repair path to price', () => {
    expect(costToMintYen('scrap', dampers, 1)).toBe(dampers.stockReplacementPriceYen)
    expect(costToMintYen('scrap', dampers, 0.12)).toBe(dampers.stockReplacementPriceYen)
    expect(costToMintYen('scrap', dampers, 1)).not.toBe(4 * dampers.stepCostYen)
  })

  it('a non-repairable consumable below fine prices FLAT at stockReplacementPriceYen, unscaled by factor', () => {
    expect(costToMintYen('poor', tyres, 1)).toBe(tyres.stockReplacementPriceYen)
    expect(costToMintYen('worn', tyres, 1)).toBe(tyres.stockReplacementPriceYen)
    expect(costToMintYen('worn', tyres, 0.12)).toBe(tyres.stockReplacementPriceYen)
  })

  it('a non-repairable consumable at fine or mint prices at zero - a nearly-new consumable does not discount value', () => {
    expect(costToMintYen('fine', tyres, 1)).toBe(0)
    expect(costToMintYen('mint', tyres, 1)).toBe(0)
  })
})

describe('scrapValueYen (Sprint 26 decision 6: pennies on the yen)', () => {
  it('is stockReplacementPriceYen times scrapValueFraction, rounded', () => {
    const dampers = TAXONOMY_BY_ID.dampers
    expect(scrapValueYen(dampers, ECONOMY)).toBe(
      Math.round(dampers.stockReplacementPriceYen * ECONOMY.bands.scrapValueFraction),
    )
  })

  it('rounds a fractional yen amount to the nearest whole yen', () => {
    const oddPricedEntry: CarPartTaxonomyEntry = {
      ...TAXONOMY_BY_ID.dampers,
      stockReplacementPriceYen: 33333,
    }
    // 33333 * 0.05 = 1666.65 -> rounds to 1667.
    expect(scrapValueYen(oddPricedEntry, ECONOMY)).toBe(1667)
  })
})

describe('repairLevelForGroup (Sprint 26 decision 7; tier-sourced since Sprint 36)', () => {
  it('is 1 for a fresh (all tier-1) shop - the base hand-tools floor', () => {
    expect(repairLevelForGroup(testToolTiers(), 'engine')).toBe(1)
  })

  it('is exactly the tool line tier: 2 at tier 2, 3 at tier 3', () => {
    expect(repairLevelForGroup(testToolTiers({ engine: 3 }), 'engine')).toBe(3)
    expect(repairLevelForGroup(testToolTiers({ wheels: 2 }), 'wheels')).toBe(2)
  })

  it('reads only the requested group - an upgraded engine line never speeds up wheels', () => {
    expect(repairLevelForGroup(testToolTiers({ engine: 3 }), 'wheels')).toBe(1)
  })
})

describe('slotsNeededToClimb (Sprint 26 decision 7 worked examples)', () => {
  it('is 1 slot for fine to mint (1 grade) at level 1', () => {
    expect(slotsNeededToClimb(gradesBetween('fine', 'mint'), 1)).toBe(1)
  })

  it('is 1 slot for worn to mint (2 grades) at level 2', () => {
    expect(slotsNeededToClimb(gradesBetween('worn', 'mint'), 2)).toBe(1)
  })

  it('is 1 slot for poor to mint (3 grades) at level 3', () => {
    expect(slotsNeededToClimb(gradesBetween('poor', 'mint'), 3)).toBe(1)
  })

  it('rounds up when grades do not divide evenly by level', () => {
    expect(slotsNeededToClimb(3, 2)).toBe(2)
  })

  it('is 0 for zero or negative grades regardless of level', () => {
    expect(slotsNeededToClimb(0, 1)).toBe(0)
    expect(slotsNeededToClimb(-1, 3)).toBe(0)
  })
})

describe('planGroupRepair (Sprint 26 decisions 5+7+13; Sprint 41 decisions 1-2)', () => {
  // suspension group: dampers worn (2 grades), springs poor (3 grades),
  // steering scrap (unrepairable - excluded), antiRollBars fine (1 grade),
  // brakePadsDiscs worn (non-repairable consumable - excluded even though
  // it's not scrap, Sprint 41 decision 2), brakeCalipersLines stays mint
  // (nothing to do).
  const suspensionCar = buildCarInstance({
    parts: mintCarParts({
      dampers: 'worn',
      springs: 'poor',
      steering: 'scrap',
      antiRollBars: 'fine',
      brakePadsDiscs: 'worn',
    }),
  })

  it('sums labor slots and yen (at factor 1) across every non-mint, non-scrap, repairable present part, and excludes mint/scrap/non-repairable parts from partIds', () => {
    const plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
    )
    const dampers = TAXONOMY_BY_ID.dampers
    const springs = TAXONOMY_BY_ID.springs
    const antiRollBars = TAXONOMY_BY_ID.antiRollBars

    expect(plan.partIds).toEqual(['dampers', 'springs', 'antiRollBars'])
    // brakePadsDiscs (non-repairable) never enters the plan despite being
    // worn, not scrap - replace-only semantics, not just the terminal-scrap
    // exclusion.
    expect(plan.partIds).not.toContain('brakePadsDiscs')
    expect(plan.costYen).toBe(
      2 * dampers.stepCostYen + 3 * springs.stepCostYen + 1 * antiRollBars.stepCostYen,
    )
    // Tool line at tier 1 -> repair level 1: exactly 1 grade climbed per slot.
    expect(plan.laborSlotsRequired).toBe(2 + 3 + 1)
  })

  it('scales costYen by factor, rounded per part, without changing laborSlotsRequired or partIds', () => {
    const unscaled = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
    )
    const scaled = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      0.35,
    )
    const dampers = TAXONOMY_BY_ID.dampers
    const springs = TAXONOMY_BY_ID.springs
    const antiRollBars = TAXONOMY_BY_ID.antiRollBars
    const expectedScaledCost =
      Math.round(2 * dampers.stepCostYen * 0.35) +
      Math.round(3 * springs.stepCostYen * 0.35) +
      Math.round(1 * antiRollBars.stepCostYen * 0.35)

    expect(scaled.costYen).toBe(expectedScaledCost)
    expect(scaled.costYen).toBeLessThan(unscaled.costYen)
    expect(scaled.laborSlotsRequired).toBe(unscaled.laborSlotsRequired)
    expect(scaled.partIds).toEqual(unscaled.partIds)
  })

  it('costs the same yen regardless of repair level - only laborSlotsRequired changes with the tool tier', () => {
    const level1Plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
    )
    const level3Plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      testToolTiers({ suspension: 3 }),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
    )

    expect(level3Plan.costYen).toBe(level1Plan.costYen)
    expect(level3Plan.partIds).toEqual(level1Plan.partIds)
    expect(level3Plan.laborSlotsRequired).toBe(1 + 1 + 1)
    expect(level3Plan.laborSlotsRequired).toBeLessThan(level1Plan.laborSlotsRequired)
  })

  it('returns an empty plan when nothing in the group needs work', () => {
    const mintCar = buildCarInstance()
    const plan = planGroupRepair(
      mintCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
    )
    expect(plan).toEqual({ laborSlotsRequired: 0, costYen: 0, partIds: [] })
  })

  it('returns an empty plan when the group has repairable parts but every one is scrap or non-repairable', () => {
    const deadGroupCar = buildCarInstance({
      parts: mintCarParts({
        dampers: 'scrap',
        springs: 'scrap',
        antiRollBars: 'scrap',
        steering: 'scrap',
        brakePadsDiscs: 'worn', // non-repairable - never counts either
      }),
    })
    const plan = planGroupRepair(
      deadGroupCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
    )
    expect(plan).toEqual({ laborSlotsRequired: 0, costYen: 0, partIds: [] })
  })
})

describe('worstRepairableBandInGroup (Sprint 41 coordinator fix: the group BandPicker floor)', () => {
  it('is the worst REPAIRABLE band, excluding a scrap part that is actually worse', () => {
    const car = buildCarInstance({
      parts: mintCarParts({ dampers: 'worn', steering: 'scrap' }),
    })
    // The group's DISPLAY chip would read scrap (worst overall), but the
    // repair picker's floor must be 'worn' - the worst band a repair action
    // could actually move, since scrap is excluded from repair entirely.
    expect(
      worstRepairableBandInGroup(
        car,
        'suspension',
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
      ),
    ).toBe('worn')
  })

  it('is null when the group is scrap plus non-repairable consumables only - no repair control should render', () => {
    const car = buildCarInstance({
      parts: mintCarParts({
        dampers: 'mint',
        springs: 'mint',
        antiRollBars: 'mint',
        steering: 'scrap',
        brakePadsDiscs: 'poor', // non-repairable, even though it's badly worn
        brakeCalipersLines: 'mint',
      }),
    })
    expect(
      worstRepairableBandInGroup(
        car,
        'suspension',
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
      ),
    ).toBeNull()
  })

  it('is null for an all-mint group', () => {
    const car = buildCarInstance()
    expect(
      worstRepairableBandInGroup(
        car,
        'suspension',
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
      ),
    ).toBeNull()
  })
})

describe('costWeightedBandFactor (Sprint 26 decision 4 shim)', () => {
  const TOTAL_STOCK_WEIGHT_YEN = PARTS_TAXONOMY.reduce(
    (sum, entry) => sum + entry.stockReplacementPriceYen,
    0,
  )

  /** Independently-derived expected score for "every part mint except one
   * scrap part": mint minus that part's weight share of (mint - scrap). */
  function expectedFactorWithOneScrapPart(partId: CarPartId): number {
    const weight = TAXONOMY_BY_ID[partId].stockReplacementPriceYen
    const { mint, scrap } = ECONOMY.bands.bandFactors
    return mint - (weight / TOTAL_STOCK_WEIGHT_YEN) * (mint - scrap)
  }

  it("scores an otherwise-mint car with a scrap forcedInduction lower than one with a scrap brakePadsDiscs - the maintainer's worked case (turbo is the bigger part, so it drags the average further)", () => {
    const scrapTurboCar = buildCarInstance({
      parts: mintCarParts({ forcedInduction: 'scrap' }),
    })
    const scrapBrakesCar = buildCarInstance({
      parts: mintCarParts({ brakePadsDiscs: 'scrap' }),
    })

    const turboFactor = costWeightedBandFactor(scrapTurboCar, TEST_MODEL, TAXONOMY_BY_ID, ECONOMY)
    const brakesFactor = costWeightedBandFactor(scrapBrakesCar, TEST_MODEL, TAXONOMY_BY_ID, ECONOMY)

    expect(turboFactor).not.toBe(brakesFactor)
    expect(turboFactor).toBeLessThan(brakesFactor)
    expect(turboFactor).toBeCloseTo(expectedFactorWithOneScrapPart('forcedInduction'), 9)
    expect(brakesFactor).toBeCloseTo(expectedFactorWithOneScrapPart('brakePadsDiscs'), 9)
  })

  it('scores an all-poor car exactly at the poor band factor', () => {
    const car = buildCarInstance({ parts: uniformCarParts('poor') })
    expect(costWeightedBandFactor(car, TEST_MODEL, TAXONOMY_BY_ID, ECONOMY)).toBeCloseTo(
      ECONOMY.bands.bandFactors.poor,
      9,
    )
  })

  it('scores an all-mint car at 1.0', () => {
    const car = buildCarInstance()
    expect(costWeightedBandFactor(car, TEST_MODEL, TAXONOMY_BY_ID, ECONOMY)).toBe(1)
  })

  it('returns 1, not NaN, when the taxonomy has no matching entries so nothing contributes any weight (the zero-weight guard)', () => {
    // Sprint 32: every part now defaults to a present stock part, and the
    // only legitimately-absent slot (forcedInduction on an NA car) is just
    // one of 29 parts, so "nothing is present" can no longer be forced via
    // car-side overrides alone. An empty taxonomy makes every `entry` lookup
    // miss instead, which is the same "totalWeight never leaves 0" path.
    const car = buildCarInstance()
    const emptyTaxonomyById = {} as Readonly<Record<CarPartId, CarPartTaxonomyEntry>>
    expect(costWeightedBandFactor(car, TEST_MODEL, emptyTaxonomyById, ECONOMY)).toBe(1)
  })
})

describe('bandForMigratedCondition (Sprint 26 decision 11: save-migration thresholds)', () => {
  const { mint, fine, worn, poor } = ECONOMY.bands.migrationThresholds

  it('maps at and just below each breakpoint', () => {
    expect(bandForMigratedCondition(mint, ECONOMY)).toBe('mint')
    expect(bandForMigratedCondition(mint - 1, ECONOMY)).toBe('fine')
    expect(bandForMigratedCondition(fine, ECONOMY)).toBe('fine')
    expect(bandForMigratedCondition(fine - 1, ECONOMY)).toBe('worn')
    expect(bandForMigratedCondition(worn, ECONOMY)).toBe('worn')
    expect(bandForMigratedCondition(worn - 1, ECONOMY)).toBe('poor')
    expect(bandForMigratedCondition(poor, ECONOMY)).toBe('poor')
    expect(bandForMigratedCondition(poor - 1, ECONOMY)).toBe('scrap')
  })

  it('maps the extremes: 100 to mint, 0 to scrap', () => {
    expect(bandForMigratedCondition(100, ECONOMY)).toBe('mint')
    expect(bandForMigratedCondition(0, ECONOMY)).toBe('scrap')
  })
})

describe('isPartPresent and presentPartIdsInGroup (an empty forcedInduction slot)', () => {
  const naCar = buildCarInstance({ parts: mintCarParts({ forcedInduction: null }) })

  it('is false for an empty forcedInduction slot', () => {
    expect(isPartPresent(naCar, 'forcedInduction')).toBe(false)
  })

  it('is true for every other part', () => {
    for (const partId of Object.keys(naCar.parts) as CarPartId[]) {
      if (partId === 'forcedInduction') continue
      expect(isPartPresent(naCar, partId)).toBe(true)
    }
  })

  it('excludes the empty forcedInduction slot from its group, keeping every other engine part', () => {
    const present = presentPartIdsInGroup(naCar, 'engine', CONTEXT.partIdsByGroup)
    expect(present).not.toContain('forcedInduction')
    expect(present).toEqual(CONTEXT.partIdsByGroup.engine.filter((id) => id !== 'forcedInduction'))
  })
})

describe('isPartMissing (Sprint 32: a real defect vs. legitimate absence)', () => {
  it('is false for a filled slot, on either a Turbo or an NA model', () => {
    const car = buildCarInstance()
    expect(isPartMissing(car, TEST_MODEL, 'forcedInduction')).toBe(false)
    expect(isPartMissing(car, NA_MODEL, 'forcedInduction')).toBe(false)
  })

  it('is true for an empty forcedInduction slot on a Turbo-tagged model - a real defect', () => {
    const car = buildCarInstance({ parts: mintCarParts({ forcedInduction: null }) })
    expect(isPartMissing(car, TEST_MODEL, 'forcedInduction')).toBe(true)
  })

  it('is false for an empty forcedInduction slot on an NA-tagged model - legitimate absence', () => {
    const car = buildCarInstance({ parts: mintCarParts({ forcedInduction: null }) })
    expect(isPartMissing(car, NA_MODEL, 'forcedInduction')).toBe(false)
  })

  it('is true for an empty non-forcedInduction slot regardless of model', () => {
    const car = buildCarInstance({ parts: mintCarParts({ brakePadsDiscs: null }) })
    expect(isPartMissing(car, TEST_MODEL, 'brakePadsDiscs')).toBe(true)
    expect(isPartMissing(car, NA_MODEL, 'brakePadsDiscs')).toBe(true)
  })
})

describe('carCostToMintYen and groupCostToMintYen (sum across present parts)', () => {
  const ENGINE_PARTS_EXCLUDING_FI = [
    'block',
    'internals',
    'headValvetrain',
    'camsTiming',
    'intake',
    'exhaust',
    'fuelSystem',
    'ignitionEcu',
    'cooling',
  ] as const

  function buildWornEngineNaCar() {
    const parts = groupCarParts({ engine: 'worn' })
    parts.forcedInduction = { installed: null }
    return buildCarInstance({ parts })
  }

  it('sums costToMintYen across every present part in a group, excluding a legitimately-empty forcedInduction slot on an NA car even though it is also worn', () => {
    const car = buildWornEngineNaCar()
    const expectedCostExcludingFI = ENGINE_PARTS_EXCLUDING_FI.reduce(
      (sum, id) => sum + 2 * TAXONOMY_BY_ID[id].stepCostYen,
      0,
    )

    const groupCost = groupCostToMintYen(
      car,
      NA_MODEL,
      'engine',
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      NEUTRAL_ECONOMY,
    )
    expect(groupCost).toBe(expectedCostExcludingFI)
    // If the empty forcedInduction slot were wrongly counted, this would be
    // higher by its own worn-to-mint cost.
    expect(groupCost).not.toBe(
      expectedCostExcludingFI + 2 * TAXONOMY_BY_ID.forcedInduction.stepCostYen,
    )
  })

  it('a MISSING (non-FI) slot prices at the full stock replacement price, not a worn-to-mint step cost', () => {
    const parts = groupCarParts({ engine: 'worn' })
    parts.exhaust = { installed: null }
    const car = buildCarInstance({ parts })

    const groupCost = groupCostToMintYen(
      car,
      TEST_MODEL,
      'engine',
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      NEUTRAL_ECONOMY,
    )
    const otherEngineParts = ENGINE_PARTS_EXCLUDING_FI.filter((id) => id !== 'exhaust')
    const expectedCost =
      otherEngineParts.reduce((sum, id) => sum + 2 * TAXONOMY_BY_ID[id].stepCostYen, 0) +
      2 * TAXONOMY_BY_ID.forcedInduction.stepCostYen +
      TAXONOMY_BY_ID.exhaust.stockReplacementPriceYen
    expect(groupCost).toBe(expectedCost)
  })

  it('carCostToMintYen equals groupCostToMintYen("engine") here, since every other group stays mint', () => {
    const car = buildWornEngineNaCar()
    expect(carCostToMintYen(car, NA_MODEL, CONTEXT.partsTaxonomyById, NEUTRAL_ECONOMY)).toBe(
      groupCostToMintYen(
        car,
        NA_MODEL,
        'engine',
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        NEUTRAL_ECONOMY,
      ),
    )
  })

  it('carCostToMintYen sums correctly across a uniformly-fine whole car (at factor 1: non-repairable consumables contribute zero at fine, everything else its own stepCostYen)', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine') })
    const expectedTotal = PARTS_TAXONOMY.reduce(
      (sum, entry) => sum + (entry.repairable ? entry.stepCostYen : 0),
      0,
    )
    expect(carCostToMintYen(car, TEST_MODEL, CONTEXT.partsTaxonomyById, NEUTRAL_ECONOMY)).toBe(
      expectedTotal,
    )
  })

  it('carCostToMintYen scales a repairable part by the resolved tier factor - a common-tier car pays less than the unscaled sum', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine') })
    const unscaledTotal = PARTS_TAXONOMY.reduce(
      (sum, entry) => sum + (entry.repairable ? entry.stepCostYen : 0),
      0,
    )
    // TEST_MODEL.tier is 'common' - real content factor is < 1.
    expect(ECONOMY.restoration.partsCostFactorByTier.common).toBeLessThan(1)
    const scaledTotal = carCostToMintYen(car, TEST_MODEL, CONTEXT.partsTaxonomyById, ECONOMY)
    expect(scaledTotal).toBeLessThan(unscaledTotal)
  })
})
