import {
  BUYERS,
  CARS,
  ECONOMY,
  EMPTY_FINANCE_WEEK,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SCRIPTED_SERVICE_JOB,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  netCashYen,
  type FinanceWeek,
  type GameState,
  type RepairJobKind,
  type ServiceJob,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { weekIndex } from '../src/calendar'
import { carLedgerFor } from '../src/carLedger'
import { buildSimContext } from '../src/context'
import { resolveHireToolLine } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { resolveHireLift, resolveRepairStep, type RepairTarget } from '../src/repairJobs'
import { ensureScriptedServiceJob } from '../src/scriptedServiceJob'
import { resolveAcceptServiceJob, resolveServiceJob } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts } from './testFixtures'

/**
 * The cost sheet against the till, on a day that actually works.
 *
 * `financeLedger.test.ts` proves the identity over a career that mostly
 * charges rent. This proves it over the day the shop earns its living: a tool
 * line hired, the lift hired, a Service worked to completion on an owned car,
 * a Rebuild worked to completion with its own parts bill, and a customer's car
 * handed back for its payout. Five money events, one seeded run, no overnight
 * tick, so every yen on the week's sheet is one of them and the composition
 * can be asserted line by line rather than only in total:
 *
 *     running    == the two hire fees, which belong to no car
 *     onCars     == both repair bills, which belong to exactly one
 *     income     == the handback payout
 *     income - (onCars + stock + running + investment) == the till's own movement
 *
 * The right-hand side of the last line is read off `state.cashYen` at the
 * day's edges and never off another total.
 */

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

/** The day the stand owner's job is on the board, so the customer half of the
 * script is the real scripted job rather than a hand-built one. */
const DAY = SCRIPTED_SERVICE_JOB.appearsOnDay

const WEEK_KEY = String(weekIndex(DAY, ECONOMY))

const OWNED_CAR_ID = 'car-reconciliation'

/** The chassis Rebuild welds, and welding can never be slogged by hand, so
 * the body line's day is a hire the day genuinely needs rather than a fee
 * bought to make a test spend money. */
const HIRED_LINE = 'body' as const

/** More than any step of either job asks for: this test is about money, and
 * an energy refusal would stop the script rather than measure it. */
const ENERGY_ON_TAP = 1_000

/** Seeded before the opening cash reading, so no yen arrives from outside the
 * ledger once the day is running. */
const OPENING_CASH_YEN = 5_000_000

const SERVICE_TARGET: RepairTarget = {
  kind: 'installed',
  carInstanceId: OWNED_CAR_ID,
  carPartId: 'block',
}

const REBUILD_TARGET: RepairTarget = {
  kind: 'installed',
  carInstanceId: OWNED_CAR_ID,
  carPartId: 'chassis',
}

/** A career carried to the day the scripted job posts, with one owned car in a
 * parking bay carrying two poor slots: a buried engine block for the Service,
 * and the chassis for the Rebuild (a fixed surface, so the Rebuild is worked
 * on the car and its bill lands on that car's ledger). */
function openingState(): GameState {
  const career = createInitialGameState(CONTEXT, 4242)
  const car = buildCarInstance({
    id: OWNED_CAR_ID,
    modelId: 'honda-city-e-aa',
    parts: mintCarParts({ block: 'poor', chassis: 'poor' }),
  })
  return ensureScriptedServiceJob(
    {
      ...career,
      day: DAY,
      cashYen: OPENING_CASH_YEN,
      ownedCars: [car],
      parkingCarIds: [car.id, ...career.parkingCarIds.slice(1)],
    },
    CONTEXT,
    DAY,
  )
}

/** Ticks one repair job's steps until it completes. A refusal throws with the
 * reason: a script that cannot be played is a failure, not a smaller run. */
function workToCompletion(state: GameState, target: RepairTarget, kind: RepairJobKind): GameState {
  let next = state
  for (let step = 0; step < 12; step++) {
    const result = resolveRepairStep(next, target, kind, CONTEXT, ENERGY_ON_TAP)
    if (typeof result.outcome !== 'string') {
      throw new Error(`the ${kind} refused at step ${step}: ${result.outcome.refused}`)
    }
    next = result.state
    if (result.outcome === 'completed') return next
  }
  throw new Error(`the ${kind} never completed`)
}

interface ScriptedDay {
  opening: GameState
  final: GameState
  week: FinanceWeek
  lineHireYen: number
  liftHireYen: number
  serviceBillYen: number
  rebuildBillYen: number
  payoutYen: number
}

