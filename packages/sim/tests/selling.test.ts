import { BUYERS, CARS, type CarInstance, type CarModel } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { bestFitBuyer, listPubliclyAskingPrice, sellViaWalkIn } from '../src/selling'
import { valuateCarForBuyer } from '../src/valuation'
import { createRng } from '../src/rng'

const model: CarModel | undefined = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')
if (!model) throw new Error('fixture car missing from seed content')

const car: CarInstance = {
  id: 'car-0001',
  modelId: model.id,
  year: 1992,
  mileageKm: 90_000,
  color: 'White',
  provenanceNote: '',
  condition: { engine: 80, drivetrain: 80, suspension: 80, body: 80, interior: 80 },
  hiddenIssues: [],
  authenticityPercent: 85,
  buildSheet: {
    engine: null,
    forcedInduction: null,
    drivetrain: null,
    suspension: null,
    brakes: null,
    bodyAero: null,
    wheelsInterior: null,
  },
}

describe('sellViaWalkIn', () => {
  it("offers at or below the chosen buyer's true valuation", () => {
    const rng = createRng(1)
    const offer = sellViaWalkIn(car, model, BUYERS, {}, rng)
    const buyer = BUYERS.find((b) => b.id === offer.buyerId)
    if (!buyer) throw new Error('offer referenced an unknown buyer')
    const trueValue = valuateCarForBuyer(buyer, model, car, {})
    expect(offer.priceYen).toBeLessThanOrEqual(trueValue)
  })

  it('is deterministic for the same seed', () => {
    const a = sellViaWalkIn(car, model, BUYERS, {}, createRng(7))
    const b = sellViaWalkIn(car, model, BUYERS, {}, createRng(7))
    expect(a).toEqual(b)
  })
})

describe('listPubliclyAskingPrice', () => {
  it('scales up with market heat', () => {
    const cool = listPubliclyAskingPrice(car, model, BUYERS, {}, 80)
    const hot = listPubliclyAskingPrice(car, model, BUYERS, {}, 130)
    expect(hot).toBeGreaterThan(cool)
  })

  it('returns 0 with no buyers to value the car', () => {
    expect(listPubliclyAskingPrice(car, model, [], {}, 100)).toBe(0)
  })
})

describe('bestFitBuyer', () => {
  it('returns the buyer with the highest valuation', () => {
    const best = bestFitBuyer(car, model, BUYERS, {})
    if (!best) throw new Error('expected a best-fit buyer')
    const bestValue = valuateCarForBuyer(best, model, car, {})
    for (const buyer of BUYERS) {
      expect(valuateCarForBuyer(buyer, model, car, {})).toBeLessThanOrEqual(bestValue)
    }
  })

  it('returns undefined with no buyers', () => {
    expect(bestFitBuyer(car, model, [], {})).toBeUndefined()
  })
})
