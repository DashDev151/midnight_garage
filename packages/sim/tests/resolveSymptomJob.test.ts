import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  SYMPTOMS,
  TOOL_LINES,
  type CarInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { candidateFixCostYen } from '../src/diagnosis'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { deriveSymptomJobPayoutYen, isServiceTaskDone } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

const STATE = createInitialGameState(CONTEXT, 1)
const MODEL = CARS.find((m) => m.id === 'honda-city-e-aa') ?? CARS[0]!

/**
 * `resolveSymptom` service jobs (docs/design/systems/knowledge-and-
 * diagnosis.md section 8, sprint218.md task C): "the margin is the order" -
 * the payout is fixed at accept, so the player's actual profit is entirely a
 * function of the order they open candidates in. Good order (descending
 * probability-per-labour, i.e. best information per yen spent first) finds
 * the true cause cheaply; bad order (ascending) burns through the
 * expensive, unlikely candidates first and only reaches the true cause last.
 *
 * The fixture: `clunk-over-bumps` (tired-bushes 35%/worn, blown-dampers
 * 28%/poor, steering-play 13%/poor, rotted-subframe-mount 24%/scrap), with
 * the true cause set to `tired-bushes` - the highest-weight AND (being only
 * `worn`, not `poor`/`scrap`) one of the cheaper candidates to put right, so
 * it is unambiguously the best "probability per labour" pick on the board.
 */
describe('resolveSymptom service job: order is the margin (sprint218.md task C5)', () => {
  const symptom = SYMPTOMS.find((s) => s.id === 'clunk-over-bumps')
  if (!symptom) throw new Error('fixture symptom "clunk-over-bumps" missing from content')

  const foundTrueCause = symptom.causes.find((c) => c.id === 'tired-bushes')
  if (!foundTrueCause)
    throw new Error('fixture cause "tired-bushes" missing from "clunk-over-bumps"')
  const trueCause = foundTrueCause

  const car: CarInstance = buildCarInstance({
    id: 'car-symptom-job-fixture',
    modelId: MODEL.id,
    parts: mintCarParts({ [trueCause.carPartId]: trueCause.setBand }),
    symptoms: [
      {
        symptomId: symptom.id,
        trueCauseId: trueCause.id,
        remainingCauseIds: symptom.causes.map((c) => c.id),
        runTestIds: [],
        latent: false,
      },
    ],
  })

  const marginRoll = (ECONOMY.serviceJobs.marginMin + ECONOMY.serviceJobs.marginMax) / 2
  const payoutYen = deriveSymptomJobPayoutYen(symptom, car, MODEL, CONTEXT, STATE, marginRoll)

  /** Every candidate's own chain-priced fix cost (`candidateFixCostYen`,
   * diagnosis.ts - the ONE fix-cost function, the same one the payout
   * itself was just derived from) paired with its weight, so both orderings
   * below read the identical figures the payout priced against. */
  const priced = symptom.causes.map((cause) => ({
    cause,
    costYen: candidateFixCostYen(car, MODEL, cause, STATE, CONTEXT),
  }))

  it('every candidate carries a real, positive cost (fixture sanity)', () => {
    for (const { cause, costYen } of priced) {
      expect(costYen, `candidate "${cause.id}" priced at 0`).toBeGreaterThan(0)
    }
    expect(payoutYen).toBeGreaterThan(0)
  })

  /** Total spend opening `order`'s candidates in turn, stopping once the
   * true cause has been opened (inclusive) - the wasted spend on every
   * wrong candidate opened first, plus the true fix itself. */
  function spendToFindTrueCause(
    order: readonly { cause: { id: string }; costYen: number }[],
  ): number {
    let spend = 0
    for (const entry of order) {
      spend += entry.costYen
      if (entry.cause.id === trueCause.id) break
    }
    return spend
  }

  it('descending probability-per-labour order (best value first) spends less than the payout', () => {
    const descending = [...priced].sort(
      (a, b) => b.cause.weight / b.costYen - a.cause.weight / a.costYen,
    )
    // The true cause is the best-value candidate on this fixture, so a
    // reading player finds it on the very first guess.
    expect(descending[0]!.cause.id).toBe(trueCause.id)
    const spend = spendToFindTrueCause(descending)
    expect(spend).toBeLessThan(payoutYen)
  })

  it('the reverse order (worst value first) spends more than the payout', () => {
    const ascending = [...priced].sort(
      (a, b) => a.cause.weight / a.costYen - b.cause.weight / b.costYen,
    )
    // The true cause is last to be opened in the worst-first order, so the
    // player pays for every wrong candidate before ever reaching it.
    expect(ascending[ascending.length - 1]!.cause.id).toBe(trueCause.id)
    const spend = spendToFindTrueCause(ascending)
    expect(spend).toBeGreaterThan(payoutYen)
  })

  it('completion: collapsing the symptom and fixing the true cause to fine+ satisfies the task; an unfixed collapse does not', () => {
    const task = { kind: 'resolveSymptom' as const, symptomId: symptom.id }

    // Still open (more than one remaining cause) - not done regardless of band.
    expect(isServiceTaskDone(car, task, CONTEXT)).toBe(false)

    // Collapsed to the true cause, but the part still sits at its damaged
    // band - narrowing alone is knowledge, not a fix.
    const collapsedOnly: CarInstance = {
      ...car,
      symptoms: [{ ...car.symptoms[0]!, remainingCauseIds: [trueCause.id] }],
    }
    expect(isServiceTaskDone(collapsedOnly, task, CONTEXT)).toBe(false)

    // Collapsed AND fixed to fine or better - done.
    const fixed: CarInstance = {
      ...collapsedOnly,
      parts: {
        ...collapsedOnly.parts,
        [trueCause.carPartId]: {
          installed: { ...collapsedOnly.parts[trueCause.carPartId].installed!, band: 'fine' },
        },
      },
    }
    expect(isServiceTaskDone(fixed, task, CONTEXT)).toBe(true)
  })
})
