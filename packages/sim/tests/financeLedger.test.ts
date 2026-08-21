import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  cashMovementFor,
  netCashYen,
  type DayLogEntry,
  type FinanceWeek,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { weekIndex } from '../src/calendar'
import { buildSimContext } from '../src/context'
import { applyBayPurchase } from '../src/facilities'
import { bookCashMovements } from '../src/financeLedger'
import { applyWeeklyRentAndWages } from '../src/finances'
import { resolveHireToolLine } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { resolveSetForSale } from '../src/selling'
import { resolveAttendAuction } from '../src/bidding'
import { carLedgerFor } from '../src/carLedger'
import { resolveBuyLift, resolveHireLift } from '../src/repairJobs'

/**
 * The cost sheet's honesty test.
 *
 * A weekly summary is only worth reading if it is COMPLETE, and completeness
 * is not a claim anyone can make by inspection - there are seventeen places
 * cash moves. So it is asserted instead, to the yen, against the shop's own
 * bank balance across a seeded career: for every week,
 *
 *     income - (onCars + stock + running + investment) == the week's cash movement
 *
 * where the right-hand side is read off `state.cashYen` at the week's edges
 * and never off another total. A charge posted to the wrong week, a charge
 * posted twice, or a charge that never posts at all all fail this.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

const DAYS_PER_WEEK = ECONOMY.calendar.daysPerWeek

const NO_ACTIONS = emptyDayActions()

/** A seeded career run forward with no player actions, recording the shop's
 * cash at every week boundary. The overnight tick is what moves money here -
 * rent, wages, and anything else the day charges without being asked - which
 * is exactly the traffic a week's figures have to account for. */
function runPassiveCareer(days: number): {
  ledger: Record<string, FinanceWeek>
  cashByWeekBoundary: number[]
  startingCashYen: number
  finalCashYen: number
} {
  let state: GameState = createInitialGameState(CONTEXT, 4242)
  const startingCashYen = state.cashYen
  const cashByWeekBoundary = [startingCashYen]
  for (let day = 1; day <= days; day++) {
    state = advanceDay(state, NO_ACTIONS, state.seed + state.day, CONTEXT).state
    if (day % DAYS_PER_WEEK === 0) cashByWeekBoundary.push(state.cashYen)
  }
  return {
    ledger: state.financeLedger ?? {},
    cashByWeekBoundary,
    startingCashYen,
    finalCashYen: state.cashYen,
  }
}

describe('every week the cost sheet reports reconciles to the shop cash', () => {
  const CAREER = runPassiveCareer(4 * DAYS_PER_WEEK)
  const ledger = CAREER.ledger

  it('ran long enough to have several weeks to check', () => {
    expect(Object.keys(ledger).length).toBeGreaterThan(1)
  })

  it('moved real money, so the identity below is not asserted over zeroes', () => {
    // Rent alone guarantees this, but an idle career that charged nothing
    // would satisfy every reconciliation below without proving anything.
    expect(CAREER.finalCashYen).not.toBe(CAREER.startingCashYen)
    for (const week of Object.values(ledger)) {
      expect(week.runningYen).toBeGreaterThan(0)
    }
  })

  it.each(Object.keys(ledger).map((key) => Number(key)))(
    'week %i: money in less everything out equals the week it moved',
    (weekNumber) => {
      const week = ledger[String(weekNumber)]!
      const movedYen =
        CAREER.cashByWeekBoundary[weekNumber]! - CAREER.cashByWeekBoundary[weekNumber - 1]!
      expect(netCashYen(week)).toBe(movedYen)
    },
  )

  it('accounts for the whole career, first yen to last', () => {
    const total = Object.values(ledger).reduce((sum, week) => sum + netCashYen(week), 0)
    expect(CAREER.startingCashYen + total).toBe(CAREER.finalCashYen)
  })
})

/** The day the lift is hired in, and the day it is bought outright - one in
 * each of the first two weeks, so a week carrying a running charge and a week
 * carrying a shop investment are each reconciled on their own. */
const LIFT_HIRE_DAY = 2
const LIFT_BUY_DAY = DAYS_PER_WEEK + 2

/**
 * The same career with the two-post lift in it, driven through the resolvers a
 * player's own buttons drive. The shop is seeded with the purchase price and
 * the reputation the gate asks for BEFORE the first cash reading, so no yen
 * arrives from outside the ledger once the career is running.
 */
