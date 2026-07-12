import {
  ComponentIdSchema,
  EQUIPMENT,
  PARTS_TAXONOMY,
  type CarInstance,
  type ComponentId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planGroupRepair } from '../src/bands'
import { PLAYER_BASE_LABOR_SLOTS } from '../src/constants'
import { buildSimContext } from '../src/context'
import { buildCarInstance, groupCarParts } from './testFixtures'

/**
 * Sprint 33 decision 7 (labor recalibration): a real, content-driven anchor
 * for "how many days does a full restoration take" - the exact playtest
 * complaint (base 2 labor slots against the 29-part repair granularity made
 * a full restore take ~20 days). Deliberately built from an explicit,
 * hand-set condition fixture (`groupCarParts`) rather than the RNG-driven
 * generator, so this stays a stable anchor on the LABOR economy specifically
 * and doesn't also couple to whatever the generation-condition curve
 * (decision 6) happens to roll on a given seed.
 */
const CONTEXT = buildSimContext([], [], [], PARTS_TAXONOMY, [], undefined, [], EQUIPMENT)
const ALL_GROUPS: readonly ComponentId[] = ComponentIdSchema.options

/** Total labor slots to bring every present part in every group to mint. */
function totalRestorationLaborSlots(
  car: CarInstance,
  ownedEquipmentIds: readonly string[] = [],
): number {
  let total = 0
  for (const group of ALL_GROUPS) {
    total += planGroupRepair(
      car,
      group,
      'mint',
      ownedEquipmentIds,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      CONTEXT.equipmentById,
    ).laborSlotsRequired
  }
  return total
}

function daysToRestore(car: CarInstance, ownedEquipmentIds: readonly string[] = []): number {
  return Math.ceil(totalRestorationLaborSlots(car, ownedEquipmentIds) / PLAYER_BASE_LABOR_SLOTS)
}

describe('restoration pacing anchor (Sprint 33 decision 7)', () => {
  it('a typical worn used car, base hand tools only, restores in a sane number of days', () => {
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
    // PLAYER_BASE_LABOR_SLOTS or the repair-level ladder moves again.
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

  it('owning the full equipment roster speeds up the same restoration', () => {
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
    const baseDays = daysToRestore(car)
    const equippedDays = daysToRestore(
      car,
      EQUIPMENT.map((e) => e.id),
    )
    expect(equippedDays).toBeLessThan(baseDays)
  })

  it('a car already mostly mint needs little to no labor', () => {
    const car = buildCarInstance() // every part defaults to mint (testFixtures)
    expect(totalRestorationLaborSlots(car)).toBe(0)
  })
})
