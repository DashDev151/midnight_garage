import type { Buyer, CarInstance, CarModel, Part } from '@midnight-garage/content'
import { WALK_IN_OFFER_RANGE } from './constants'
import type { Rng } from './rng'
import { valuateCarForBuyer } from './valuation'

export interface SaleOffer {
  buyerId: string
  priceYen: number
}

/**
 * GDD 6.3: "fast, variable" — a buyer archetype rolls up the same day,
 * offering somewhat under their true valuation for the convenience of an
 * instant sale. Weighted by fit, not uniformly random: a buyer who
 * actually wants this car is more likely to be the one who walks in —
 * "someone happens by," not "a stranger is offered a car they don't
 * care about." Uniform selection made this channel punishing for any
 * car that didn't match the randomly-chosen archetype's taste, on top
 * of the discount below — a double penalty that made flipping
 * unviable regardless of how cheap the purchase was.
 */
export function sellViaWalkIn(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  rng: Rng,
): SaleOffer {
  const valuations = buyers.map((buyer) => ({
    buyer,
    value: valuateCarForBuyer(buyer, model, car, partsById),
  }))
  const totalValue = valuations.reduce((sum, v) => sum + v.value, 0)

  let picked = valuations[0]
  if (totalValue > 0) {
    let roll = rng.next() * totalValue
    for (const v of valuations) {
      roll -= v.value
      if (roll <= 0) {
        picked = v
        break
      }
    }
  } else {
    picked = valuations[rng.int(0, valuations.length - 1)]
  }
  if (!picked) {
    throw new RangeError('sellViaWalkIn requires at least one buyer')
  }

  const [min, max] = WALK_IN_OFFER_RANGE
  const priceYen = Math.round(picked.value * (min + rng.next() * (max - min)))
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * GDD 6.3: "slow, market price" — the average valuation across every
 * buyer archetype, scaled by market heat, locked in at listing time (the
 * asking price doesn't drift with market heat while the listing waits).
 */
export function listPubliclyAskingPrice(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  marketHeatPercent: number,
): number {
  if (buyers.length === 0) return 0
  const total = buyers.reduce(
    (sum, buyer) => sum + valuateCarForBuyer(buyer, model, car, partsById),
    0,
  )
  const average = total / buyers.length
  return Math.round(average * (marketHeatPercent / 100))
}

/**
 * The best-fit buyer for a resolved public listing — flavor/log purposes
 * only. The actual sale price is the locked askingPriceYen from listing
 * time, not recomputed against this buyer.
 */
export function bestFitBuyer(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
): Buyer | undefined {
  let best: { buyer: Buyer; value: number } | undefined
  for (const buyer of buyers) {
    const value = valuateCarForBuyer(buyer, model, car, partsById)
    if (!best || value > best.value) {
      best = { buyer, value }
    }
  }
  return best?.buyer
}
