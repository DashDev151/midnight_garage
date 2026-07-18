import {
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type StaffMember,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  bandForMigratedCondition,
  bandIndex,
  canRepair,
  carCostToMintYen,
  clampRepairTarget,
  climbBand,
  costToMintYen,
  costWeightedBandFactor,
  gradesBetween,
  groupCostToMintYen,
  isPartMissing,
  isPartPresent,
  planGroupRepair,
  planPartRepair,
  presentPartIdsInGroup,
  repairCeilingForLevel,
  repairLevelForGroup,
  scrapValueYen,
  energyToClimb,
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
 * on. Real `PARTS` are needed (Sprint 44: repair cost derives from an
 * installed instance's own catalog price, so the fixture cars' stock parts
 * must actually resolve).
 */
const CONTEXT = buildSimContext([], PARTS, [], PARTS_TAXONOMY)
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

/** Sprint 44: `repairStepFraction` at 1 isolates the plain `grades * price`
 * arithmetic from the real tuning value (0.15) - tests that check the
 * band-math sums themselves (not the scaling feature) use this neutral
 * override; the scaling itself gets its own dedicated tests below. */
const NEUTRAL_ECONOMY: EconomyConfig = {
  ...ECONOMY,
  restoration: { repairStepFraction: 1 },
}

// Sprint 94 (the energy bar): repair labour is measured in energy points now -
// `grades x energyPerGradeByTier[tier]`, no ceil. `EPG` is the content per-tier
// per-grade cost ({1:10, 2:6, 3:4}); `PER` is `pointsPerLabour` (10). Directive
// 17 case (a): every labour assertion below re-derives off these knobs.
const EPG = ECONOMY.energy.energyPerGradeByTier
const PER = ECONOMY.energy.pointsPerLabour

/** The real catalog price of whatever is actually installed at `partId` on
 * `car` - Sprint 44's repair cost derives from this, never a car/model
 * identity, so expected-value math in these tests reads it back the same
 * way the pipeline does rather than hardcoding a number that would silently
 * drift from the next catalog rebase. */
function installedPriceYen(car: CarInstance, partId: CarPartId): number {
  return CONTEXT.partsById[car.parts[partId].installed!.partId]!.priceYen
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

describe("costToMintYen (Sprint 26 decision 5; Sprint 44 decision 1: derived from the installed part's own price, never the host car)", () => {
  const dampers = TAXONOMY_BY_ID.dampers // repairable
  const tyres = TAXONOMY_BY_ID.tyres // non-repairable
  // Arbitrary - these tests prove the formula shape, not any specific
  // catalog tuning.
  const PART_PRICE_YEN = 100_000

  it('is gradesToMint times repairStepFraction times the part price for a repairable band, rounded', () => {
    expect(costToMintYen('fine', dampers, PART_PRICE_YEN, 0.15, 'common')).toBe(
      Math.round(1 * 0.15 * PART_PRICE_YEN),
    )
    expect(costToMintYen('worn', dampers, PART_PRICE_YEN, 0.15, 'common')).toBe(
      Math.round(2 * 0.15 * PART_PRICE_YEN),
    )
    expect(costToMintYen('poor', dampers, PART_PRICE_YEN, 0.15, 'common')).toBe(
      Math.round(3 * 0.15 * PART_PRICE_YEN),
    )
    expect(costToMintYen('poor', dampers, PART_PRICE_YEN, 0.35, 'common')).toBe(
      Math.round(3 * 0.35 * PART_PRICE_YEN),
    )
  })

  it('is zero for a repairable part already at mint, regardless of price or fraction', () => {
    expect(costToMintYen('mint', dampers, PART_PRICE_YEN, 0.15, 'common')).toBe(0)
    expect(costToMintYen('mint', dampers, PART_PRICE_YEN, 1, 'common')).toBe(0)
  })

  it("is the class's stock-replacement price for scrap, FLAT - unscaled by the installed instance's price or fraction, since there is no repair path to price", () => {
    expect(costToMintYen('scrap', dampers, PART_PRICE_YEN, 0.15, 'common')).toBe(
      dampers.stockReplacementPriceYenByClass.common,
    )
    expect(costToMintYen('scrap', dampers, PART_PRICE_YEN, 1, 'common')).toBe(
      dampers.stockReplacementPriceYenByClass.common,
    )
    expect(costToMintYen('scrap', dampers, PART_PRICE_YEN, 0.15, 'common')).not.toBe(
      Math.round(4 * 0.15 * PART_PRICE_YEN),
    )
  })

  it('a non-repairable consumable below fine prices FLAT at the class stock-replacement price, unscaled by price or fraction', () => {
    expect(costToMintYen('poor', tyres, PART_PRICE_YEN, 0.15, 'common')).toBe(
      tyres.stockReplacementPriceYenByClass.common,
    )
    expect(costToMintYen('worn', tyres, PART_PRICE_YEN, 0.15, 'common')).toBe(
      tyres.stockReplacementPriceYenByClass.common,
    )
    expect(costToMintYen('worn', tyres, PART_PRICE_YEN, 1, 'common')).toBe(
      tyres.stockReplacementPriceYenByClass.common,
    )
  })

  it('a non-repairable consumable at fine or mint prices at zero - a nearly-new consumable does not discount value', () => {
    expect(costToMintYen('fine', tyres, PART_PRICE_YEN, 0.15, 'common')).toBe(0)
    expect(costToMintYen('mint', tyres, PART_PRICE_YEN, 0.15, 'common')).toBe(0)
  })
})

describe('scrapValueYen (Sprint 26 decision 6: pennies on the yen)', () => {
  it('is the class stock-replacement price times scrapValueFraction, rounded', () => {
    const dampers = TAXONOMY_BY_ID.dampers
    expect(scrapValueYen(dampers, ECONOMY, 'common')).toBe(
      Math.round(dampers.stockReplacementPriceYenByClass.common * ECONOMY.bands.scrapValueFraction),
    )
  })

  it('rounds a fractional yen amount to the nearest whole yen', () => {
    const oddPricedEntry: CarPartTaxonomyEntry = {
      ...TAXONOMY_BY_ID.dampers,
      stockReplacementPriceYenByClass: {
        ...TAXONOMY_BY_ID.dampers.stockReplacementPriceYenByClass,
        common: 33333,
      },
    }
    // 33333 * 0.05 = 1666.65 -> rounds to 1667.
    expect(scrapValueYen(oddPricedEntry, ECONOMY, 'common')).toBe(1667)
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

describe('energyToClimb (Sprint 94: grades x energyPerGradeByTier[tier], no ceil)', () => {
  it('is one labour per grade at tier 1 (the day-1-unchanged baseline)', () => {
    expect(energyToClimb(gradesBetween('fine', 'mint'), 1, EPG)).toBe(1 * EPG[1])
  })

  it('costs grades x the tier-2 per-grade rate for worn to mint (2 grades) at level 2', () => {
    expect(energyToClimb(gradesBetween('worn', 'mint'), 2, EPG)).toBe(2 * EPG[2])
  })

  it('costs grades x the tier-3 per-grade rate for poor to mint (3 grades) at level 3', () => {
    expect(energyToClimb(gradesBetween('poor', 'mint'), 3, EPG)).toBe(3 * EPG[3])
  })

  it('scales linearly with no ceil (the finer granularity that replaces rounding up)', () => {
    expect(energyToClimb(3, 2, EPG)).toBe(3 * EPG[2])
  })

  it('is 0 for zero or negative grades regardless of level', () => {
    expect(energyToClimb(0, 1, EPG)).toBe(0)
    expect(energyToClimb(-1, 3, EPG)).toBe(0)
  })
})

describe("planGroupRepair (Sprint 26 decisions 5+7+13; Sprint 41 decision 2; Sprint 44 decision 1: cost derives from the installed part's own price; Sprint 71: surface-only)", () => {
  // body group (Sprint 71: the one all-surface group, so on-car repair still
  // applies to every member): panels worn (2 grades), paint poor (3 grades),
  // underbody scrap (unrepairable - excluded), aero fine (1 grade). No
  // non-repairable consumable lives in this group - that exclusion is
  // covered directly by `canRepair`'s own tests above, which every planner
  // (including this one) reuses rather than re-deriving.
  const bodyCar = buildCarInstance({
    parts: mintCarParts({
      panels: 'worn',
      paint: 'poor',
      underbody: 'scrap',
      aero: 'fine',
    }),
  })

  it('sums labor slots and yen across every non-mint, non-scrap, repairable present part, and excludes mint/scrap parts from partIds', () => {
    const plan = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1, // repairStepFraction = 1 isolates the grades*price arithmetic
      EPG,
    )
    const panelsPrice = installedPriceYen(bodyCar, 'panels')
    const paintPrice = installedPriceYen(bodyCar, 'paint')
    const aeroPrice = installedPriceYen(bodyCar, 'aero')

    expect(plan.partIds).toEqual(['panels', 'paint', 'aero'])
    expect(plan.costYen).toBe(2 * panelsPrice + 3 * paintPrice + 1 * aeroPrice)
    // Tool line at tier 1 -> repair level 1: each grade costs EPG[1] energy.
    expect(plan.laborSlotsRequired).toBe((2 + 3 + 1) * EPG[1])
  })

  it('scales costYen by repairStepFraction, rounded per part, without changing laborSlotsRequired or partIds', () => {
    const unscaled = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    const scaled = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      0.35,
      EPG,
    )
    const panelsPrice = installedPriceYen(bodyCar, 'panels')
    const paintPrice = installedPriceYen(bodyCar, 'paint')
    const aeroPrice = installedPriceYen(bodyCar, 'aero')
    const expectedScaledCost =
      Math.round(2 * panelsPrice * 0.35) +
      Math.round(3 * paintPrice * 0.35) +
      Math.round(1 * aeroPrice * 0.35)

    expect(scaled.costYen).toBe(expectedScaledCost)
    expect(scaled.costYen).toBeLessThan(unscaled.costYen)
    expect(scaled.laborSlotsRequired).toBe(unscaled.laborSlotsRequired)
    expect(scaled.partIds).toEqual(unscaled.partIds)
  })

  it('costs the same yen regardless of repair level - only laborSlotsRequired changes with the tool tier', () => {
    const level1Plan = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    const level3Plan = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers({ body: 3 }),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )

    expect(level3Plan.costYen).toBe(level1Plan.costYen)
    expect(level3Plan.partIds).toEqual(level1Plan.partIds)
    // Tier 3: each grade costs EPG[3] energy - strictly cheaper than tier 1, and
    // now a genuine fraction (no ceil rounding it up to a whole slot per part).
    expect(level3Plan.laborSlotsRequired).toBe((2 + 3 + 1) * EPG[3])
    expect(level3Plan.laborSlotsRequired).toBeLessThan(level1Plan.laborSlotsRequired)
  })

  it('returns an empty plan when nothing in the group needs work', () => {
    const mintCar = buildCarInstance()
    const plan = planGroupRepair(
      mintCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    expect(plan).toEqual({ laborSlotsRequired: 0, costYen: 0, partIds: [] })
  })

  it('returns an empty plan when the group has repairable parts but every one is scrap', () => {
    const deadGroupCar = buildCarInstance({
      parts: mintCarParts({
        panels: 'scrap',
        paint: 'scrap',
        underbody: 'scrap',
        aero: 'scrap',
      }),
    })
    const plan = planGroupRepair(
      deadGroupCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    expect(plan).toEqual({ laborSlotsRequired: 0, costYen: 0, partIds: [] })
  })

  it('returns an empty plan for a bolt-on/buried group - bench-only (Sprint 71)', () => {
    const suspensionCar = buildCarInstance({
      parts: mintCarParts({ dampers: 'worn', springs: 'poor' }),
    })
    const plan = planGroupRepair(
      suspensionCar,
      'suspension',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    expect(plan).toEqual({ laborSlotsRequired: 0, costYen: 0, partIds: [] })
  })
})

describe('planGroupRepair with benched crew (Sprint 82 decisions 2 + 5)', () => {
  // Same all-surface body group as above: base plan is 6 slots at tool tier 1
  // (panels worn 2 + paint poor 3 + aero fine 1), a known base cost.
  const bodyCar = buildCarInstance({
    parts: mintCarParts({ panels: 'worn', paint: 'poor', underbody: 'scrap', aero: 'fine' }),
  })
  const benchedBody = (skill: number, trait: StaffMember['trait'] = 'night-owl'): StaffMember => ({
    id: 'crew',
    displayName: 'crew',
    stats: { engine: 1, chassis: 1, body: skill },
    laborSlotsPerDay: 2,
    assignment: 'bench',
    pendingAssignment: null,
    weeklyWageYen: 4000,
    trait,
  })
  const planBody = (crew?: { staff: StaffMember[]; economy: EconomyConfig }) =>
    planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
      undefined,
      crew,
    )

  it('cuts the plan labour by the crew speed discount and leaves cost untouched without a perfectionist', () => {
    const base = planBody()
    const withCrew = planBody({ staff: [benchedBody(5)], economy: ECONOMY })
    // Base plan is (2+3+1) grades at tier 1 = 6 x EPG[1] energy. Body skill 5 ->
    // curve[5] = 2 labour saved = 2 x PER energy; base stays >= half, so - 2 x PER.
    expect(base.laborSlotsRequired).toBe((2 + 3 + 1) * EPG[1])
    expect(withCrew.laborSlotsRequired).toBe((2 + 3 + 1) * EPG[1] - 2 * PER)
    expect(withCrew.costYen).toBe(base.costYen)
    expect(withCrew.partIds).toEqual(base.partIds)
  })

  it('applies no speed discount for a low crew skill', () => {
    const withCrew = planBody({ staff: [benchedBody(2)], economy: ECONOMY })
    expect(withCrew.laborSlotsRequired).toBe((2 + 3 + 1) * EPG[1])
  })

  it('a benched perfectionist trims one saved labour and discounts repair cash cost', () => {
    const base = planBody()
    const withPerf = planBody({ staff: [benchedBody(5, 'perfectionist')], economy: ECONOMY })
    // Saved 2 - 1 (perfectionist) = 1 labour = 1 x PER, so base - 1 x PER.
    expect(withPerf.laborSlotsRequired).toBe((2 + 3 + 1) * EPG[1] - 1 * PER)
    expect(withPerf.costYen).toBe(
      Math.round(base.costYen * (1 - ECONOMY.staff.perfectionistPartsDiscount)),
    )
  })

  it('a contracted crew member has no effect', () => {
    const base = planBody()
    const contracted = { ...benchedBody(5), assignment: 'contract' as const }
    const withCrew = planBody({ staff: [contracted], economy: ECONOMY })
    expect(withCrew.laborSlotsRequired).toBe(base.laborSlotsRequired)
    expect(withCrew.costYen).toBe(base.costYen)
  })
})

describe('the band ceiling (Sprint 93: tools cap the finish)', () => {
  const CEILING = ECONOMY.repairBandCeilingByTier
  // A surface (body) group spread across bands, to show what the tier-1 ceiling
  // includes and excludes: panels worn, paint poor, aero already fine.
  const bodyCar = buildCarInstance({
    parts: mintCarParts({ panels: 'worn', paint: 'poor', aero: 'fine' }),
  })

  it('repairCeilingForLevel reads the content knob: tier-1 caps at fine, tier-2/3 reach mint', () => {
    expect(repairCeilingForLevel(1, ECONOMY)).toBe('fine')
    expect(repairCeilingForLevel(2, ECONOMY)).toBe('mint')
    expect(repairCeilingForLevel(3, ECONOMY)).toBe('mint')
  })

  it('clampRepairTarget lowers an above-ceiling target and leaves an at/below one alone', () => {
    expect(clampRepairTarget('mint', 'fine')).toBe('fine')
    expect(clampRepairTarget('worn', 'fine')).toBe('worn')
    expect(clampRepairTarget('mint', 'mint')).toBe('mint')
  })

  it('a tier-1 group repair toward mint stops at fine: an already-fine part drops out, and the plan sizes to the fine climb not the mint one', () => {
    const capped = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
      undefined,
      undefined,
      CEILING,
    )
    const uncapped = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    const panelsPrice = installedPriceYen(bodyCar, 'panels')
    const paintPrice = installedPriceYen(bodyCar, 'paint')
    // Capped to fine: panels worn->fine (1 grade), paint poor->fine (2 grades);
    // aero is already fine, so it has nothing to climb toward fine and drops out.
    expect(capped.partIds).toEqual(['panels', 'paint'])
    expect(capped.costYen).toBe(1 * panelsPrice + 2 * paintPrice)
    expect(capped.laborSlotsRequired).toBe((1 + 2) * EPG[1])
    // The unbounded band-math (no ceiling passed) still climbs every part one
    // further grade to mint AND lifts the already-fine aero - strictly more work.
    expect(uncapped.partIds).toEqual(['panels', 'paint', 'aero'])
    expect(uncapped.costYen).toBeGreaterThan(capped.costYen)
    expect(uncapped.laborSlotsRequired).toBeGreaterThan(capped.laborSlotsRequired)
  })

  it('a tier-2 group repair toward mint is unclamped - the tier-2 ceiling IS mint', () => {
    const t2 = testToolTiers({ body: 2 })
    const withCeiling = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      t2,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
      undefined,
      undefined,
      CEILING,
    )
    const withoutCeiling = planGroupRepair(
      bodyCar,
      'body',
      'mint',
      t2,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1,
      EPG,
    )
    expect(withCeiling.partIds).toEqual(withoutCeiling.partIds)
    expect(withCeiling.costYen).toBe(withoutCeiling.costYen)
    expect(withCeiling.laborSlotsRequired).toBe(withoutCeiling.laborSlotsRequired)
  })

  it('planPartRepair caps the achievable target at repairCeiling (a worn part toward mint reaches only fine under the tier-1 ceiling)', () => {
    const dampers = TAXONOMY_BY_ID.dampers // repairable
    const toMint = planPartRepair('worn', 'mint', 1, dampers, 100_000, 1, EPG)
    const toFineCeiling = planPartRepair('worn', 'mint', 1, dampers, 100_000, 1, EPG, 'fine')
    expect(toMint.costYen).toBe(2 * 100_000) // worn->mint = 2 grades, unbounded
    expect(toFineCeiling.costYen).toBe(1 * 100_000) // clamped to worn->fine = 1 grade
    expect(toFineCeiling.laborSlotsRequired).toBe(1 * EPG[1]) // worn->fine = 1 grade at tier 1
  })
})

describe('worstRepairableBandInGroup (Sprint 41 coordinator fix: the group BandPicker floor; Sprint 71: surface-only)', () => {
  it('is the worst REPAIRABLE band, excluding a scrap part that is actually worse', () => {
    const car = buildCarInstance({
      parts: mintCarParts({ panels: 'worn', underbody: 'scrap' }),
    })
    // The group's DISPLAY chip would read scrap (worst overall), but the
    // repair picker's floor must be 'worn' - the worst band a repair action
    // could actually move, since scrap is excluded from repair entirely.
    expect(
      worstRepairableBandInGroup(car, 'body', CONTEXT.partIdsByGroup, CONTEXT.partsTaxonomyById),
    ).toBe('worn')
  })

  it('is null when the group is scrap only - no repair control should render', () => {
    const car = buildCarInstance({
      parts: mintCarParts({
        panels: 'mint',
        paint: 'mint',
        aero: 'mint',
        underbody: 'scrap',
      }),
    })
    expect(
      worstRepairableBandInGroup(car, 'body', CONTEXT.partIdsByGroup, CONTEXT.partsTaxonomyById),
    ).toBeNull()
  })

  it('is null for an all-mint group', () => {
    const car = buildCarInstance()
    expect(
      worstRepairableBandInGroup(car, 'body', CONTEXT.partIdsByGroup, CONTEXT.partsTaxonomyById),
    ).toBeNull()
  })

  it('is null for a bolt-on/buried group, no matter how worn - bench-only (Sprint 71)', () => {
    const car = buildCarInstance({
      parts: mintCarParts({ dampers: 'worn', springs: 'poor' }),
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
})

describe('costWeightedBandFactor (Sprint 26 decision 4 shim)', () => {
  // TEST_MODEL is tier 'common' throughout this describe block.
  const TOTAL_STOCK_WEIGHT_YEN = PARTS_TAXONOMY.reduce(
    (sum, entry) => sum + entry.stockReplacementPriceYenByClass.common,
    0,
  )

  /** Independently-derived expected score for "every part mint except one
   * scrap part": mint minus that part's weight share of (mint - scrap). */
  function expectedFactorWithOneScrapPart(partId: CarPartId): number {
    const weight = TAXONOMY_BY_ID[partId].stockReplacementPriceYenByClass.common
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

describe("carCostToMintYen and groupCostToMintYen (sum across present parts; Sprint 44: priced off each installed instance's own catalog price)", () => {
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
      (sum, id) => sum + 2 * installedPriceYen(car, id),
      0,
    )

    const groupCost = groupCostToMintYen(
      car,
      NA_MODEL,
      'engine',
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      NEUTRAL_ECONOMY,
    )
    expect(groupCost).toBe(expectedCostExcludingFI)
    // If the empty forcedInduction slot were wrongly counted, this would be
    // higher - it has no installed instance to price at all when missing, so
    // the comparison instead just asserts a strictly lower total than adding
    // any positive amount would produce.
    expect(groupCost).toBeLessThan(expectedCostExcludingFI + 1)
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
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      NEUTRAL_ECONOMY,
    )
    const otherEngineParts = ENGINE_PARTS_EXCLUDING_FI.filter((id) => id !== 'exhaust')
    const expectedCost =
      otherEngineParts.reduce((sum, id) => sum + 2 * installedPriceYen(car, id), 0) +
      2 * installedPriceYen(car, 'forcedInduction') +
      TAXONOMY_BY_ID.exhaust.stockReplacementPriceYenByClass.common
    expect(groupCost).toBe(expectedCost)
  })

  it('carCostToMintYen equals groupCostToMintYen("engine") here, since every other group stays mint', () => {
    const car = buildWornEngineNaCar()
    expect(
      carCostToMintYen(
        car,
        NA_MODEL,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        NEUTRAL_ECONOMY,
      ),
    ).toBe(
      groupCostToMintYen(
        car,
        NA_MODEL,
        'engine',
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        NEUTRAL_ECONOMY,
      ),
    )
  })

  it('carCostToMintYen sums correctly across a uniformly-fine whole car (non-repairable consumables contribute zero at fine, everything else its installed price at repairStepFraction 1)', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine') })
    const expectedTotal = PARTS_TAXONOMY.reduce(
      (sum, entry) => sum + (entry.repairable ? installedPriceYen(car, entry.id) : 0),
      0,
    )
    expect(
      carCostToMintYen(
        car,
        TEST_MODEL,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        NEUTRAL_ECONOMY,
      ),
    ).toBe(expectedTotal)
  })

  it('carCostToMintYen scales every repairable part by economy.restoration.repairStepFraction - a smaller fraction pays less than a larger one', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine') })
    const unscaledTotal = carCostToMintYen(
      car,
      TEST_MODEL,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      NEUTRAL_ECONOMY,
    )
    // The real content's repairStepFraction is well under 1.
    expect(ECONOMY.restoration.repairStepFraction).toBeLessThan(1)
    const scaledTotal = carCostToMintYen(
      car,
      TEST_MODEL,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      ECONOMY,
    )
    expect(scaledTotal).toBeLessThan(unscaledTotal)
  })
})
