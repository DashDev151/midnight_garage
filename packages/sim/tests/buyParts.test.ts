import { BUYERS, CARS, HIDDEN_ISSUES, PARTS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { buildSimContext } from '../src/context'
import { PARTS_EXPRESS_SURCHARGE_FRACTION } from '../src/constants'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
const cheapest = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!
const cheapestExpressPriceYen = Math.round(
  cheapest.priceYen * (1 + PARTS_EXPRESS_SURCHARGE_FRACTION),
)

function actions(buyParts: { partId: string }[]) {
  return DayActionsSchema.parse({ buyParts })
}

describe('buyParts resolution in advanceDay', () => {
  it('deducts the express price, adds a part instance, and logs part-bought', () => {
    const state = createInitialGameState(CONTEXT, 1)
    const { state: next, log } = advanceDay(state, actions([{ partId: cheapest.id }]), 1, CONTEXT)

    // Sprint 14: buyParts defaults to 'express' (today's pre-Sprint-14
    // instant behavior), which now carries a surcharge over the sticker price.
    expect(next.cashYen).toBe(state.cashYen - cheapestExpressPriceYen)
    expect(next.partInventory).toHaveLength(1)
    expect(next.partInventory[0]!.partId).toBe(cheapest.id)
    expect(next.partInventory[0]!.conditionPercent).toBe(100)

    const bought = log.find((e) => e.type === 'part-bought')
    expect(bought).toMatchObject({ partId: cheapest.id, priceYen: cheapestExpressPriceYen })
  })

  it('is a no-op when the part is unaffordable', () => {
    const broke = { ...createInitialGameState(CONTEXT, 1), cashYen: 0 }
    const { state: next, log } = advanceDay(broke, actions([{ partId: cheapest.id }]), 1, CONTEXT)
    expect(next.partInventory).toHaveLength(0)
    expect(next.cashYen).toBe(0)
    expect(log.some((e) => e.type === 'part-bought')).toBe(false)
  })

  it('ignores an unknown part id', () => {
    const state = createInitialGameState(CONTEXT, 1)
    const { state: next } = advanceDay(state, actions([{ partId: 'no-such-part' }]), 1, CONTEXT)
    expect(next.partInventory).toHaveLength(0)
    expect(next.cashYen).toBe(state.cashYen)
  })
})
