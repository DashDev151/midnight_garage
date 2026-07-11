import { BUYERS, CARS, ECONOMY, HIDDEN_ISSUES, PARTS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { computeBuyoutPriceYen } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)

function stateWithLot(seed: number) {
  const model = CARS.find((c) => c.id === 'honda-city-e-aa')!
  const [lot] = generateAuctionCatalog(
    [model],
    'local-yard',
    HIDDEN_ISSUES_BY_COMPONENT,
    7,
    1,
    createRng(seed),
    ECONOMY,
  )
  const base = createInitialGameState(CONTEXT, 1)
  return { state: { ...base, activeAuctionLots: [lot!] }, lot: lot! }
}

describe('buyoutLots resolution', () => {
  it('buys the lot outright, removing it and adding the car at the premium price', () => {
    const { state, lot } = stateWithLot(1)
    const actions = DayActionsSchema.parse({ buyoutLots: [{ lotId: lot.id }] })
    const { state: next, log } = advanceDay(state, actions, 1, CONTEXT)

    // Sprint 20: the real, chargeable price is anchorValueYen * premium (or
    // the current-bid floor, whichever is higher) - not book * premium,
    // since buyout re-points at the value anchor, not book value.
    const expectedPrice = computeBuyoutPriceYen(lot, state, CONTEXT)
    expect(next.cashYen).toBe(state.cashYen - expectedPrice)
    expect(next.ownedCars).toHaveLength(1)
    expect(next.ownedCars[0]!.modelId).toBe(lot.modelId)
    expect(next.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
    expect(log.find((e) => e.type === 'lot-bought-out')).toMatchObject({
      lotId: lot.id,
      priceYen: expectedPrice,
    })
  })

  it('is a no-op when the buyout is unaffordable', () => {
    const { state, lot } = stateWithLot(2)
    const broke = { ...state, cashYen: 0 }
    const actions = DayActionsSchema.parse({ buyoutLots: [{ lotId: lot.id }] })
    const { state: next } = advanceDay(broke, actions, 1, CONTEXT)
    expect(next.ownedCars).toHaveLength(0)
    expect(next.activeAuctionLots.some((l) => l.id === lot.id)).toBe(true)
  })
})
