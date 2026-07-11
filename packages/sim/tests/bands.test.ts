import {
  ECONOMY,
  EQUIPMENT,
  PARTS_TAXONOMY,
  type CarPartId,
  type CarPartTaxonomyEntry,
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
  isPartPresent,
  planGroupRepair,
  presentPartIdsInGroup,
  repairLevelForGroup,
  scrapValueYen,
  slotsNeededToClimb,
} from '../src/bands'
import { buildSimContext } from '../src/context'
import { buildCarInstance, groupCarParts, mintCarParts, uniformCarParts } from './testFixtures'

/**
 * Sprint 26: unit tests for the band-math primitives every other condition-
 * aware sim module (jobs, staged work, market value, save migration) builds
 * on. No models/parts/buyers are needed for this module's own functions, so
 * those catalogs are empty; the taxonomy/equipment context is real content.
 */
const CONTEXT = buildSimContext([], [], [], PARTS_TAXONOMY, [], undefined, [], EQUIPMENT)
const TAXONOMY_BY_ID = CONTEXT.partsTaxonomyById

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

describe('canRepair (Sprint 26 decision 5: scrap is terminal)', () => {
  it('is false only for scrap - every other band is repairable', () => {
    expect(canRepair('scrap')).toBe(false)
    expect(canRepair('poor')).toBe(true)
    expect(canRepair('worn')).toBe(true)
    expect(canRepair('fine')).toBe(true)
    expect(canRepair('mint')).toBe(true)
  })
})

