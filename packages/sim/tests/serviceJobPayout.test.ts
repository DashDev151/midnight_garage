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
  type CarPartTaxonomyEntry,
  type ComponentId,
  type ConditionBand,
  type RepairJobKind,
  type ServiceJobTask,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { bandIndex, canRepair, gradesBetween } from '../src/bands'
import { buildSimContext } from '../src/context'
import { gradeAtLeast, partFitsCar } from '../src/parts'
import { REPAIR_JOB_KINDS, forcedHireDayFor } from '../src/repairJobs'
import { deriveServiceJobPayoutYen, serviceJobCostBreakdown } from '../src/serviceJobs'
import { taskLaborChain } from '../src/taskLaborChain'
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
 * The smallest repair job whose finished band reaches `targetBand` - Service
 * to worn, Rebuild to fine, Restore to mint. Derived here from
 * `economy.repairJobs` rather than read off the sim's own answer, so this
 * file's cost basis stays independent of the one a payout is derived from.
 */
function smallestJobReaching(targetBand: ConditionBand): RepairJobKind {
  return (
    REPAIR_JOB_KINDS.find(
      (kind) => bandIndex(CONTEXT.economy.repairJobs[kind].target) >= bandIndex(targetBand),
    ) ?? 'restore'
  )
}

/**
 * The tool line whose day-hire a player genuinely cannot avoid on this fix, or
 * null when they can pay for it in energy instead.
 *
 * A tier 2 tool is a RATE rather than a wall: without the machine the step is
 * slogged by hand at `toolHire.slogMultiplier` times the energy and no yen at
 * all, which is why the cheapest CASH route almost never includes a fee. The
 * one exception is a welding or machining step (`requiresMachine`), which
 * cannot be slogged, so its day has to be bought. A Restore has no hire route
 * of any kind, and a task asking for `mint` is only ever offered to a garage
 * that already owns the covering shop (`taskToolBlocked`, serviceJobs.ts), so
 * it forces no day either.
 *
 * WHAT FORCES A DAY IS ASKED OF THE SIM'S OWN PREDICATE (`forcedHireDayFor`,
 * repairJobs.ts) rather than restated here, and deliberately so: this file's
 * cost BASIS stays independently derived (the band ladder below), but a second
 * opinion about which steps can be worked by hand would be a rule in two
 * places, free to drift, and the drift would be invisible - both sides would
 * simply agree on a wrong number. The band a task asks for is still resolved
 * independently, through this file's own `smallestJobReaching`.
 */
function forcedHireLineFor(
  entry: CarPartTaxonomyEntry,
  targetBand: ConditionBand,
): ComponentId | null {
  return forcedHireDayFor(entry, smallestJobReaching(targetBand), CONTEXT)?.line ?? null
}

/**
 * The single mandatory property: for EVERY template x EVERY roster model,
 * the WORST payout roll (`margin = marginMin`) covers the player's
 * minimum achievable cost by at least 1.15x.
 *
 * "Player's minimum achievable cost" is computed independently of
 * `deriveServiceJobPayoutYen`'s own cost basis (`serviceJobCostBreakdown`)
 * so this test cannot pass merely by re-deriving the same number twice. The
 * money is derived here from the band ladder and the catalogue; the one thing
 * asked of the sim is WHICH DAY IS FORCED (`forcedHireDayFor`), because that is
 * a rule rather than a figure and a second copy of it could only drift.
 *
 * A band-only requirement prices the bench-repair route when the slot is
 * repairable and not scrap - genuinely deterministic (no player choice, so
 * it's the same number either way). Otherwise it falls through to the
 * buy-new route below, the same fallback a grade-requirement task always
 * uses. A grade-requirement task's TRUE minimum is the cheapest fitting
 * part across the full "grade >= minGrade" set - a strictly wider set than
 * the payout formula's own narrowed median-of-the-tightest-fitting-tier
 * basis (see `deriveServiceJobPayoutYen`'s doc comment for why that
 * narrowing can only ever price a task at or above this test's true
 * minimum, never below it).
 *
 * The CASH minimum counts a day only where the work leaves nobody a choice.
 * Almost every tier 2 step can be worked by hand at `toolHire.slogMultiplier`
 * energy and no yen, so only a welding or machining step actually forces a day
 * (`forcedHireLineFor` above). A forced day is counted once per LINE across the
 * whole task list, never once per task: a day's hire buys that line's entire
 * tier 2 kit, so a job welding two slots on the same line still buys one day.
 * Access to a buried slot is never counted at all - it too is a rate, not a
 * wall (`accessRoute`, jobs.ts) - and the quote does not charge for it either,
 * so both sides of this ratio now name exactly the same days.
 */
