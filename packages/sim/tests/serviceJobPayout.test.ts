import {
  BUYERS,
  CARS,
  EQUIPMENT,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartState,
  type ServiceJobTask,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { gradesBetween } from '../src/bands'
import { buildSimContext } from '../src/context'
import { gradeAtLeast, partFitsCar } from '../src/parts'
import { deriveServiceJobPayoutYen } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  EQUIPMENT,
)

/**
 * The single mandatory property test from `docs/sprints/sprint29.md`
 * decision 1: for EVERY template x EVERY roster model, the WORST payout
 * roll (`margin = marginMin`) covers the player's minimum achievable cost
 * by at least 1.15x. This structurally retires the Sprint 25 task 10
 * guaranteed-loss bug (an authored payout blind to real part prices) for
 * every current and future template, not just the four repriced by hand
 * that sprint.
 *
 * "Player's minimum achievable cost" is computed independently of
 * `deriveServiceJobPayoutYen`'s own cost basis (`serviceJobCostBreakdown`)
 * so this test cannot pass merely by re-deriving the same number twice: a
 * repair task's cost is genuinely deterministic (no player choice, so it's
 * the same number either way), but an install task's TRUE minimum is the
 * cheapest fitting part across the full "grade >= minGrade" set - a
 * strictly wider set than the payout formula's own narrowed
 * median-of-the-tightest-fitting-tier basis (see `deriveServiceJobPayoutYen`'s
 * doc comment for why that narrowing can only ever price a task at or above
 * this test's true minimum, never below it).
 */
function playerMinCostYen(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
): number {
  let total = 0
  for (const task of tasks) {
    if (task.action === 'repair') {
      const entry = CONTEXT.partsTaxonomyById[task.carPartId]!
      const band = car.parts[task.carPartId].band
      if (band === 'scrap') continue // unrepairable - nothing to charge, already "done"
      total += gradesBetween(band, task.targetBand) * entry.stepCostYen
    } else {
      const group = CONTEXT.partsTaxonomyById[task.carPartId]!.group
      const fitting = CONTEXT.parts.filter(
        (part) =>
          partFitsCar(part, model, group, CONTEXT.partsTaxonomyById, task.carPartId) &&
          gradeAtLeast(part.grade, task.minGrade),
      )
      const cheapest = Math.min(...fitting.map((part) => part.priceYen))
      total += Number.isFinite(cheapest) ? cheapest : 0
    }
  }
  return total
}

/** Every repair task's part set to `band` - the worst-case (furthest from
 * target, still repairable) starting condition, maximizing the repair-side
 * cost this template/model pair could plausibly charge. Install tasks are
 * untouched (their cost basis never depends on the car's own condition). */
function worstCaseParts(
  tasks: readonly ServiceJobTask[],
  band: CarPartState['band'],
): Partial<Record<CarPartId, Partial<CarPartState>>> {
  const overrides: Partial<Record<CarPartId, Partial<CarPartState>>> = {}
  for (const task of tasks) {
    if (task.action === 'repair') overrides[task.carPartId] = { band }
  }
  return overrides
}

describe('service-job payout profitability invariant (Sprint 29 decision 1)', () => {
  const REQUIRED_COVERAGE = 1.15

  it('the worst payout roll covers the player minimum achievable cost by at least 1.15x, for every template x every roster model, at every realistic starting band', () => {
    const marginMin = CONTEXT.economy.serviceJobs.marginMin
    const startingBands: CarPartState['band'][] = ['poor', 'worn', 'fine', 'scrap']
    const failures: string[] = []

    for (const template of SERVICE_JOB_TYPES) {
      for (const model of CARS) {
        for (const band of startingBands) {
          const car = buildCarInstance({
            modelId: model.id,
            parts: mintCarParts(worstCaseParts(template.tasks, band)),
          })
          const worstPayout = deriveServiceJobPayoutYen(
            template.tasks,
            car,
            model,
            CONTEXT,
            marginMin,
          )
          const minCost = playerMinCostYen(template.tasks, car, model)
          if (minCost === 0) continue // nothing to cover (e.g. every task already scrap/satisfied)
          const coverage = worstPayout / minCost
          if (coverage < REQUIRED_COVERAGE) {
            failures.push(
              `${template.id} x ${model.id} x starting ${band}: worst payout ${worstPayout} / ` +
                `min cost ${minCost} = ${coverage.toFixed(3)}x (needs >= ${REQUIRED_COVERAGE}x)`,
            )
          }
        }
      }
    }

    expect(
      failures,
      `${failures.length} template x model x band combinations under-covered:\n${failures.join('\n')}`,
    ).toEqual([])
  })

  it('every template has at least one task, and every task addresses a real catalog-covered part', () => {
    for (const template of SERVICE_JOB_TYPES) {
      expect(template.tasks.length, `template "${template.id}" has no tasks`).toBeGreaterThan(0)
      for (const task of template.tasks) {
        expect(
          CONTEXT.partsTaxonomyById[task.carPartId],
          `template "${template.id}" task addresses unknown part "${task.carPartId}"`,
        ).toBeDefined()
      }
    }
  })
})
