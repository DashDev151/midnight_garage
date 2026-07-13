import {
  ComponentIdSchema,
  PARTS_TAXONOMY,
  type CarInstance,
  type ComponentId,
  type ToolTiers,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planGroupRepair } from '../src/bands'
import { PLAYER_BASE_LABOR_SLOTS } from '../src/constants'
import { buildSimContext } from '../src/context'
import { buildCarInstance, groupCarParts, testToolTiers } from './testFixtures'

/**
 * Sprint 33 decision 7 (labor recalibration): a real, content-driven anchor
 * for "how many days does a full restoration take" - the exact playtest
 * complaint (base 2 labor slots against the 29-part repair granularity made
 * a full restore take ~20 days). Deliberately built from an explicit,
 * hand-set condition fixture (`groupCarParts`) rather than the RNG-driven
 * generator, so this stays a stable anchor on the LABOR economy specifically
 * and doesn't also couple to whatever the generation-condition curve
 * (decision 6) happens to roll on a given seed. Sprint 36 re-anchors the
 * tooling axis: the tool line's TIER is the repair level now, so the anchor
 * compares an all-tier-1 shop against an all-tier-3 one.
 */
const CONTEXT = buildSimContext([], [], [], PARTS_TAXONOMY)
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

/** Total labor slots to bring every present part in every group to mint. */
function totalRestorationLaborSlots(car: CarInstance, toolTiers: ToolTiers): number {
  let total = 0
  for (const group of ALL_GROUPS) {
    total += planGroupRepair(
      car,
      group,
      'mint',
      toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1, // labor sizing is tier-factor-independent - this anchor is about labor, not cost
    ).laborSlotsRequired
  }
  return total
}

function daysToRestore(car: CarInstance, toolTiers: ToolTiers = ALL_TIER_ONE): number {
  return Math.ceil(totalRestorationLaborSlots(car, toolTiers) / PLAYER_BASE_LABOR_SLOTS)
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
    // The anchor: a multi-day restoration project, not a single click and not
    // the old ~20-day war of attrition. Recalibrate this band deliberately if
    // PLAYER_BASE_LABOR_SLOTS or the tool-tier ladder moves again.
    expect(days).toBeGreaterThanOrEqual(3)
    expect(days).toBeLessThanOrEqual(15)
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
