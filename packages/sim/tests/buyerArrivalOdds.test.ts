import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type GameState,
  type SellingChannelId,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { dayOfWeek } from '../src/calendar'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import { channelArrivalOddsFor, drawDailyOffers } from '../src/selling'
import { carWithGrades } from './testFixtures'

/**
 * The closed-form arrival odds, held against the roll they describe.
 *
 * The measurement is the whole point: `channelArrivalOddsFor` is a second
 * expression of `drawOfferForChannel`'s own branches, so the only proof worth
 * having is that the real draw, run many times from the same single-day state,
 * lands on the predicted frequencies. Every trial re-runs from an identical
 * state with `offersSeen` at 0, which is exactly the single-day probability
 * the function claims to be: the listing never ages inside the sample.
 *
 * The seeds are fixed, so the counts are the same every run - a tolerance here
 * is sampling error, never flake.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const MODEL: CarModel = CARS.find((c) => c.id === 'honda-civic-sir2-eg6') ?? CARS[0]!
const CAR: CarInstance = generateAuctionCarInstance(MODEL, 'odds-car', createRng(11), CONTEXT)

/** A live state with the car owned and listed on `channelId`, on `day`. */
function listedState(channelId: SellingChannelId, day = 1, offersSeen = 0): GameState {
  const base = createInitialGameState(CONTEXT, 3)
  return {
    ...base,
    day,
    ownedCars: [...base.ownedCars, CAR],
    parkingCarIds: [...base.parkingCarIds, CAR.id],
    carsForSale: [
      {
        carInstanceId: CAR.id,
        offersSeen,
        channelId,
        weekendMeetPending: ECONOMY.sellingChannels[channelId].oneDrawNextEndDay === true,
      },
    ],
  }
}

/** The first day of the first week that is the meet day, and one that is not. */
const MEET_DAY = (() => {
  for (let day = 1; day <= ECONOMY.calendar.daysPerWeek; day++) {
    if (dayOfWeek(day, ECONOMY) === ECONOMY.calendar.meetDayOfWeek) return day
  }
  throw new Error('no meet day inside one week - check economy.calendar')
})()
const NON_MEET_DAY = MEET_DAY === 1 ? 2 : 1

/** A whole-car race build: enough of a statement that some crowd wants it. */
const BUILT_SLOTS = Object.fromEntries(
  ALL_CAR_PART_IDS.map((partId) => [partId, 'race' as const]),
) as Partial<Record<CarPartId, 'race'>>

interface DrawTally {
  trials: number
  attempts: number
  offers: number
  byBuyer: Record<string, number>
}

/** `trials` independent single days of the real draw, each from the same
 * state and a fresh seed - the listing never ages, so every trial measures
 * the same one-day probability. */
function tallyRealDraws(state: GameState, trials: number): DrawTally {
  const tally: DrawTally = { trials, attempts: 0, offers: 0, byBuyer: {} }
  for (let seed = 0; seed < trials; seed++) {
    const result = drawDailyOffers(state, CONTEXT, createRng(seed), state.day)
    const entry = result.state.carsForSale[0]!
    if (entry.offersSeen > state.carsForSale[0]!.offersSeen) tally.attempts++
    for (const offer of result.state.pendingOffers) {
      tally.offers++
      tally.byBuyer[offer.buyerId] = (tally.byBuyer[offer.buyerId] ?? 0) + 1
    }
  }
  return tally
}

describe('channelArrivalOddsFor against the real draw', () => {
  for (const channelId of ['shopFront', 'freeAdsPaper', 'tunerMagazine'] as const) {
    it(`predicts ${channelId}'s arrival and offer rates, and who turns up`, () => {
      const state = listedState(channelId)
      const odds = channelArrivalOddsFor(CAR, MODEL, channelId, state, CONTEXT)
      const trials = 3000
      const tally = tallyRealDraws(state, trials)

      expect(tally.attempts / trials).toBeCloseTo(odds.arrivalChance, 1)
      expect(tally.offers / trials).toBeCloseTo(odds.offerChance, 1)

      // Shares are what the weights actually decide, so they are checked per
      // buyer against the buyer's own predicted single-day offer chance.
      for (const buyer of odds.buyers) {
        const observed = (tally.byBuyer[buyer.buyerId] ?? 0) / trials
        expect(observed, `${channelId}: ${buyer.buyerId}`).toBeCloseTo(buyer.offerChance, 1)
      }
      // Nobody the odds never name may show up at all.
      const named = new Set(odds.buyers.map((buyer) => buyer.buyerId))
      expect(Object.keys(tally.byBuyer).filter((id) => !named.has(id))).toEqual([])
    })
  }

  it('predicts the trade network, which draws no persona at all', () => {
    const state = listedState('tradeNetwork')
    const odds = channelArrivalOddsFor(CAR, MODEL, 'tradeNetwork', state, CONTEXT)
    expect(odds.buyers).toEqual([])
    expect(odds.nonBuyerOfferId).toBe('trade-network')
    expect(odds.offerChance).toBe(odds.arrivalChance)

    const trials = 2000
    const tally = tallyRealDraws(state, trials)
    expect(tally.offers / trials).toBeCloseTo(odds.arrivalChance, 1)
    expect(Object.keys(tally.byBuyer)).toEqual(['trade-network'])
  })

  it('predicts a one-draw channel: certain on the meet day, impossible off it', () => {
    const offMeet = listedState('weekendMeet', NON_MEET_DAY)
    expect(channelArrivalOddsFor(CAR, MODEL, 'weekendMeet', offMeet, CONTEXT).arrivalChance).toBe(0)
    expect(tallyRealDraws(offMeet, 20).attempts).toBe(0)

    const onMeet = listedState('weekendMeet', MEET_DAY)
    const odds = channelArrivalOddsFor(CAR, MODEL, 'weekendMeet', onMeet, CONTEXT)
    expect(odds.arrivalChance).toBe(1)
    expect(tallyRealDraws(onMeet, 20).attempts).toBe(20)
  })

  it('spends the one draw once: a meet with nothing pending offers nothing', () => {
    const spent: GameState = {
      ...listedState('weekendMeet', MEET_DAY),
      carsForSale: [
        {
          carInstanceId: CAR.id,
          offersSeen: 4,
          channelId: 'weekendMeet',
          weekendMeetPending: false,
        },
      ],
    }
    expect(channelArrivalOddsFor(CAR, MODEL, 'weekendMeet', spent, CONTEXT).arrivalChance).toBe(0)
    expect(tallyRealDraws(spent, 20).attempts).toBe(0)
  })
})