/**
 * The scripted day itself, driven through the resolvers the player's own
 * buttons drive. Every figure is measured as a cash delta across the call that
 * moved it, never re-derived from the pricing formula: the point is what the
 * till did, and a bill computed twice by the same maths would agree with
 * itself whatever the sheet said.
 */
function runScriptedDay(): ScriptedDay {
  const opening = openingState()
  let state = opening

  const line = resolveHireToolLine(state, HIRED_LINE, CONTEXT)
  if (line.outcome !== 'hired') throw new Error(`the ${HIRED_LINE} line refused: ${line.outcome}`)
  const lineHireYen = state.cashYen - line.state.cashYen
  state = line.state

  const lift = resolveHireLift(state, CONTEXT)
  if (lift.outcome !== 'hired') throw new Error(`the lift refused: ${lift.outcome}`)
  const liftHireYen = state.cashYen - lift.state.cashYen
  state = lift.state

  const beforeService = state.cashYen
  state = workToCompletion(state, SERVICE_TARGET, 'service')
  const serviceBillYen = beforeService - state.cashYen

  const beforeRebuild = state.cashYen
  state = workToCompletion(state, REBUILD_TARGET, 'rebuild')
  const rebuildBillYen = beforeRebuild - state.cashYen

  const accepted = resolveAcceptServiceJob(state, SCRIPTED_SERVICE_JOB.jobId, CONTEXT)
  const job = accepted.state.activeServiceJobs.find((sj) => sj.id === SCRIPTED_SERVICE_JOB.jobId)
  if (!job) throw new Error('the scripted service job was not accepted')
  // Handed back the same day, with the two task slots set to the band the
  // tasks ask for rather than worked: the customer's own repair bill is not
  // what this run measures, so the only money this job moves is its payout.
  const worked: ServiceJob = {
    ...job,
    arrivesOnDay: null,
    car: {
      ...job.car,
      parts: {
        ...job.car.parts,
        ignitionEcu: { installed: { ...job.car.parts.ignitionEcu.installed!, band: 'fine' } },
        fuelSystem: { installed: { ...job.car.parts.fuelSystem.installed!, band: 'fine' } },
      },
    },
  }
  const ready: GameState = { ...accepted.state, activeServiceJobs: [worked] }
  const paid = resolveServiceJob(ready, SCRIPTED_SERVICE_JOB.jobId, CONTEXT)
  if (paid.outcome !== 'paid') throw new Error(`the handback did not pay: ${paid.outcome}`)
  const payoutYen = paid.state.cashYen - ready.cashYen

  return {
    opening,
    final: paid.state,
    week: paid.state.financeLedger?.[WEEK_KEY] ?? EMPTY_FINANCE_WEEK,
    lineHireYen,
    liftHireYen,
    serviceBillYen,
    rebuildBillYen,
    payoutYen,
  }
}

describe('a day of hire, repair and handback reconciles to the till', () => {
  const DAY_RUN = runScriptedDay()

  it('moved real money on all five events, so nothing below is asserted over zeroes', () => {
    expect(DAY_RUN.lineHireYen).toBe(ECONOMY.toolHire.feeYenByGroup[HIRED_LINE])
    expect(DAY_RUN.liftHireYen).toBe(ECONOMY.lift.hireFeeYen)
    expect(DAY_RUN.serviceBillYen).toBeGreaterThan(0)
    expect(DAY_RUN.rebuildBillYen).toBeGreaterThan(0)
    expect(DAY_RUN.payoutYen).toBeGreaterThan(0)
  })

  it('puts the two hire fees on running costs, and puts nothing else there', () => {
    expect(DAY_RUN.week.runningYen).toBe(DAY_RUN.lineHireYen + DAY_RUN.liftHireYen)
  })

  it("puts both repair bills on the car's own ledger", () => {
    expect(carLedgerFor(DAY_RUN.final, OWNED_CAR_ID).repairYen).toBe(
      DAY_RUN.serviceBillYen + DAY_RUN.rebuildBillYen,
    )
  })

  it('puts both repair bills on the cars line of the week', () => {
    expect(DAY_RUN.week.onCarsYen).toBe(DAY_RUN.serviceBillYen + DAY_RUN.rebuildBillYen)
  })

  it('puts the handback payout on income', () => {
    expect(DAY_RUN.week.incomeYen).toBe(DAY_RUN.payoutYen)
  })

  it('buys no stock and no equipment, so those two lines stay at zero', () => {
    expect(DAY_RUN.week.stockYen).toBe(0)
    expect(DAY_RUN.week.investmentYen).toBe(0)
  })

  it('money in less everything out equals the movement in the till', () => {
    expect(netCashYen(DAY_RUN.week)).toBe(DAY_RUN.final.cashYen - DAY_RUN.opening.cashYen)
  })
})
