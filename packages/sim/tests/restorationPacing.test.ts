import {
  ComponentIdSchema,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type ComponentId,
  type ToolTiers,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { buildCarInstance, groupCarParts, testToolTiers } from './testFixtures'

/**
 * A real, content-driven anchor for "how many days does a full
 * restoration take", built from explicit, hand-set condition fixtures
 * (`groupCarParts`) rather than the RNG-driven generator, so this stays
 * a stable anchor on the LABOUR economy specifically. The tool line's
 * TIER is the repair level, so the anchor compares an all-tier-1 shop
 * against an all-tier-3 one. Real `PARTS` are needed: `planGroupRepair`
 * resolves each installed instance's own catalog part to price it, and
 * skips anything it can't resolve - an empty parts catalog would
 * silently zero out every part's labor too, not just its cost.
 *
 * `planGroupRepair` excludes every `bolt-on`/`buried` slot from on-car
 * repair (bench-only), so this only measures the SURFACE portion of a
 * restoration - panels/paint/underbody/aero/seats/dashGauges/chassis -
 * not the whole car. The bulk of a real restoration runs through the
 * teardown loop (uninstall -> bench repair -> reinstall) instead, which
 * this file does not measure.
 */
const CONTEXT = buildSimContext([], PARTS, [], PARTS_TAXONOMY)
const ALL_GROUPS: readonly ComponentId[] = ComponentIdSchema.options

const ALL_TIER_ONE = testToolTiers()
const ALL_TIER_THREE = testToolTiers({
  engine: 3,
  drivetrain: 3,
  suspension: 3,
  wheels: 3,
  body: 3,
  interior: 3,
})

/** Total labour ENERGY to bring every present part in every group to
 * mint. */
function totalRestorationLaborSlots(car: CarInstance, toolTiers: ToolTiers): number {
  let total = 0
  for (const group of ALL_GROUPS) {
    total += planGroupRepair(
      car,
      group,
      'mint',
      toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1, // labor sizing is repairStepFraction-independent - this anchor is about labor, not cost
      CONTEXT.economy.energy.energyPerGradeByTier,
    ).laborSlotsRequired
  }
  return total
}

// The daily budget is a solo shop's energy pool (`basePoolPoints`), and
// the total above is energy, so days-to-restore stays a stable pacing
// anchor.
function daysToRestore(car: CarInstance, toolTiers: ToolTiers = ALL_TIER_ONE): number {
  return Math.ceil(
    totalRestorationLaborSlots(car, toolTiers) / CONTEXT.economy.energy.basePoolPoints,
  )
}

describe('restoration pacing anchor (Sprint 33 decision 7; tool tiers since Sprint 36)', () => {
  it('a typical worn used car, every line at tier 1, restores in a sane number of days', () => {
    const car = buildCarInstance({
      parts: groupCarParts({
        engine: 'worn',
        drivetrain: 'worn',
        suspension: 'worn',
        wheels: 'fine',
        body: 'worn',
        interior: 'fine',
      }),
    })
    const days = daysToRestore(car)
    // The anchor: a real, multi-day on-car job for the surface portion
    // alone, not a single click. Recalibrate this band deliberately if
    // PLAYER_BASE_LABOR_SLOTS, the tool-tier ladder, or the
    // surface/bolt-on/buried assignment moves again.
    expect(days).toBeGreaterThanOrEqual(1)
    expect(days).toBeLessThanOrEqual(8)
  })

  it('a genuinely rough (mostly poor) car still restores well under the old ~20-day pace', () => {
    const car = buildCarInstance({
      parts: groupCarParts({
        engine: 'poor',
        drivetrain: 'poor',
        suspension: 'poor',
        wheels: 'poor',
        body: 'poor',
        interior: 'poor',
      }),
    })
    expect(daysToRestore(car)).toBeLessThan(20)
  })

  it('an all-tier-3 shop restores the same car strictly faster than an all-tier-1 one', () => {
    const car = buildCarInstance({
      parts: groupCarParts({
        engine: 'worn',
        drivetrain: 'worn',
        suspension: 'worn',
        wheels: 'worn',
        body: 'worn',
        interior: 'worn',
      }),
    })
    const tierOneDays = daysToRestore(car, ALL_TIER_ONE)
    const tierThreeDays = daysToRestore(car, ALL_TIER_THREE)
    expect(tierThreeDays).toBeLessThan(tierOneDays)
  })

  it('a car already mostly mint needs little to no labor', () => {
    const car = buildCarInstance() // every part defaults to mint (testFixtures)
    expect(totalRestorationLaborSlots(car, ALL_TIER_ONE)).toBe(0)
  })
})
