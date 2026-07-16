import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type ServiceJobTask,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { canRepair, gradesBetween } from '../src/bands'
import { buildSimContext } from '../src/context'
import { installLaborSlotsFor } from '../src/jobs'
import { gradeAtLeast, partFitsCar } from '../src/parts'
import { deriveServiceJobPayoutYen, serviceJobCostBreakdown } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
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
 * so this test cannot pass merely by re-deriving the same number twice.
 *
 * Sprint 72 (outcome-based service jobs): a band-only requirement (former
 * `repair`) prices the bench-repair route when the slot is repairable and
 * not scrap - genuinely deterministic (no player choice, so it's the same
 * number either way - Sprint 44: derived from the installed instance's own
 * catalog price). Decision 1 retires "scrap/missing already counts as
 * done," so BOTH now fall through to the buy-new route below instead of
 * contributing 0 - the same fallback a grade-requirement task (former
 * `install`) always uses. A grade-requirement task's TRUE minimum is the
 * cheapest fitting part across the full "grade >= minGrade" set - a
 * strictly wider set than the payout formula's own narrowed median-of-the-
 * tightest-fitting-tier basis (see `deriveServiceJobPayoutYen`'s doc
 * comment for why that narrowing can only ever price a task at or above
 * this test's true minimum, never below it).
 */
function playerMinCostYen(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
): number {
  const { repairStepFraction } = CONTEXT.economy.restoration
  let total = 0
  for (const task of tasks) {
    const { carPartId, minBand, minGrade } = task.requirement
    const entry = CONTEXT.partsTaxonomyById[carPartId]!
    const installed = car.parts[carPartId].installed

    if (!minGrade && installed && canRepair(installed.band, entry)) {
      const catalogPart = CONTEXT.partsById[installed.partId]
      if (!catalogPart) continue
      total += Math.round(
        gradesBetween(installed.band, minBand) * repairStepFraction * catalogPart.priceYen,
      )
      continue
    }

    // The buy-new route: a grade requirement, or a band-only requirement
    // the slot can't reach by repair (scrap, missing, or non-repairable) -
    // decision 1 means neither of the latter two is "already done" anymore.
    const fitting = CONTEXT.parts.filter(
      (part) =>
        partFitsCar(part, model, entry.group, CONTEXT.partsTaxonomyById, carPartId) &&
        gradeAtLeast(part.grade, minGrade ?? 'stock'),
    )
    const cheapest = Math.min(...fitting.map((part) => part.priceYen))
    total += Number.isFinite(cheapest) ? cheapest : 0
  }
  return total
}

/** Every band-only task's part set to `band` - the worst-case (furthest from
 * target, still repairable) starting condition, maximizing the repair-side
 * cost this template/model pair could plausibly charge. Grade-requirement
 * tasks are untouched (their cost basis never depends on the car's own
 * condition - always the buy-new route, regardless of what's installed). */
function worstCaseParts(
  tasks: readonly ServiceJobTask[],
  band: ConditionBand,
): Partial<Record<CarPartId, ConditionBand>> {
  const overrides: Partial<Record<CarPartId, ConditionBand>> = {}
  for (const task of tasks) {
    if (!task.requirement.minGrade) overrides[task.requirement.carPartId] = band
  }
  return overrides
}

describe('service-job payout profitability invariant (Sprint 29 decision 1)', () => {
  const REQUIRED_COVERAGE = 1.15

  it('the worst payout roll covers the player minimum achievable cost by at least 1.15x, for every template x every roster model, at every realistic starting band', () => {
    const marginMin = CONTEXT.economy.serviceJobs.marginMin
    const startingBands: ConditionBand[] = ['poor', 'worn', 'fine', 'scrap']
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
          if (minCost === 0) continue // nothing to cover - every task already genuinely satisfied
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

  /**
   * Sprint 72 task 7: a template addressing genuinely deep (buried) parts
   * with real `blockedBy` chains - `internals` (blocked by `headValvetrain`)
   * and `headValvetrain` (blocked by `camsTiming`, `intake`) - proving
   * decision 6's teardown-chain premium is actually live for real content,
   * not just theoretically wired, and that the worst-margin payout still
   * clears the same Law 4 floor as the blanket sweep above once that premium
   * is folded in.
   */
  it('a deep-slot job (engine-internals-rebuild) prices the full teardown chain, and the worst-margin payout still clears the floor', () => {
    const template = SERVICE_JOB_TYPES.find((t) => t.id === 'engine-internals-rebuild')
    if (!template) {
      throw new Error(
        'fixture template "engine-internals-rebuild" missing from content - update the test',
      )
    }
    const model = CARS[0]!
    const car = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
    const marginMin = CONTEXT.economy.serviceJobs.marginMin

    const breakdown = serviceJobCostBreakdown(template.tasks, car, model, CONTEXT)
    const bareInstallSlots = template.tasks.reduce(
      (sum, task) => sum + installLaborSlotsFor(task.requirement.carPartId, CONTEXT),
      0,
    )
    // The chain premium must actually show up - both tasks' parts are buried,
    // so labour must exceed the bare install-only baseline.
    expect(breakdown.laborSlots).toBeGreaterThan(bareInstallSlots)

    const worstPayout = deriveServiceJobPayoutYen(template.tasks, car, model, CONTEXT, marginMin)
    const minCost = playerMinCostYen(template.tasks, car, model)
    expect(minCost).toBeGreaterThan(0)
    expect(worstPayout / minCost).toBeGreaterThanOrEqual(REQUIRED_COVERAGE)
  })

  it('every template has at least one task, and every task addresses a real catalog-covered part', () => {
    for (const template of SERVICE_JOB_TYPES) {
      expect(template.tasks.length, `template "${template.id}" has no tasks`).toBeGreaterThan(0)
      for (const task of template.tasks) {
        expect(
          CONTEXT.partsTaxonomyById[task.requirement.carPartId],
          `template "${template.id}" task addresses unknown part "${task.requirement.carPartId}"`,
        ).toBeDefined()
      }
    }
  })
})
