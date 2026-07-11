import {
  BUYERS,
  CARS,
  ECONOMY,
  EQUIPMENT,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { generateAuctionCatalog } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'

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
/** Covers 'body' (the repair component these labor/bay tests exercise) plus, for the
 * parking-gate test below, every other component too so whichever offer comes up first
 * never trips the Sprint 13 equipment gate - that test is about parking, not equipment. */
const ALL_EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id)

function stateWithLot(seed: number, overrides: Record<string, unknown> = {}) {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')!
  const [lot] = generateAuctionCatalog([model], 'local-yard', 7, 1, createRng(seed), ECONOMY)
  const base = createInitialGameState(CONTEXT, 1)
  return {
    state: {
      ...base,
      activeAuctionLots: [lot!],
      ownedEquipmentIds: ALL_EQUIPMENT_IDS,
      ...overrides,
    },
    lot: lot!,
  }
}

const noActions = DayActionsSchema.parse({})

describe('labor is gated by service-bay membership', () => {
  it('a job on a parked car makes no progress and is logged blocked', () => {
    const { state } = stateWithLot(1)
    // Win the lot first (parking starts open) to get an owned car, untouched by any move.
    const won = advanceDay(
      state,
      { ...noActions, buyoutLots: [{ lotId: state.activeAuctionLots[0]!.id }] },
      1,
      CONTEXT,
    ).state
    const car = won.ownedCars[0]!
    // Delivered straight to parking, not a service bay (Sprint 17: real
    // indexed slots now, not a compact "who's occupied" list).
    expect(won.serviceBayCarIds.every((id) => id !== car.id)).toBe(true)
    expect(won.parkingCarIds).toContain(car.id)

    const actions = {
      ...noActions,
      createJobs: [
        {
          carInstanceId: car.id,
          kind: 'repair-zone' as const,
          componentId: 'body' as const,
          targetBand: 'mint' as const,
          laborSlotsRequired: 1,
        },
      ],
      laborAssignments: [{ jobId: `job-${won.day}-0`, laborSlots: 1 }],
    }
    const { state: next, log } = advanceDay(won, actions, 2, CONTEXT)
    expect(next.jobs[0]?.laborSlotsSpent).toBe(0)
    expect(log.find((e) => e.type === 'job-blocked')).toMatchObject({
      reason: 'not-in-service-bay',
    })
  })

  it('moving the car in first lets the same-day job receive labor', () => {
    const { state } = stateWithLot(1)
    const won = advanceDay(
      state,
      { ...noActions, buyoutLots: [{ lotId: state.activeAuctionLots[0]!.id }] },
      1,
      CONTEXT,
    ).state
    const car = won.ownedCars[0]!

    const actions = {
      ...noActions,
      moveCars: [{ carInstanceId: car.id, to: 'service' as const }],
      createJobs: [
        {
          carInstanceId: car.id,
          kind: 'repair-zone' as const,
          componentId: 'body' as const,
          targetBand: 'mint' as const,
          laborSlotsRequired: 1,
        },
      ],
      laborAssignments: [{ jobId: `job-${won.day}-0`, laborSlots: 1 }],
    }
    const { state: next } = advanceDay(won, actions, 2, CONTEXT)
    expect(next.jobs).toHaveLength(0) // completed and removed same day
    expect(next.ownedCars[0]?.parts.panels.band).toBe('mint')
  })
})