describe('costToMintYen (Sprint 26 decision 5: the one atom valuation)', () => {
  const dampers = TAXONOMY_BY_ID.dampers

  it('is gradesToMint times stepCostYen for a repairable band', () => {
    expect(costToMintYen('fine', dampers)).toBe(1 * dampers.stepCostYen)
    expect(costToMintYen('worn', dampers)).toBe(2 * dampers.stepCostYen)
    expect(costToMintYen('poor', dampers)).toBe(3 * dampers.stepCostYen)
  })

  it('is zero for a part already at mint', () => {
    expect(costToMintYen('mint', dampers)).toBe(0)
  })

  it('is stockReplacementPriceYen for scrap - there is no repair path to price', () => {
    expect(costToMintYen('scrap', dampers)).toBe(dampers.stockReplacementPriceYen)
    expect(costToMintYen('scrap', dampers)).not.toBe(4 * dampers.stepCostYen)
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

describe('repairLevelForGroup (Sprint 26 decision 7)', () => {
  it('defaults to level 1 (base hand tools) when nothing is owned', () => {
    expect(repairLevelForGroup([], 'engine', CONTEXT.equipmentById)).toBe(1)
  })

  it('sets the level from the best owned equipment covering the group', () => {
    expect(repairLevelForGroup(['engine-crane'], 'engine', CONTEXT.equipmentById)).toBe(3)
    expect(repairLevelForGroup(['tire-machine'], 'wheels', CONTEXT.equipmentById)).toBe(2)
  })

  it('takes the higher level when two owned tools both cover the same group', () => {
    expect(
      repairLevelForGroup(['brake-lathe', 'suspension-press'], 'suspension', CONTEXT.equipmentById),
    ).toBe(3)
  })

  it('ignores equipment that covers a different group entirely', () => {
    expect(repairLevelForGroup(['engine-crane'], 'wheels', CONTEXT.equipmentById)).toBe(1)
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

describe('planGroupRepair (Sprint 26 decisions 5+7+13)', () => {
  // suspension group: dampers worn (2 grades), springs poor (3 grades),
  // steering scrap (unrepairable - excluded), brakePadsDiscs fine (1 grade),
  // antiRollBars/brakeCalipersLines stay mint (nothing to do).
  const suspensionCar = buildCarInstance({
    parts: mintCarParts({
      dampers: { band: 'worn' },
      springs: { band: 'poor' },
      steering: { band: 'scrap' },
      brakePadsDiscs: { band: 'fine' },
    }),
  })

  it('sums labor slots and yen across every non-mint, non-scrap present part, and excludes mint/scrap parts from partIds', () => {
    const plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      [],
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      CONTEXT.equipmentById,
    )
    const dampers = TAXONOMY_BY_ID.dampers
    const springs = TAXONOMY_BY_ID.springs
    const brakePadsDiscs = TAXONOMY_BY_ID.brakePadsDiscs

    expect(plan.partIds).toEqual(['dampers', 'springs', 'brakePadsDiscs'])
    expect(plan.costYen).toBe(
      2 * dampers.stepCostYen + 3 * springs.stepCostYen + 1 * brakePadsDiscs.stepCostYen,
    )
    // No equipment owned -> repair level 1: exactly 1 grade climbed per slot.
    expect(plan.laborSlotsRequired).toBe(2 + 3 + 1)
  })

  it('costs the same yen regardless of repair level - only laborSlotsRequired changes with equipment', () => {
    const level1Plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      [],
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      CONTEXT.equipmentById,
    )
    const level3Plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      ['suspension-press'],
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      CONTEXT.equipmentById,
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
      [],
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      CONTEXT.equipmentById,
    )
    expect(plan).toEqual({ laborSlotsRequired: 0, costYen: 0, partIds: [] })
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
      parts: mintCarParts({ forcedInduction: { band: 'scrap' } }),
    })
    const scrapBrakesCar = buildCarInstance({
      parts: mintCarParts({ brakePadsDiscs: { band: 'scrap' } }),
    })

    const turboFactor = costWeightedBandFactor(scrapTurboCar, TAXONOMY_BY_ID, ECONOMY)
    const brakesFactor = costWeightedBandFactor(scrapBrakesCar, TAXONOMY_BY_ID, ECONOMY)

    expect(turboFactor).not.toBe(brakesFactor)
    expect(turboFactor).toBeLessThan(brakesFactor)
    expect(turboFactor).toBeCloseTo(expectedFactorWithOneScrapPart('forcedInduction'), 9)
    expect(brakesFactor).toBeCloseTo(expectedFactorWithOneScrapPart('brakePadsDiscs'), 9)
  })

  it('scores an all-poor car exactly at the poor band factor', () => {
    const car = buildCarInstance({ parts: uniformCarParts('poor') })
    expect(costWeightedBandFactor(car, TAXONOMY_BY_ID, ECONOMY)).toBeCloseTo(
      ECONOMY.bands.bandFactors.poor,
      9,
    )
  })

  it('scores an all-mint car at 1.0', () => {
    const car = buildCarInstance()
    expect(costWeightedBandFactor(car, TAXONOMY_BY_ID, ECONOMY)).toBe(1)
  })

  it('returns 1, not NaN, when no part is present at all (the zero-weight guard)', () => {
    const parts = mintCarParts()
    for (const partId of Object.keys(parts) as CarPartId[]) {
      parts[partId] = { ...parts[partId], fitted: false }
    }
    const car = buildCarInstance({ parts })
    expect(costWeightedBandFactor(car, TAXONOMY_BY_ID, ECONOMY)).toBe(1)
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

describe('isPartPresent and presentPartIdsInGroup (the unfitted forcedInduction slot)', () => {
  const naCar = buildCarInstance({ parts: mintCarParts({ forcedInduction: { fitted: false } }) })

  it('is false for an unfitted forcedInduction slot', () => {
    expect(isPartPresent(naCar, 'forcedInduction')).toBe(false)
  })

  it('is true for every other part', () => {
    for (const partId of Object.keys(naCar.parts) as CarPartId[]) {
      if (partId === 'forcedInduction') continue
      expect(isPartPresent(naCar, partId)).toBe(true)
    }
  })

  it('excludes the unfitted forcedInduction slot from its group, keeping every other engine part', () => {
    const present = presentPartIdsInGroup(naCar, 'engine', CONTEXT.partIdsByGroup)
    expect(present).not.toContain('forcedInduction')
    expect(present).toEqual(CONTEXT.partIdsByGroup.engine.filter((id) => id !== 'forcedInduction'))
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
    parts.forcedInduction = { ...parts.forcedInduction, fitted: false }
    return buildCarInstance({ parts })
  }

  it('sums costToMintYen across every present part in a group, excluding an unfitted forcedInduction slot even though it is also worn', () => {
    const car = buildWornEngineNaCar()
    const expectedCostExcludingFI = ENGINE_PARTS_EXCLUDING_FI.reduce(
      (sum, id) => sum + 2 * TAXONOMY_BY_ID[id].stepCostYen,
      0,
    )

    const groupCost = groupCostToMintYen(
      car,
      'engine',
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
    )
    expect(groupCost).toBe(expectedCostExcludingFI)
    // If the unfitted forcedInduction slot were wrongly counted, this would
    // be higher by its own worn-to-mint cost.
    expect(groupCost).not.toBe(
      expectedCostExcludingFI + 2 * TAXONOMY_BY_ID.forcedInduction.stepCostYen,
    )
  })

  it('carCostToMintYen equals groupCostToMintYen("engine") here, since every other group stays mint', () => {
    const car = buildWornEngineNaCar()
    expect(carCostToMintYen(car, CONTEXT.partsTaxonomyById)).toBe(
      groupCostToMintYen(car, 'engine', CONTEXT.partIdsByGroup, CONTEXT.partsTaxonomyById),
    )
  })

  it('carCostToMintYen sums correctly across a uniformly-fine whole car', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine') })
    const expectedTotal = PARTS_TAXONOMY.reduce((sum, entry) => sum + entry.stepCostYen, 0)
    expect(carCostToMintYen(car, CONTEXT.partsTaxonomyById)).toBe(expectedTotal)
  })
})
