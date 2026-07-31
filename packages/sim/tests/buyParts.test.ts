import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { buildSimContext } from '../src/context'
import { PARTS_EXPRESS_SURCHARGE_FRACTION } from '../src/constants'
import { createInitialGameState } from '../src/newGame'
import { quietFinanceDay } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const cheapest = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!
const cheapestExpressPriceYen = Math.round(
  cheapest.priceYen * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION),
)

/** These tests are about what a part purchase costs and nothing else, so
 * they run on a day carrying no rent bill and no wage run - the part price
 * is then the only cash movement across the tick. */
const QUIET_DAY = quietFinanceDay()

function stateOnQuietDay(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), day: QUIET_DAY, ...overrides }
}

function actions(buyParts: { partId: string }[]) {
  return DayActionsSchema.parse({ buyParts })
}

describe('buyParts resolution in advanceDay', () => {
  it('deducts the express price, adds a part instance, and logs part-bought', () => {
    const state = stateOnQuietDay()
    const { state: next, log } = advanceDay(state, actions([{ partId: cheapest.id }]), 1, CONTEXT)

    // buyParts defaults to 'express', which carries a surcharge over the
    // sticker price.
    expect(next.cashYen).toBe(state.cashYen - cheapestExpressPriceYen)
    expect(next.partInventory).toHaveLength(1)
    expect(next.partInventory[0]!.partId).toBe(cheapest.id)
    expect(next.partInventory[0]!.band).toBe('mint')

    const bought = log.find((e) => e.type === 'part-bought')
    expect(bought).toMatchObject({ partId: cheapest.id, priceYen: cheapestExpressPriceYen })
  })

  it('is a no-op when the part is unaffordable', () => {
    const broke = stateOnQuietDay({ cashYen: 0 })
    const { state: next, log } = advanceDay(broke, actions([{ partId: cheapest.id }]), 1, CONTEXT)
    expect(next.partInventory).toHaveLength(0)
    expect(next.cashYen).toBe(0)
    expect(log.some((e) => e.type === 'part-bought')).toBe(false)
  })

  it('ignores an unknown part id', () => {
    const state = stateOnQuietDay()
    const { state: next } = advanceDay(state, actions([{ partId: 'no-such-part' }]), 1, CONTEXT)
    expect(next.partInventory).toHaveLength(0)
    expect(next.cashYen).toBe(state.cashYen)
  })
})
