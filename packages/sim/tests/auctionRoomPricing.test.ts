import { ECONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  buyoutPriceYen,
  clearingFractionFor,
  incrementYenFor,
  roomClearingRangeFor,
  roomClearingYen,
  roomConfigFrom,
  roomReserveYen,
  type TurnoutKey,
} from '../src/bidding'
import { createRng } from '../src/rng'

/**
 * The live auction room's pricing, held to the arithmetic it had while it
 * lived inside the room's own state machine. Every expectation here is the
 * expression written out longhand, so a change to the lifted functions has to
 * change a literal formula in this file before it can change a price.
 *
 * The theatre (dealers, fuse, delays, reactions) stays in the game package and
 * is covered by its own tests; this file is only the money.
 */

const CONFIG = roomConfigFrom(ECONOMY)
const TURNOUT_KEYS = Object.keys(CONFIG.turnout) as TurnoutKey[]
const READS = [40_000, 250_000, 1_250_000, 3_400_000] as const

/** A stream that hands out exactly the values given, in order - the two draws
 * `clearingFractionFor` takes, pinned. */
function queueStream(values: readonly number[]): { next: () => number } {
  let index = 0
  return { next: () => values[index++] ?? 0 }
}

describe('the room reserve', () => {
  it('is the read at the one authored reserve fraction', () => {
    for (const read of READS) {
      expect(roomReserveYen(read, CONFIG)).toBe(
        Math.round(read * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION),
      )
    }
  })

  it("carries the auction card's own fraction into the room config", () => {
    expect(CONFIG.reserveFraction).toBe(ECONOMY.AUCTION_RESERVE_PRICE_FRACTION)
  })
})

describe('the clearing draw', () => {
  it('takes u then t off the stream and reads the cold branch under the bargain chance', () => {
    for (const key of TURNOUT_KEYS) {
      const turnout = CONFIG.turnout[key]
      for (const t of [0, 0.37, 1]) {
        const cold = clearingFractionFor(queueStream([0, t]), key, CONFIG)
        expect(cold, `${key} cold at t=${t}`).toBe(
          CONFIG.reserveFraction + t * (turnout.clearMin - CONFIG.reserveFraction),
        )
        const warm = clearingFractionFor(queueStream([1, t]), key, CONFIG)
        expect(warm, `${key} warm at t=${t}`).toBe(
          turnout.clearMin + t * (turnout.clearMax - turnout.clearMin),
        )
      }
    }
  })

  it('splits the two branches exactly at the bargain chance', () => {
    const key = TURNOUT_KEYS[0]!
    const justUnder = clearingFractionFor(
      queueStream([CONFIG.bargainChance - 1e-9, 1]),
      key,
      CONFIG,
    )
    const atIt = clearingFractionFor(queueStream([CONFIG.bargainChance, 1]), key, CONFIG)
    expect(justUnder).toBe(CONFIG.turnout[key].clearMin)
    expect(atIt).toBe(CONFIG.turnout[key].clearMax)
  })

  it('prices the clearing cap at the read, never under the reserve', () => {
    for (const read of READS) {
      for (const fraction of [0, 0.3, CONFIG.reserveFraction, 0.82, 1.4]) {
        expect(roomClearingYen(read, fraction, CONFIG)).toBe(
          Math.max(
            Math.round(read * ECONOMY.AUCTION_RESERVE_PRICE_FRACTION),
            Math.round(read * fraction),
          ),
        )
      }
    }
  })

  it('reports a range that every seeded draw actually lands inside', () => {
    for (const key of TURNOUT_KEYS) {
      for (const read of READS) {
        const range = roomClearingRangeFor(read, key, CONFIG)
        expect(range.floorYen).toBe(roomReserveYen(read, CONFIG))
        expect(range.bandMinYen).toBeLessThanOrEqual(range.bandMaxYen)
        expect(range.bargainChance).toBe(CONFIG.bargainChance)
        const stream = createRng(7)
        for (let draw = 0; draw < 400; draw++) {
          const clearingYen = roomClearingYen(
            read,
            clearingFractionFor(stream, key, CONFIG),
            CONFIG,
          )
          expect(clearingYen).toBeGreaterThanOrEqual(range.floorYen)
          expect(clearingYen).toBeLessThanOrEqual(range.bandMaxYen)
        }
      }
    }
  })
})

describe('the rung ladder and the desk', () => {
  it('bids the coarse step at or above the threshold and the fine one below it', () => {
    const { stepThresholdYen, stepBelowYen, stepAboveYen } = CONFIG
    expect(incrementYenFor(stepThresholdYen - 1, CONFIG)).toBe(stepBelowYen)
    expect(incrementYenFor(stepThresholdYen, CONFIG)).toBe(stepAboveYen)
    for (const read of READS) {
      expect(incrementYenFor(read, CONFIG)).toBe(
        read < stepThresholdYen ? stepBelowYen : stepAboveYen,
      )
    }
  })

  it('prices a buyout off the guide value at the buyout premium', () => {
    for (const read of READS) {
      expect(buyoutPriceYen(read, ECONOMY)).toBe(Math.round(read * ECONOMY.AUCTION_BUYOUT_PREMIUM))
    }
  })
})