function runLiftCareer(days: number): {
  ledger: Record<string, FinanceWeek>
  cashByWeekBoundary: number[]
  hired: boolean
  bought: boolean
} {
  let state: GameState = {
    ...createInitialGameState(CONTEXT, 4242),
    cashYen: ECONOMY.lift.purchasePriceYen + ECONOMY.lift.hireFeeYen + 1_000_000,
    reputationTier: ECONOMY.lift.minReputationTier,
  }
  const cashByWeekBoundary = [state.cashYen]
  let hired = false
  let bought = false
  for (let day = 1; day <= days; day++) {
    if (state.day === LIFT_HIRE_DAY) {
      const result = resolveHireLift(state, CONTEXT)
      hired = result.outcome === 'hired'
      state = result.state
    }
    if (state.day === LIFT_BUY_DAY) {
      const result = resolveBuyLift(state, CONTEXT)
      bought = result.applied
      state = result.state
    }
    state = advanceDay(state, NO_ACTIONS, state.seed + state.day, CONTEXT).state
    if (day % DAYS_PER_WEEK === 0) cashByWeekBoundary.push(state.cashYen)
  }
  return { ledger: state.financeLedger ?? {}, cashByWeekBoundary, hired, bought }
}

describe('a week that hires the lift and a week that buys it both still reconcile', () => {
  const CAREER = runLiftCareer(3 * DAYS_PER_WEEK)
  const ledger = CAREER.ledger

  it('actually hired it for a day and bought it outright, so there is something to account for', () => {
    expect(CAREER.hired).toBe(true)
    expect(CAREER.bought).toBe(true)
    expect(weekIndex(LIFT_HIRE_DAY, ECONOMY)).not.toBe(weekIndex(LIFT_BUY_DAY, ECONOMY))
  })

  it('puts the purchase on the investment line of the week it was bought in', () => {
    const buyWeek = ledger[String(weekIndex(LIFT_BUY_DAY, ECONOMY))]
    expect(buyWeek?.investmentYen).toBe(ECONOMY.lift.purchasePriceYen)
  })

  it.each(Object.keys(ledger).map((key) => Number(key)))(
    'week %i: money in less everything out equals the week it moved',
    (weekNumber) => {
      const week = ledger[String(weekNumber)]!
      const movedYen =
        CAREER.cashByWeekBoundary[weekNumber]! - CAREER.cashByWeekBoundary[weekNumber - 1]!
      expect(netCashYen(week)).toBe(movedYen)
    },
  )
})

describe('the running costs stay off every car', () => {
  const context = CONTEXT
  const base = createInitialGameState(context, 4242)

  it('books machine-shop hire to running, never to a car', () => {
    // The hire fee has to be nonzero for there to be anything to book.
    const feeYen = ECONOMY.toolHire.feeYenByGroup.engine
    expect(feeYen).toBeGreaterThan(0)
    const hired = resolveHireToolLine(base, 'engine', context)
    expect(hired.state.financeLedger).toEqual({
      '1': { incomeYen: 0, onCarsYen: 0, stockYen: 0, runningYen: feeYen, investmentYen: 0 },
    })
    // A day's crane can pull four engines; it names no car and touches none.
    expect(hired.state.carLedgers).toEqual({})
  })

  it('books rent and wages to running on the days they fall', () => {
    const rentDay = { ...base, day: ECONOMY.calendar.rentDayOfWeek }
    const charged = applyWeeklyRentAndWages(rentDay, ECONOMY)
    const rentYen = rentDay.cashYen - charged.state.cashYen
    expect(rentYen).toBeGreaterThan(0)
    expect(charged.state.financeLedger?.['1']?.runningYen).toBe(rentYen)
    expect(charged.state.financeLedger?.['1']?.investmentYen).toBe(0)
  })

  it('books the two-post lift day hire to running, never to a car', () => {
    const feeYen = ECONOMY.lift.hireFeeYen
    expect(feeYen).toBeGreaterThan(0)
    const hired = resolveHireLift(base, context)
    expect(hired.outcome).toBe('hired')
    expect(base.cashYen - hired.state.cashYen).toBe(feeYen)
    expect(hired.state.financeLedger).toEqual({
      '1': { incomeYen: 0, onCarsYen: 0, stockYen: 0, runningYen: feeYen, investmentYen: 0 },
    })
    // A day's lift takes four cars off the floor; it names no car and touches
    // none.
    expect(hired.state.carLedgers).toEqual({})
  })

  it('books the two-post lift bought outright to investment, not to the running line its hire uses', () => {
    const flush: GameState = {
      ...base,
      cashYen: ECONOMY.lift.purchasePriceYen,
      reputationTier: ECONOMY.lift.minReputationTier,
    }
    const bought = resolveBuyLift(flush, context)
    expect(bought.applied).toBe(true)
    expect(flush.cashYen - bought.state.cashYen).toBe(ECONOMY.lift.purchasePriceYen)
    expect(bought.state.financeLedger?.['1']?.investmentYen).toBe(ECONOMY.lift.purchasePriceYen)
    expect(bought.state.financeLedger?.['1']?.runningYen).toBe(0)
  })

  it('books a bay to investment, so a shop purchase never reads as overheads', () => {
    // Bays past the starting count gate on reputation as well as cash.
    const flush: GameState = { ...base, cashYen: 50_000_000, reputationTier: 'respected' }
    const bought = applyBayPurchase(flush, 'parking', FACILITIES, ECONOMY)
    expect(bought.applied).toBe(true)
    const priceYen = flush.cashYen - bought.state.cashYen
    expect(priceYen).toBeGreaterThan(0)
    expect(bought.state.financeLedger?.['1']?.investmentYen).toBe(priceYen)
    expect(bought.state.financeLedger?.['1']?.runningYen).toBe(0)
  })
})

