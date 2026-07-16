import { CARS, PARTS, BUYERS, PARTS_TAXONOMY, STORY_MISSIONS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carCostToBandYen } from '../src/bands'
import { buildSimContext } from '../src/context'
import { gradeMissionCar } from '../src/missions'
import { createInitialGameState } from '../src/newGame'
import { marketValueYen } from '../src/marketValue'
import { buildCarInstance, uniformCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function mission(id: string) {
  const found = STORY_MISSIONS.find((m) => m.id === id)
  if (!found) throw new Error(`fixture mission "${id}" missing from seed content`)
  return found
}

/**
 * Sprint 76 decision 5: every authored mission ships a satisfiability probe
 * - a concrete build recipe proven, by test, to (a) actually pass
 * `gradeMissionCar` and (b) leave the mission economically shippable
 * (`payoutYen >= 1.15 x C`, `budgetCapYen >= 1.05 x C`), where `C` is the
 * probe's own cost: the "before" car's `marketValueYen` at heat 100 (the
 * purchase proxy) plus whatever repair spend the recipe needs to reach its
 * "after" state (`carCostToBandYen` - the shared repair-atom sum every
 * on-car repair cost in the game already reduces to, decision reuse). This
 * sprint's two placeholders are deliberately the cheapest possible route
 * each - the real Sprint 78 campaign content re-applies this exact pattern
 * per mission, with its own real recipe.
 */
describe('story mission satisfiability probes (Sprint 76 decision 5)', () => {
  it('placeholder-a: a shitbox bought poor and repaired to worn satisfies roadworthy', () => {
    const model = CARS.find((c) => c.tier === 'shitbox')!
    const beforeCar = buildCarInstance({
      id: 'probe-a',
      modelId: model.id,
      parts: uniformCarParts('poor'),
    })
    const afterCar = { ...beforeCar, parts: uniformCarParts('worn') }

    const purchaseYen = marketValueYen(
      model,
      beforeCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const repairYen = carCostToBandYen(
      beforeCar,
      model,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
      'worn',
    )
    const probeCostYen = purchaseYen + repairYen

    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [afterCar] }
    const report = gradeMissionCar(state, 'placeholder-a', afterCar.id, CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)

    const target = mission('placeholder-a')
    expect(
      target.payoutYen,
      `placeholder-a payoutYen ${target.payoutYen} does not clear 1.15x probe cost ${probeCostYen}`,
    ).toBeGreaterThanOrEqual(1.15 * probeCostYen)
    expect(
      target.budgetCapYen,
      `placeholder-a budgetCapYen ${target.budgetCapYen} does not clear 1.05x probe cost ${probeCostYen}`,
    ).toBeGreaterThanOrEqual(1.05 * probeCostYen)
  })

  it('placeholder-b: a mint common car bought as-is already clears the power floor, no repair needed', () => {
    const model = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
    const car = buildCarInstance({ id: 'probe-b', modelId: model.id })

    const probeCostYen = marketValueYen(
      model,
      car,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )

    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [car] }
    const report = gradeMissionCar(state, 'placeholder-b', car.id, CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)

    const target = mission('placeholder-b')
    expect(
      target.payoutYen,
      `placeholder-b payoutYen ${target.payoutYen} does not clear 1.15x probe cost ${probeCostYen}`,
    ).toBeGreaterThanOrEqual(1.15 * probeCostYen)
    expect(
      target.budgetCapYen,
      `placeholder-b budgetCapYen ${target.budgetCapYen} does not clear 1.05x probe cost ${probeCostYen}`,
    ).toBeGreaterThanOrEqual(1.05 * probeCostYen)
  })
})
