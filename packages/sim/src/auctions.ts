import {
  ALL_CAR_PART_IDS,
  type AuctionLot,
  type AuctionTier,
  type CarInstance,
  type CarModel,
  type EconomyConfig,
  type RarityTier,
  type TurnoutBand,
} from '@midnight-garage/content'
import { bandForMigratedCondition } from './bands'
import { CAR_CONDITION_BASE_MAX, CAR_CONDITION_BASE_MIN, CAR_CONDITION_JITTER } from './constants'
import type { Rng } from './rng'

const COLOR_POOL = ['White', 'Black', 'Silver', 'Gunmetal', 'Red', 'Blue'] as const

const PROVENANCE_POOL = [
  'one-owner, garage kept',
  'dealer trade-in, service history unknown',
  'estate sale, low mileage claimed',
  'daily driver, honest wear',
] as const

/**
 * GDD 4.5: Gaisha is sourced only via the (unbuilt) Import Broker, "no
 * auction luck" - it never appears in a regular auction catalog. Legend
 * appears only at the rep-gated Collector Network (GDD 9.2: rare, mostly
 * story leads, occasionally an auction).
 */
export function auctionTierForRarity(tier: RarityTier): AuctionTier | null {
  switch (tier) {
    case 'shitbox':
    case 'common':
      return 'local-yard'
    case 'uncommon':
      return 'regional'
    case 'rare':
      return 'premium'
    case 'legend':
      return 'collector-network'
    case 'gaisha':
      return null
  }
}

/**
 * Duration by rarity (Sprint 19 decision 1): a rare flash-sale roll applies
 * to any tier first (an occasional short event, not tied to one rarity);
 * otherwise legend cars always get a long sale, uncommon/rare occasionally
 * do, and everything else gets the standard band. First-pass day ranges,
 * openly adjustable (content/economy.json, Sprint 20 step 0).
 */
export function rollAuctionDurationDays(
  rarity: RarityTier,
  rng: Rng,
  economy: EconomyConfig,
): number {
  if (rng.next() < economy.AUCTION_FLASH_CHANCE) return economy.AUCTION_DURATION_FLASH_DAYS
  const [longMin, longMax] = economy.AUCTION_DURATION_LONG_RANGE_DAYS
  if (rarity === 'legend') return rng.int(longMin, longMax)
  if (
    (rarity === 'uncommon' || rarity === 'rare') &&
    rng.next() < economy.AUCTION_LONG_CHANCE_UNCOMMON_RARE
  ) {
    return rng.int(longMin, longMax)
  }
  const [stdMin, stdMax] = economy.AUCTION_DURATION_STANDARD_RANGE_DAYS
  return rng.int(stdMin, stdMax)
}

function clampCondition(value: number): number {
  return Math.max(0, Math.min(100, value))
}

const TURNOUT_BANDS: readonly TurnoutBand[] = ['thin', 'steady', 'packed']

/**
 * Rolls a lot's rival-turnout band (Sprint 30 decision 3), weighted by
 * `economy.auctionInterest.turnoutBandWeights` - fixed for the lot's whole
 * life (see `TurnoutBandSchema`'s own doc comment, content/auction.ts).
 * `bidding.ts`'s `turnoutBidderCount` turns this into an actual rival-cohort
 * count.
 */
function rollTurnoutBand(rng: Rng, economy: EconomyConfig): TurnoutBand {
  const weights = economy.auctionInterest.turnoutBandWeights
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return 'steady'
  let roll = rng.next() * total
  for (let i = 0; i < TURNOUT_BANDS.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return TURNOUT_BANDS[i]!
  }
  return TURNOUT_BANDS[TURNOUT_BANDS.length - 1]!
}