describe('the charges that used to leave no record', () => {
  const context = CONTEXT

  it('logs the auction admission with its amount', () => {
    const priced = {
      ...context,
      economy: {
        ...ECONOMY,
        auctionRoom: {
          ...ECONOMY.auctionRoom,
          attendanceFeeYenByTier: { ...ECONOMY.auctionRoom.attendanceFeeYenByTier, regional: 3000 },
        },
      },
    }
    const base = createInitialGameState(context, 11)
    const attended = resolveAttendAuction(base, 'regional', priced)
    expect(attended.outcome).toBe('attended')
    expect(attended.log).toEqual([{ type: 'auction-attended', tier: 'regional', feeYen: 3000 }])
    expect(base.cashYen - attended.state.cashYen).toBe(3000)
  })

  it('logs the listing fee with its amount, and puts it on the car', () => {
    const base = createInitialGameState(context, 12)
    const lot = base.activeAuctionLots[0]!
    const owned: GameState = {
      ...base,
      cashYen: 5_000_000,
      ownedCars: [lot.car],
      parkingCarIds: [lot.car.id, null, null],
      forecourtCarIds: [null, null],
      // The stand owner's scripted job claims freeAdsPaper (sprint205.md);
      // this test is about the fee logging, not the unlock, so the claim is
      // granted directly rather than played through.
      serviceJobChannelUnlocks: ['freeAdsPaper'],
    }
    const feeYen = ECONOMY.sellingChannels.freeAdsPaper.feeYen
    expect(feeYen).toBeGreaterThan(0)
    const listed = resolveSetForSale(owned, lot.car.id, true, context, 'freeAdsPaper')
    expect(listed.log).toEqual([
      { type: 'car-listed', carInstanceId: lot.car.id, channelId: 'freeAdsPaper', feeYen },
    ])
    expect(carLedgerFor(listed.state, lot.car.id).listingFeesYen).toBe(feeYen)
    expect(listed.state.financeLedger?.['1']?.onCarsYen).toBe(feeYen)
    expect(listed.state.financeLedger?.['1']?.runningYen).toBe(0)
  })

  it('logs a bought consumable tin with its amount, as stock rather than a car cost', () => {
    // A tin belongs to the shelf, not any one car, until a pipeline stage
    // draws it down - the same bucket a bought catalogue part uses.
    expect(
      cashMovementFor({
        type: 'consumable-bought',
        consumableKey: 'primer',
        usesAdded: 9,
        priceYen: 5850,
      }),
    ).toEqual({ bucket: 'stock', amountYen: 5850 })
  })
})

describe('the classification itself', () => {
  it('leaves a moneyless entry alone rather than booking a zero', () => {
    const entry: DayLogEntry = { type: 'car-workup', carInstanceId: 'car-1' }
    expect(cashMovementFor(entry)).toBeNull()
    const base = createInitialGameState(CONTEXT, 5)
    expect(bookCashMovements(base, [entry], ECONOMY)).toBe(base)
  })

  it('reads body-pipeline materials as moneyless: the tin was paid for at the shop, not at the stage', () => {
    const entry: DayLogEntry = {
      type: 'body-materials-used',
      carInstanceId: 'car-1',
      zoneId: 'bonnet',
      stage: 'fillAndSand',
      costYen: 6400,
    }
    expect(cashMovementFor(entry)).toBeNull()
    const base = createInitialGameState(CONTEXT, 5)
    expect(bookCashMovements(base, [entry], ECONOMY)).toBe(base)
  })

  it('reads rent and wages, which are stored negative, as money spent', () => {
    expect(cashMovementFor({ type: 'rent-paid', amountYen: -8000 })).toEqual({
      bucket: 'running',
      amountYen: 8000,
    })
    expect(cashMovementFor({ type: 'wage-paid', staffId: 's', amountYen: -12000 })).toEqual({
      bucket: 'running',
      amountYen: 12000,
    })
  })

  it('books a priced car job against the cars bucket', () => {
    expect(
      cashMovementFor({
        type: 'job-created',
        jobId: 'j',
        carInstanceId: 'car-1',
        kind: 'repair-zone',
        costYen: 4000,
      }),
    ).toEqual({ bucket: 'onCars', amountYen: 4000 })
  })

  it('posts to the week the day belongs to', () => {
    const base = createInitialGameState(CONTEXT, 6)
    const day = DAYS_PER_WEEK + 2
    expect(weekIndex(day, ECONOMY)).toBe(2)
    const booked = bookCashMovements(
      { ...base, day },
      [{ type: 'rent-paid', amountYen: -8000 }],
      ECONOMY,
    )
    expect(Object.keys(booked.financeLedger ?? {})).toEqual(['2'])
  })
})