describe('acquisitions require a free parking space at delivery, never at bidding', () => {
  it('a buyout is skipped (no spend, lot stays) when parking is full', () => {
    const { state, lot } = stateWithLot(1, { parkingBayCount: 0 })
    const actions = DayActionsSchema.parse({ buyoutLots: [{ lotId: lot.id }] })
    const cashBefore = state.cashYen
    const { state: next, log } = advanceDay(state, actions, 1, CONTEXT)
    expect(next.ownedCars).toHaveLength(0)
    expect(next.cashYen).toBe(cashBefore)
    expect(next.activeAuctionLots.some((l) => l.id === lot.id)).toBe(true)
    expect(log.find((e) => e.type === 'acquisition-blocked')).toMatchObject({
      kind: 'buyout',
      reason: 'no-parking',
    })
  })

  it('a won bid is forfeited to the rivals when parking is full - bid never blocked', () => {
    const { state, lot } = stateWithLot(1, { parkingBayCount: 0 })
    // An over-market bid - well above the buyout cap every rival is capped
    // at - guarantees a win once the lot's own duration elapses (Sprint 19:
    // bidding no longer resolves same-day, so this places the bid, then
    // advances until the lot actually resolves, accumulating every day's
    // log). A parallel no-bid control run over the same number of days
    // proves the bid itself spent nothing, regardless of how many weekly
    // rent boundaries the wait happens to cross (rent moves cash too, for
    // reasons unrelated to the auction) - both runs consume the exact same
    // shared day-tick RNG stream either way, since placing a bid and the
    // per-lot escalation pass both draw from their own separate RNGs.
    const actions = DayActionsSchema.parse({
      bidsOnLots: [{ lotId: lot.id, maxBidYen: lot.bookValueYen * 3 }],
    })
    let current = advanceDay(state, actions, 1, CONTEXT)
    let control = advanceDay(state, DayActionsSchema.parse({}), 1, CONTEXT).state
    let allLog = current.log
    let guard = 0
    while (current.state.activeAuctionLots.some((l) => l.id === lot.id) && guard++ < 30) {
      current = advanceDay(
        current.state,
        DayActionsSchema.parse({}),
        current.state.seed + current.state.day,
        CONTEXT,
      )
      allLog = [...allLog, ...current.log]
      control = advanceDay(
        control,
        DayActionsSchema.parse({}),
        control.seed + control.day,
        CONTEXT,
      ).state
    }
    const next = current.state
    expect(next.ownedCars).toHaveLength(0) // forfeited, not won
    expect(next.cashYen).toBe(control.cashYen) // nothing spent by the auction itself
    expect(next.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false) // lot is gone either way
    expect(allLog.find((e) => e.type === 'acquisition-blocked')).toMatchObject({
      kind: 'auction-win',
      reason: 'no-parking',
    })
    expect(allLog.find((e) => e.type === 'auction-bid-lost')).toBeDefined()
  })

  it('accepting a service job is skipped (offer stays) when parking is full', () => {
    const base = createInitialGameState(CONTEXT, 1)
    const full = { ...base, parkingBayCount: 0, ownedEquipmentIds: ALL_EQUIPMENT_IDS }
    // Force a weekly offer refresh to get a real offer on the board.
    const withOffers = advanceDay({ ...full, day: 7 }, noActions, 1, CONTEXT).state
    expect(withOffers.serviceJobOffers.length).toBeGreaterThan(0)
    const offer = withOffers.serviceJobOffers[0]!
    const actions = DayActionsSchema.parse({ acceptServiceJobs: [{ offerId: offer.id }] })
    const { state: next, log } = advanceDay(withOffers, actions, 2, CONTEXT)
    expect(next.activeServiceJobs).toHaveLength(0)
    expect(next.serviceJobOffers.some((o) => o.id === offer.id)).toBe(true)
    expect(log.find((e) => e.type === 'acquisition-blocked')).toMatchObject({
      kind: 'service-accept',
      reason: 'no-parking',
    })
  })
})

describe('buying bays via DayActions (the bots’ path)', () => {
  it('a purchased bay is usable the same day it is bought, once reputation clears the gate', () => {
    const price = FACILITIES.service.bayPricesYen[0]!
    const rung1Tier = FACILITIES.service.minReputationTier[0]!
    const base = createInitialGameState(CONTEXT, 1)
    const state = { ...base, cashYen: price, reputationTier: rung1Tier }
    const actions = DayActionsSchema.parse({ buyBays: [{ kind: 'service' }] })
    const { state: next, log } = advanceDay(state, actions, 1, CONTEXT)
    expect(next.serviceBayCount).toBe(base.serviceBayCount + 1)
    expect(next.cashYen).toBe(0)
    expect(log.find((e) => e.type === 'bay-purchased')).toMatchObject({
      kind: 'service',
      priceYen: price,
    })
  })

  it('refuses a reputation-gated bay purchase, even queued via DayActions', () => {
    const price = FACILITIES.service.bayPricesYen[0]!
    const base = createInitialGameState(CONTEXT, 1)
    const state = { ...base, cashYen: price } // reputationTier stays 'unknown'
    const actions = DayActionsSchema.parse({ buyBays: [{ kind: 'service' }] })
    const { state: next } = advanceDay(state, actions, 1, CONTEXT)
    expect(next.serviceBayCount).toBe(base.serviceBayCount)
    expect(next.cashYen).toBe(price)
  })
})
