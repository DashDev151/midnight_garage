import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarPartId,
  type CarModel,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { buildCarInstance, carWithGrades, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const ECONOMY = CONTEXT.economy

/**
 * Handling derives from grip alone, and this file is the guard on that.
 *
 * A part reaches the handling readout by exactly two routes and no third one:
 * its own `physicalModifiers.grip` (what the upgrade mechanically buys) and
 * its CONDITION, through the taxonomy's `statWeights.handling` column. There
 * is no additive per-part handling number any more, and the risk this file
 * exists to catch is that removing it took the condition weighting with it -
 * `StatModifierSchema` and the taxonomy's `statWeights` once shared one Zod
 * object, and the taxonomy column is the one that must survive.
 */

/** The four slots whose aftermarket SKUs carry a real `physicalModifiers.grip`
 * - read from the catalogue rather than hand-listed, so a future SKU gaining
 * or losing a grip modifier changes what this file tests rather than quietly
 * disagreeing with it. */
const GRIP_SLOTS: readonly CarPartId[] = [
  ...new Set(
    PARTS.filter((part) => (part.physicalModifiers?.grip ?? 1) > 1).map((part) => part.carPartId),
  ),
]

/** A slot whose SKUs move no physical dial at all - the sharp case for "a
 * purchased part cannot add handling outright". A close-ratio gearbox is a
 * real upgrade the game charges real money for, and it must leave the
 * handling READOUT exactly where it found it. */
const NO_GRIP_SLOT: CarPartId = 'gearbox'

function handlingOf(model: CarModel, car: CarInstance): number {
  return computeDerivedStats(model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY).handling
}

/** The same stock car twice, differing only in the band of its suspension
 * slots - `carWithGrades` bands the whole car at once, and the point here is
 * that suspension condition ALONE moves the number. */
function stockCarWithSuspensionBand(model: CarModel, band: 'mint' | 'worn' | 'scrap'): CarInstance {
  const overrides = Object.fromEntries(GRIP_SLOTS.map((slot) => [slot, band]))
  return buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
}

describe('handling responds to condition', () => {
  it('the catalogue really does carry grip modifiers on the four suspension slots', () => {
    expect([...GRIP_SLOTS].sort()).toEqual(['antiRollBars', 'chassis', 'dampers', 'springs'])
  })

  it('worn suspension reads lower handling than the same car at mint, all 26 shipped cars', () => {
    for (const model of CARS) {
      const mint = handlingOf(model, stockCarWithSuspensionBand(model, 'mint'))
      const worn = handlingOf(model, stockCarWithSuspensionBand(model, 'worn'))
      expect(worn, model.id).toBeLessThan(mint)
    }
  })

  it('scrap suspension reads lower still, so the response is a slope rather than one step', () => {
    for (const model of CARS) {
      const worn = handlingOf(model, stockCarWithSuspensionBand(model, 'worn'))
      const scrap = handlingOf(model, stockCarWithSuspensionBand(model, 'scrap'))
      expect(scrap, model.id).toBeLessThan(worn)
    }
  })
})

describe('handling responds to grip parts', () => {
  it('race coilovers read higher handling than the same car without them, all 26 shipped cars', () => {
    for (const model of CARS) {
      const stock = handlingOf(model, carWithGrades(model, CONTEXT, {}, 'mint'))
      const coilovers = handlingOf(
        model,
        carWithGrades(model, CONTEXT, { dampers: 'race' }, 'mint'),
      )
      expect(coilovers, model.id).toBeGreaterThan(stock)
    }
  })

  it('a full race suspension reads higher than race coilovers alone, all 26 shipped cars', () => {
    const fullRace = Object.fromEntries(GRIP_SLOTS.map((slot) => [slot, 'race' as const]))
    for (const model of CARS) {
      const coilovers = handlingOf(
        model,
        carWithGrades(model, CONTEXT, { dampers: 'race' }, 'mint'),
      )
      const everything = handlingOf(model, carWithGrades(model, CONTEXT, fullRace, 'mint'))
      expect(everything, model.id).toBeGreaterThan(coilovers)
    }
  })

  it('a worn race coilover delivers less of its own advantage than a mint one', () => {
    for (const model of CARS) {
      const mint = handlingOf(model, carWithGrades(model, CONTEXT, { dampers: 'race' }, 'mint'))
      const worn = handlingOf(model, carWithGrades(model, CONTEXT, { dampers: 'race' }, 'worn'))
      expect(worn, model.id).toBeLessThan(mint)
    }
  })
})

describe('a purchased part cannot add handling outright', () => {
  it('a race gearbox leaves handling exactly unmoved, all 26 shipped cars', () => {
    for (const model of CARS) {
      const stock = handlingOf(model, carWithGrades(model, CONTEXT, {}, 'mint'))
      const boxed = handlingOf(
        model,
        carWithGrades(model, CONTEXT, { [NO_GRIP_SLOT]: 'race' }, 'mint'),
      )
      expect(boxed, model.id).toBe(stock)
    }
  })

  it('the whole grade ladder in that slot reads identically - handling is blind to specification it cannot feel', () => {
    for (const grade of ['street', 'sport', 'race'] as const) {
      for (const model of CARS) {
        const stock = handlingOf(model, carWithGrades(model, CONTEXT, {}, 'mint'))
        const fitted = handlingOf(
          model,
          carWithGrades(model, CONTEXT, { [NO_GRIP_SLOT]: grade }, 'mint'),
        )
        expect(fitted, `${model.id} ${grade}`).toBe(stock)
      }
    }
  })
})