function playerMinCostYen(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
): number {
  const { repairStepFraction } = CONTEXT.economy.restoration
  let total = 0
  const forcedHireLines = new Set<ComponentId>()
  for (const task of tasks) {
    if (task.kind !== 'slotCondition') continue
    const { carPartId, minBand, minGrade } = task.requirement
    const entry = CONTEXT.partsTaxonomyById[carPartId]!
    const installed = car.parts[carPartId].installed

    if (!minGrade && installed && canRepair(installed.band, entry)) {
      const catalogPart = CONTEXT.partsById[installed.partId]
      if (!catalogPart) continue
      const grades = gradesBetween(installed.band, minBand)
      total += Math.round(grades * repairStepFraction * catalogPart.priceYen)
      // A slot already at the target is not work, so it buys no day.
      const line = grades > 0 ? forcedHireLineFor(entry, minBand) : null
      if (line) forcedHireLines.add(line)
      continue
    }

    // The buy-new route: a grade requirement, or a band-only requirement
    // the slot can't reach by repair (scrap, missing, or non-repairable).
    const fitting = CONTEXT.parts.filter(
      (part) =>
        partFitsCar(part, model, entry.group, CONTEXT.partsTaxonomyById, carPartId) &&
        gradeAtLeast(part.grade, minGrade ?? 'stock'),
    )
    const cheapest = Math.min(...fitting.map((part) => part.priceYen))
    total += Number.isFinite(cheapest) ? cheapest : 0
  }
  for (const line of forcedHireLines) {
    total += CONTEXT.economy.toolHire.feeYenByGroup[line]
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
    if (task.kind === 'slotCondition' && !task.requirement.minGrade) {
      overrides[task.requirement.carPartId] = band
    }
  }
  return overrides
}

/** Every SLOT-CONDITION template - the profitability invariant below is
 * specifically about `serviceJobCostBreakdown`'s own per-slot cost pipeline
 * (the economy bible's payout-coverage law). A `resolveSymptom` template
 * (sprint218.md task C) prices through a structurally different,
 * already-profitable formula of its own (`deriveSymptomJobPayoutYen` - the
 * same `marginMin` floor, over a weighted-mean chain-priced cost pool rather
 * than a per-slot one) - `resolveSymptomJob.test.ts` is that formula's own
 * coverage test, so it is out of scope here rather than silently crashing on
 * a task shape `playerMinCostYen`/`worstCaseParts` were never designed to
 * read. */
const SLOT_TEMPLATES = SERVICE_JOB_TYPES.filter((template) =>
  template.tasks.every((task) => task.kind === 'slotCondition'),
)

describe('service-job payout profitability invariant (Sprint 29 decision 1)', () => {
  const REQUIRED_COVERAGE = 1.15
  // No shop state appears anywhere below, and none can: a quote is priced at
  // the fixed assumption of a garage that hires whatever it does not own, so
  // what is bolted to this shop's wall never moves either side of the ratio.

  it('the worst payout roll covers the player minimum achievable cost by at least 1.15x, for every template x every roster model, at every realistic starting band', () => {
    const marginMin = CONTEXT.economy.serviceJobs.marginMin
    const startingBands: ConditionBand[] = ['poor', 'worn', 'fine', 'scrap']
    const failures: string[] = []

    for (const template of SLOT_TEMPLATES) {
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
   * A deep-slot job (`internals` and `headValvetrain`, both engineAssembly
   * members) proves the worst-margin payout still clears the Law 4 floor on
   * a real deep-slot template, not a synthetic one. A "no teardown-chain
   * premium" formula was the bug: both tasks now price their whole physical
   * chain (the assembly's own external blockers, the engine pull, and the
   * refit), each task summed independently by `serviceJobCostBreakdown`'s
   * per-task loop - a real teardown surcharge on top of the bare install
   * figure, not instead of it.
   */
  it("a deep-slot job (engine-internals-rebuild) prices each task's whole teardown chain (Sprint 207 fixes the Sprint 79 premium-free bug), and the worst-margin payout still clears the floor", () => {
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
    const expectedSlots = template.tasks.reduce(
      (sum, task) =>
        task.kind === 'slotCondition'
          ? sum + taskLaborChain(car, task.requirement.carPartId, 'install', CONTEXT).totalSlots
          : sum,
      0,
    )
    expect(breakdown.laborSlots).toBe(expectedSlots)
    // The real chain (blockers + the engine pull, on top of the refit)
    // strictly exceeds the bare per-task install figure the old formula
    // stopped at - the restored surcharge.
    const bareInstallSlots = template.tasks.reduce(
      (sum, task) =>
        task.kind === 'slotCondition'
          ? sum +
            taskLaborChain(car, task.requirement.carPartId, 'install', CONTEXT).refitPoints /
              CONTEXT.economy.energy.pointsPerLabour
          : sum,
      0,
    )
    expect(breakdown.laborSlots).toBeGreaterThan(bareInstallSlots)

    const worstPayout = deriveServiceJobPayoutYen(template.tasks, car, model, CONTEXT, marginMin)
    const minCost = playerMinCostYen(template.tasks, car, model)
    expect(minCost).toBeGreaterThan(0)
    expect(worstPayout / minCost).toBeGreaterThanOrEqual(REQUIRED_COVERAGE)
  })

  it('every template has at least one task, and every task addresses a real catalog-covered part or a real symptom', () => {
    for (const template of SERVICE_JOB_TYPES) {
      expect(template.tasks.length, `template "${template.id}" has no tasks`).toBeGreaterThan(0)
      for (const task of template.tasks) {
        if (task.kind === 'resolveSymptom') {
          expect(
            CONTEXT.symptomsById[task.symptomId],
            `template "${template.id}" task addresses unknown symptom "${task.symptomId}"`,
          ).toBeDefined()
          continue
        }
        expect(
          CONTEXT.partsTaxonomyById[task.requirement.carPartId],
          `template "${template.id}" task addresses unknown part "${task.requirement.carPartId}"`,
        ).toBeDefined()
      }
    }
  })
})