describe('what the odds separate', () => {
  it('counts an unmatched buyer as arriving on a matchedOnly channel, and as offering nothing', () => {
    const state = listedState('tunerMagazine')
    const odds = channelArrivalOddsFor(CAR, MODEL, 'tunerMagazine', state, CONTEXT)
    const unmatched = odds.buyers.filter((buyer) => !buyer.tasteMatched)
    expect(
      unmatched.length,
      'the magazine reaches somebody this car does not suit',
    ).toBeGreaterThan(0)
    for (const buyer of unmatched) {
      expect(buyer.arrivalChance).toBeGreaterThan(0)
      expect(buyer.offerChance).toBe(0)
    }
    expect(odds.offerChance).toBeLessThan(odds.arrivalChance)
  })

  it('leaves a matched buyer offering exactly as often as they arrive, gate or no gate', () => {
    // The gate is per buyer, not per channel, so the case that matters is a
    // car somebody in the magazine crowd actually wants. No car off the block
    // is one: taste reads the BUILD, so a matched buyer needs a built car.
    // Found by scanning rather than pinned, so a shift in what any one crowd
    // wants cannot quietly turn this back into the all-unmatched case.
    let checked = 0
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, BUILT_SLOTS, 'mint')
      const state: GameState = {
        ...listedState('tunerMagazine'),
        ownedCars: [car],
        carsForSale: [
          {
            carInstanceId: car.id,
            offersSeen: 0,
            channelId: 'tunerMagazine' as const,
            weekendMeetPending: false,
          },
        ],
      }
      const odds = channelArrivalOddsFor(car, model, 'tunerMagazine', state, CONTEXT)
      for (const buyer of odds.buyers.filter((b) => b.tasteMatched)) {
        expect(buyer.offerChance, `${model.id}: ${buyer.buyerId}`).toBe(buyer.arrivalChance)
        checked++
      }
    }
    expect(checked, 'some built roster car suits somebody the magazine reaches').toBeGreaterThan(0)
  })

  it('leaves arrival and offer equal on a channel with no taste gate', () => {
    const state = listedState('shopFront')
    const odds = channelArrivalOddsFor(CAR, MODEL, 'shopFront', state, CONTEXT)
    expect(odds.offerChance).toBeCloseTo(odds.arrivalChance, 10)
    expect(odds.buyers.reduce((sum, buyer) => sum + buyer.shareOfDraw, 0)).toBeCloseTo(1, 10)
  })

  it('goes stale by offers seen, not by days', () => {
    const fresh = channelArrivalOddsFor(
      CAR,
      MODEL,
      'shopFront',
      listedState('shopFront', 1, 0),
      CONTEXT,
    )
    const stale = channelArrivalOddsFor(
      CAR,
      MODEL,
      'shopFront',
      listedState('shopFront', 1, 12),
      CONTEXT,
    )
    expect(stale.arrivalChance).toBeLessThan(fresh.arrivalChance)

    const laterDay = channelArrivalOddsFor(
      CAR,
      MODEL,
      'shopFront',
      listedState('shopFront', 30, 0),
      CONTEXT,
    )
    expect(laterDay.arrivalChance).toBe(fresh.arrivalChance)
  })

  it('reads a channel the car is not listed on when told what to assume', () => {
    const state = listedState('shopFront', 1, 9)
    const asIs = channelArrivalOddsFor(CAR, MODEL, 'tunerMagazine', state, CONTEXT)
    const fresh = channelArrivalOddsFor(CAR, MODEL, 'tunerMagazine', state, CONTEXT, {
      offersSeen: 0,
    })
    expect(asIs.arrivalChance).toBeLessThan(fresh.arrivalChance)
  })
})
