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
import { weekIndex } from '../src/calendar'
import { buildSimContext } from '../src/context'
import { applyBayPurchase } from '../src/facilities'
import { bookCashMovements } from '../src/financeLedger'
import { applyWeeklyRentAndWages } from '../src/finances'
import { resolveHireMachineLine } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { resolveSetForSale } from '../src/selling'
import { resolveAttendAuction } from '../src/bidding'
import { runWorkedExample } from '../src/workedExample'
import { carLedgerFor } from '../src/carLedger'

/**
 * The cost sheet's honesty test.
 *
 * A weekly summary is only worth reading if it is COMPLETE, and completeness
 * is not a claim anyone can make by inspection - there are seventeen places
 * cash moves. So it is asserted instead, to the yen, against the shop's own
 * bank balance across a real scripted career: for every week,
 *
 *     income - (onCars + stock + running + investment) == the week's cash movement
 *
 * where the right-hand side is read off `state.cashYen` at the week's edges
 * and never off another total. A charge posted to the wrong week, a charge
 * posted twice, or a charge that never posts at all all fail this.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
const REPORT = runWorkedExample(CONTEXT)

const DAYS_PER_WEEK = ECONOMY.calendar.daysPerWeek

/** The shop's cash at the end of `day`, or at the last step before it if the
 * day itself moved nothing - the trail is chronological, so the last entry at
 * or before a day is that day's closing balance. */
function cashAfterDay(day: number): number {
  let cashYen = REPORT.startingCashYen
  for (const point of REPORT.cashTrail) {
    if (point.day > day) break
    cashYen = point.cashYen
  }
  return cashYen
}

describe('every week the cost sheet reports reconciles to the shop cash', () => {
  const ledger = REPORT.financeLedger ?? {}

  it('ran long enough to have several weeks to check', () => {
    expect(Object.keys(ledger).length).toBeGreaterThan(1)
  })

  it.each(Object.keys(ledger).map((key) => Number(key)))(
    'week %i: money in less everything out equals the week it moved',
    (weekNumber) => {
      const week = ledger[String(weekNumber)]!
      const movedYen =
        cashAfterDay(weekNumber * DAYS_PER_WEEK) - cashAfterDay((weekNumber - 1) * DAYS_PER_WEEK)
      expect(netCashYen(week)).toBe(movedYen)
    },
  )

  it('accounts for the whole career, first yen to last', () => {
    const total = Object.values(ledger).reduce((sum, week) => sum + netCashYen(week), 0)
    expect(REPORT.startingCashYen + total).toBe(REPORT.finalCashYen)
  })

  it('books every line to the week the money actually moved', () => {
    // The same figures again, this time built from the named ledger lines
    // rather than the bank balance: the accumulator and the document have to
    // be the same reading of the same career, bucket by bucket.
    const fromLines: Record<string, FinanceWeek> = {}
    for (const line of REPORT.cashLines) {
      const key = String(weekIndex(line.day, ECONOMY))
      const week = (fromLines[key] ??= {
        incomeYen: 0,
        onCarsYen: 0,
        stockYen: 0,
        runningYen: 0,
        investmentYen: 0,
      })
      const field = (
        {
          income: 'incomeYen',
          onCars: 'onCarsYen',
          stock: 'stockYen',
          running: 'runningYen',
          investment: 'investmentYen',
        } as const
      )[line.bucket]
      week[field] += Math.abs(line.yen)
    }
    expect(fromLines).toEqual(ledger)
  })
})

describe('the running costs stay off every car', () => {
  const context = CONTEXT
  const base = createInitialGameState(context, 4242)

  it('books machine-shop hire to running, never to a car', () => {
    // The hire fee has to be nonzero for there to be anything to book.
    const feeYen = ECONOMY.machineShopAssist.feeYenByGroup.engine
    expect(feeYen).toBeGreaterThan(0)
    const hired = resolveHireMachineLine(base, 'engine', context)
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

  it('logs body-pipeline materials with their amount, in the scripted career', () => {
    const materials = REPORT.cashLines.filter((line) => line.category === 'materials')
    expect(materials.length).toBeGreaterThan(0)
    for (const line of materials) {
      expect(line.yen).toBeLessThan(0)
      expect(line.bucket).toBe('onCars')
    }
  })

  it('logs what a bench recondition cost, on the day it was charged', () => {
    const reconditions = REPORT.cashLines.filter((line) =>
      line.label.startsWith('Bench recondition'),
    )
    expect(reconditions.length).toBeGreaterThan(0)
    for (const line of reconditions) {
      expect(line.yen).toBeLessThan(0)
      expect(line.bucket).toBe('stock')
    }
  })
})

describe('the classification itself', () => {
  it('leaves a moneyless entry alone rather than booking a zero', () => {
    const entry: DayLogEntry = { type: 'car-workup', carInstanceId: 'car-1' }
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

  it('separates a bench recondition from a car repair on the same entry type', () => {
    expect(
      cashMovementFor({
        type: 'job-created',
        jobId: 'j',
        carInstanceId: 'car-1',
        kind: 'repair-zone',
        costYen: 4000,
      }),
    ).toEqual({ bucket: 'onCars', amountYen: 4000 })
    expect(
      cashMovementFor({
        type: 'job-created',
        jobId: 'j',
        carInstanceId: 'part-1',
        kind: 'recondition-part',
        costYen: 4000,
      }),
    ).toEqual({ bucket: 'stock', amountYen: 4000 })
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
