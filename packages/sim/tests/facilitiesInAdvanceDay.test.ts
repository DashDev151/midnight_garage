import {
  BUYERS,
  CARS,
  EQUIPMENT,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  HIDDEN_ISSUES,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  EQUIPMENT,
)
const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)
/** Covers 'body' (the repair component these labor/bay tests exercise) plus, for the
 * parking-gate test below, every other component too so whichever offer comes up first
 * never trips the Sprint 13 equipment gate — that test is about parking, not equipment. */
const ALL_EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id)

function stateWithLot(seed: number, overrides: Record<string, unknown> = {}) {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')!
  const [lot] = generateAuctionCatalog(
    [model],
    'local-yard',
    HIDDEN_ISSUES_BY_COMPONENT,
    7,
    1,
    30,
    createRng(seed),
  )
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
    expect(won.serviceBayCarIds).toEqual([]) // delivered straight to parking, not a bay

    const actions = {
      ...noActions,
      createJobs: [
        {
          carInstanceId: car.id,
          kind: 'repair-zone' as const,
          componentId: 'body' as const,
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
          laborSlotsRequired: 1,
        },
      ],
      laborAssignments: [{ jobId: `job-${won.day}-0`, laborSlots: 1 }],
    }
    const { state: next } = advanceDay(won, actions, 2, CONTEXT)
    expect(next.jobs).toHaveLength(0) // completed and removed same day
    expect(next.ownedCars[0]?.components.body.condition).toBe(100)
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

  it('a won bid is forfeited to the rivals when parking is full — bid never blocked', () => {
    const { state, lot } = stateWithLot(1, { parkingBayCount: 0 })
    const cashBefore = state.cashYen
    const actions = DayActionsSchema.parse({
      bidsOnLots: [{ lotId: lot.id, maxBidYen: lot.bookValueYen * 3 }],
    })
    const { state: next, log } = advanceDay(state, actions, 1, CONTEXT)
    expect(next.ownedCars).toHaveLength(0) // forfeited, not won
    expect(next.cashYen).toBe(cashBefore) // nothing spent
    expect(next.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false) // lot is gone either way
    expect(log.find((e) => e.type === 'acquisition-blocked')).toMatchObject({
      kind: 'auction-win',
      reason: 'no-parking',
    })
    expect(log.find((e) => e.type === 'auction-bid-lost')).toBeDefined()
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
  it('a purchased bay is usable the same day it is bought', () => {
    const price = FACILITIES.service.bayPricesYen[0]!
    const base = createInitialGameState(CONTEXT, 1)
    const state = { ...base, cashYen: price }
    const actions = DayActionsSchema.parse({ buyBays: [{ kind: 'service' }] })
    const { state: next, log } = advanceDay(state, actions, 1, CONTEXT)
    expect(next.serviceBayCount).toBe(base.serviceBayCount + 1)
    expect(next.cashYen).toBe(0)
    expect(log.find((e) => e.type === 'bay-purchased')).toMatchObject({
      kind: 'service',
      priceYen: price,
    })
  })
})