/**
 * Rolls a fresh, not-yet-owned car for an auction lot. Every component
 * starts with nothing installed, since an auction car hasn't been touched
 * yet (GDD: "buy rough, restore/build"). `currentYear` (Sprint 10, default
 * Infinity = unrestricted) clamps the rolled model year to the in-game
 * calendar - see calendar.ts.
 *
 * Sprint 12: part condition is not rolled independently per part - a car
 * that rolled a pristine engine and a wrecked transmission with no
 * relationship between them read as arbitrary rather than "this car has had
 * a hard life." One 0-100 baseline is rolled per car, and each of the 29
 * real parts (Sprint 26) jitters around it (CAR_CONDITION_JITTER), then
 * buckets into its condition band via `bandForMigratedCondition` (bands.ts)
 * - the same percent-to-band mapping the save migration uses, reused here
 * rather than authoring a second one (directive 16).
 *
 * Sprint 26 decision 2: `forcedInduction` alone also rolls `fitted` - true
 * (with a real band, generated like every other part) on a Turbo- or
 * Supercharged-tagged model, false on an NA car (the band is generated
 * regardless but ignored while unfitted, per `CarInstance.parts`'s own doc
 * comment). Decision 10: a lot's rolled bands are plain, always-visible
 * state now - there is no reveal machinery left to layer on top.
 */
export function generateAuctionCarInstance(
  model: CarModel,
  id: string,
  rng: Rng,
  economy: EconomyConfig,
  currentYear: number = Infinity,
): CarInstance {
  const conditionBaseline = rng.int(CAR_CONDITION_BASE_MIN, CAR_CONDITION_BASE_MAX)
  const isForcedInductionFitted =
    model.tags.includes('Turbo') || model.tags.includes('Supercharged')

  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      const percent = clampCondition(
        conditionBaseline + rng.int(-CAR_CONDITION_JITTER, CAR_CONDITION_JITTER),
      )
      const band = bandForMigratedCondition(percent, economy)
      const fitted = partId === 'forcedInduction' ? isForcedInductionFitted : true
      return [partId, { band, installed: null, fitted }]
    }),
  ) as CarInstance['parts']

  return {
    id,
    modelId: model.id,
    year: Math.min(model.spec.yearFrom + rng.int(0, 8), currentYear),
    mileageKm: rng.int(30_000, 180_000),
    color: rng.pick(COLOR_POOL),
    provenanceNote: rng.pick(PROVENANCE_POOL),
    authenticityPercent: rng.int(60, 95),
    parts,
  }
}

/**
 * Weekly catalog for one tier: one lot per eligible model that's in stock
 * this week, up to `count`. `currentYear` (Sprint 10, default Infinity =
 * unrestricted) also excludes any model whose `yearFrom` postdates the
 * in-game calendar - see calendar.ts - so a still-unreleased model can't
 * appear at auction (GDD 2.2: "new model years appear at auction over time").
 * Each lot's own duration is rolled independently off its model's rarity
 * (Sprint 19 decision 1).
 */
export function generateAuctionCatalog(
  models: readonly CarModel[],
  tier: AuctionTier,
  day: number,
  count: number,
  rng: Rng,
  economy: EconomyConfig,
  currentYear: number = Infinity,
): AuctionLot[] {
  const eligible = models.filter(
    (model) => auctionTierForRarity(model.tier) === tier && model.spec.yearFrom <= currentYear,
  )
  if (eligible.length === 0) return []

  const lots: AuctionLot[] = []
  for (let i = 0; i < count; i++) {
    const model = rng.pick(eligible)
    const lotId = `lot-${day}-${tier}-${i}`
    const car = generateAuctionCarInstance(model, `car-${lotId}`, rng, economy, currentYear)
    lots.push({
      id: lotId,
      tier,
      modelId: model.id,
      car,
      bookValueYen: model.bookValueYen,
      expiresOnDay: day + rollAuctionDurationDays(model.tier, rng, economy),
      currentBidYen: 0,
      leadingBidder: null,
      quietDays: 0,
      playerHasBid: false,
      turnout: rollTurnoutBand(rng, economy),
    })
  }
  return lots
}
