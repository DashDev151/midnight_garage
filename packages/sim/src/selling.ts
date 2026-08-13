import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type Buyer,
  type BuyerArchetype,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type DayLogEntry,
  type EconomyConfig,
  type ForSaleEntry,
  type GameState,
  type Part,
  type PendingSaleOffer,
  type PowerExpectationChain,
  type ReputationTier,
  type SceneStanding,
  type SellingChannelId,
} from '@midnight-garage/content'
import { tierPreferenceWeight } from './bidding'
import { applyReputationDelta } from './reputation'
import { isMeetDay } from './calendar'
import { carLedgerFor, deleteCarLedger, realisedProfitYen, updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { computeDerivedStats } from './derivedStats'
import { saleRevealLineFor } from './diagnosis'
import { bookCashMovements } from './financeLedger'
import {
  assignToForecourt,
  hasForecourtSpace,
  releaseCarFromShop,
  tryAssignToRealOrGrace,
} from './facilities'
import { marketValueYen } from './marketValue'
import { bumpPlayerSales } from './marketHeat'
import { bellNormal, type Rng } from './rng'
import { dissolveAssembliesForCar } from './assemblies'
import { creditSceneDelivery, wordOfMouthMultipliers } from './sceneStanding'
import { clearStagedWork } from './stagedWork'
import {
  cultureAffinityFor,
  currentPowerExpectationBarPs,
  isTasteMatched,
  saleOutcomeFor,
  valuateCarForBuyer,
  valuateCarForBuyerViaChannel,
  type SaleOutcome,
} from './valuation'

/**
 * The trade network's own "buyer" - a fax to the dealer circle, never a
 * named persona (`sellingChannels.tradeNetwork` has no taste roll and no
 * `buyerPoolWeights`). Not a real `Buyer.id`, so a buyer lookup against
 * `context.buyers` naturally finds nobody, and a channel with nobody behind
 * it has no verdict to give: a trade sale earns neither reputation nor scene
 * standing. The trade pays wholesale, not word of mouth.
 */
export const TRADE_NETWORK_BUYER_ID = 'trade-network'

/** One listing channel's own content shape - the same indexed-type idiom
 * `sellingChannelLabels.ts` (game) already uses, since `SellingChannelSchema`
 * itself is not exported. */
type SellingChannelConfig = EconomyConfig['sellingChannels'][SellingChannelId]

export interface SaleOffer {
  buyerId: string
  priceYen: number
}

/**
 * A channel's own answer to "who sees this car", resolved for one moment in
 * one career: the authored per-archetype pool, how far past the tier gate
 * the channel reaches, and how sharply standing focuses the pool right now
 * (`channelDrawWeighting` below). Absent entirely for a walk-in, which is
 * nobody's advertisement and reaches exactly the people who already care
 * about this league of car.
 */
export interface ChannelDrawWeighting {
  /** Per-archetype draw multiplier; an archetype absent from the map, or the
   * whole map absent, draws at a flat 1. */
  buyerPoolWeights?: Readonly<Record<BuyerArchetype, number>>
  /** The weight an archetype with NO stated interest in this car's tier
   * still draws at. Absent (or 0) keeps the tier gate hard. */
  poolWidening?: number
  /** The exponent `buyerPoolWeights` is raised to before the draw - 1 leaves
   * the pool exactly as authored, above 1 crowds the channel's own people in
   * and everyone else out. */
  focusExponent: number
  /**
   * Word of mouth (docs/sprints/sprint_archive/scene-standing-arc.md step 5): each
   * archetype's own scene-standing multiplier, applied on TOP of
   * `buyerPoolWeights` after the focus exponent - never folded into
   * `buyerPoolWeights` itself, which stays the channel's own authored
   * character. Absent archetype or absent map both draw at a flat 1 (no
   * change).
   */
  wordOfMouthMultipliers?: Readonly<Partial<Record<BuyerArchetype, number>>>
}

/**
 * One channel's draw weighting for a career at `reputationTier`. Three
 * things are folded in: the pool and the widening are the channel's own
 * content, the exponent is `selling.channelStandingFocusByReputationTier`,
 * and `wordOfMouthMultipliers` is this player's OWN scene standing
 * (`wordOfMouthMultipliers`, sceneStanding.ts) - optional and defaulted to
 * empty so every pre-existing 3-argument call site (tests, previews) keeps
 * compiling and prices with no word of mouth at all, exactly as before this
 * mechanism existed.
 */
export function channelDrawWeighting(
  channel: SellingChannelConfig,
  reputationTier: ReputationTier,
  economy: EconomyConfig,
  wordOfMouthMultipliers: Readonly<Partial<Record<BuyerArchetype, number>>> = {},
): ChannelDrawWeighting {
  return {
    ...(channel.buyerPoolWeights ? { buyerPoolWeights: channel.buyerPoolWeights } : {}),
    ...(channel.poolWidening === undefined ? {} : { poolWidening: channel.poolWidening }),
    focusExponent: economy.selling.channelStandingFocusByReputationTier[reputationTier],
    wordOfMouthMultipliers,
  }
}

/** One archetype's standing in a draw before their own valuation is read:
 * how much this league of car interests them, times how much this channel
 * is theirs. */
interface PoolCandidate {
  buyer: Buyer
  poolWeight: number
}

/**
 * The candidate buyer pool for a sale, and how strongly each of them turns
 * up. Multiplied facts: the buyer's own `tierPreferences` weight for this
 * league of car (0 when they have no entry, unless the channel widens past
 * the gate), their affinity for this car's `spec.culture`
 * (`cultureAffinityFor`, valuation.ts - the same number the taste match
 * reads, so culture changes who turns up as well as who buys), the
 * channel's own authored weight for their archetype (focused by reputation
 * standing), and that archetype's own word-of-mouth multiplier
 * (`wordOfMouthMultipliers`, scaling the channel's own character rather than
 * replacing it - a scene barely carried by a channel is still barely
 * carried, only more than before). With no `weighting` this is exactly the
 * hard tier gate the auction room applies, with the authored preference
 * weights finally read as probabilities rather than discarded.
 */
function saleCandidates(
  model: CarModel,
  buyers: readonly Buyer[],
  weighting?: ChannelDrawWeighting,
): PoolCandidate[] {
  const widening = weighting?.poolWidening ?? 0
  return buyers.flatMap((buyer) => {
    const stated = tierPreferenceWeight(buyer, model)
    const tierWeight = stated > 0 ? stated : widening
    if (tierWeight <= 0) return []
    const culture = cultureAffinityFor(buyer, model)
    const authored = weighting?.buyerPoolWeights?.[buyer.archetype] ?? 1
    const wordOfMouth = weighting?.wordOfMouthMultipliers?.[buyer.archetype] ?? 1
    const channelWeight =
      weighting === undefined ? 1 : Math.pow(authored, weighting.focusExponent) * wordOfMouth
    const poolWeight = tierWeight * culture * channelWeight
    return poolWeight > 0 ? [{ buyer, poolWeight }] : []
  })
}

/**
 * Weighted by fit, not uniformly random: a buyer who actually wants this
 * car is more likely to be the one who walks in - "someone happens by," not
 * "a stranger is offered a car they don't care about." Shared by
 * `sellViaWalkIn` below and every listing-channel draw
 * (`drawDailyOffers`/selling.ts) - one picking mechanism, channels only
 * change who is in the hat and how many tickets each of them holds.
 *
 * The draw weight is each buyer's own valuation MULTIPLIED BY their pool
 * weight, never one in place of the other. The valuation term is the size
 * bias that keeps an unimproved flip from paying (a buyer who values the car
 * highly is the one most likely to arrive, so a car bought at its own value
 * cannot systematically resell above it); the pool term is who the channel
 * reaches. Composing them keeps both properties at once. Returns `undefined`
 * when nobody at all can be drawn.
 */
function pickWeightedCandidate(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  rng: Rng,
  weighting?: ChannelDrawWeighting,
): { buyer: Buyer; value: number } | undefined {
  const valuations = saleCandidates(model, buyers, weighting).map((candidate) => {
    const value = valuateCarForBuyer(
      candidate.buyer,
      model,
      car,
      partsById,
      partsTaxonomy,
      partsTaxonomyById,
      heatPercent,
      economy,
    )
    return { buyer: candidate.buyer, value, drawWeight: value * candidate.poolWeight }
  })

  let picked = valuations[0]
  const totalWeight = valuations.reduce((sum, v) => sum + v.drawWeight, 0)
  if (totalWeight > 0) {
    let roll = rng.next() * totalWeight
    for (const v of valuations) {
      roll -= v.drawWeight
      if (roll <= 0) {
        picked = v
        break
      }
    }
  } else if (valuations.length > 0) {
    picked = valuations[rng.int(0, valuations.length - 1)]
  }
  return picked
}

/**
 * Who a channel most likely brings, and what they would pay - the
 * deterministic mode of `pickWeightedCandidate`'s own distribution
 * (`valuation x poolWeight`), with no roll. What a quote, a preview or a
 * picker label needs when it has to name one buyer rather than sample one.
 * `undefined` when the channel can draw nobody at all for this car.
 */
export function likelyChannelBuyer(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  weighting?: ChannelDrawWeighting,
): Buyer | undefined {
  let best: { buyer: Buyer; drawWeight: number } | undefined
  for (const candidate of saleCandidates(model, buyers, weighting)) {
    const drawWeight =
      candidate.poolWeight *
      valuateCarForBuyer(
        candidate.buyer,
        model,
        car,
        partsById,
        partsTaxonomy,
        partsTaxonomyById,
        heatPercent,
        economy,
      )
    if (!best || drawWeight > best.drawWeight) best = { buyer: candidate.buyer, drawWeight }
  }
  return best?.buyer
}

/**
 * GDD 6.3: "fast, variable" - a buyer archetype rolls up the same day,
 * offering somewhat under (rarely, right at) their true valuation for the
 * convenience of an instant sale.
 *
 * This is the core roll the harness/tests use directly - priced through the
 * same Stage F quality draw every listed channel now uses
 * (`drawQualityFraction`, `economy.liquidity`), at `offersSeen = 0`: a walk-in
 * carries no listing history, so it prices as a genuinely fresh offer every
 * time. The daily offer-draw step (`drawDailyOffers`) does not call this
 * directly - each listing channel prices its own draw against its own
 * listing's real `offersSeen` - but this remains the plain, un-channelled
 * walk-in computation.
 */
export function sellViaWalkIn(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  rng: Rng,
): SaleOffer {
  const picked = pickWeightedCandidate(
    car,
    model,
    buyers,
    partsById,
    partsTaxonomy,
    partsTaxonomyById,
    heatPercent,
    economy,
    rng,
  )
  if (!picked) {
    throw new RangeError(`sellViaWalkIn: no buyer archetype is interested in tier "${model.tier}"`)
  }

  const quality = drawQualityFraction(0, economy, rng)
  const priceYen = Math.round(picked.value * quality)
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * The best-fit buyer for a car - flavor/estimate purposes (the for-sale
 * toggle's ballpark preview, a bot's accept-threshold reference value).
 */
export function bestFitBuyer(
  car: CarInstance,
  model: CarModel,
  buyers: readonly Buyer[],
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
): Buyer | undefined {
  let best: { buyer: Buyer; value: number } | undefined
  for (const { buyer } of saleCandidates(model, buyers)) {
    const value = valuateCarForBuyer(
      buyer,
      model,
      car,
      partsById,
      partsTaxonomy,
      partsTaxonomyById,
      heatPercent,
      economy,
    )
    if (!best || value > best.value) {
      best = { buyer, value }
    }
  }
  return best?.buyer
}

/**
 * Cold/normal/hot bucketing of today's market heat - feeds
 * `offerChanceFor`'s heat multiplier below. Three flat bands, not a
 * continuous curve, mirroring the auction turnout-band style: simple
 * enough to eyeball-tune directly in economy.json.
 */
function heatBandFor(heatPercent: number, economy: EconomyConfig): 'cold' | 'normal' | 'hot' {
  const { heatBandColdBelowPercent, heatBandHotAtOrAbovePercent } = economy.selling
  if (heatPercent < heatBandColdBelowPercent) return 'cold'
  if (heatPercent >= heatBandHotAtOrAbovePercent) return 'hot'
  return 'normal'
}

/**
 * Today's chance a for-sale car draws an offer at all, BEFORE listing
 * staleness (`stalenessFor` below): base x this model's RARITY desirability
 * x today's heat-band multiplier, clamped to [0, 1]. How scarce a car is
 * decides how much foot traffic it draws; whether anyone in that traffic
 * actually buys this LEAGUE of car is the separate `saleCandidates` tier
 * gate, which still runs inside `sellViaWalkIn` itself - so a tier nobody
 * wants never produces a live offer even when this chance rolls true. A real
 * listing's own daily chance is this multiplied by `stalenessFor` -
 * deliberately kept out of this function, which knows nothing about any one
 * listing's `offersSeen`.
 */
export function offerChanceFor(
  model: CarModel,
  heatPercent: number,
  economy: EconomyConfig,
): number {
  const { offerChanceBase, offerChanceByRarity, offerChanceByHeatBand } = economy.selling
  const band = heatBandFor(heatPercent, economy)
  const chance = offerChanceBase * offerChanceByRarity[model.rarity] * offerChanceByHeatBand[band]
  return Math.max(0, Math.min(1, chance))
}

/**
 * Stage F's staleness multiplier (sale-value-system.md S4): a listing's own
 * daily offer-chance factor, sliding from 1.0 at a genuinely fresh listing
 * (`offersSeen` = 0) down toward `stalenessFloor` as more offers accumulate
 * against it. Reads `offersSeen` only, NEVER a day count - a specialist car
 * nobody has come to look at yet has not gone stale; it goes stale once
 * people have looked and passed (sprint147.md).
 */
export function stalenessFor(offersSeen: number, economy: EconomyConfig): number {
  const { stalenessFloor, stalenessHalfLifeOffers } = economy.liquidity
  return stalenessFloor + (1 - stalenessFloor) * Math.exp(-offersSeen / stalenessHalfLifeOffers)
}

/**
 * Stage F's offer-quality mean (sale-value-system.md S4): a genuinely fresh
 * listing's first offer averages `qualityFresh` of channel price; the mean
 * slides toward `qualityFloor` as more offers land against the same unsold
 * listing. Reads `offersSeen` only, on the same normalised clock
 * `stalenessFor` uses - the one thing this sprint must get right. Exported so
 * a fresh (`offersSeen` = 0) draw and the curve's own shape are both directly
 * testable without going through a full listing.
 */
export function qualityMeanFor(offersSeen: number, economy: EconomyConfig): number {
  const { qualityFresh, qualityFloor, qualityHalfLifeOffers } = economy.liquidity
  return (
    qualityFresh -
    (qualityFresh - qualityFloor) * (1 - Math.exp(-offersSeen / qualityHalfLifeOffers))
  )
}

/**
 * One seeded draw of the offer-quality fraction an arriving offer prices
 * against (`priceYen = channelPrice * quality` - quality is baked into the
 * price at draw time, never stored separately, the same convention the
 * old flat spread roll used). Normal around `qualityMeanFor`, clamped
 * to `[qualityFloor, 1.0]`: never a premium over channel price, and never
 * below the floor even a badly stale listing still commands.
 */
function drawQualityFraction(offersSeen: number, economy: EconomyConfig, rng: Rng): number {
  const mean = qualityMeanFor(offersSeen, economy)
  const raw = bellNormal(mean, economy.liquidity.qualitySpread, rng)
  return Math.max(economy.liquidity.qualityFloor, Math.min(1, raw))
}

/** The two ends of a no-persona channel's uniform price band for one car. */
export interface ChannelPriceBandRange {
  channelId: SellingChannelId
  /** The least this channel will ever offer for this car. */
  minYen: number
  /** The most it will ever offer. */
  maxYen: number
}

/**
 * What a channel carrying a `priceBand` rather than a `tasteCeiling` pays for
 * one car, as the two ends of the uniform draw `drawTradeNetworkOffer` below
 * takes: the band's own fractions of plain `marketValueYen`, which are exactly
 * that draw's extremes (its lowest roll returns the first, its highest the
 * second). Null for every persona channel, which prices through taste and a
 * quality curve instead and has no fixed range at all.
 *
 * The reason such a channel needs its own reader: it has no buyer pool, so it
 * never appears in a per-buyer valuation table, and without this it is the one
 * channel whose price is invisible.
 */
export function channelPriceBandRangeFor(
  car: CarInstance,
  model: CarModel,
  channelId: SellingChannelId,
  heatPercent: number,
  context: SimContext,
): ChannelPriceBandRange | null {
  const priceBand = context.economy.sellingChannels[channelId].priceBand
  if (!priceBand) return null
  const value = marketValueYen(
    model,
    car,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  return {
    channelId,
    minYen: Math.round(value * priceBand.min),
    maxYen: Math.round(value * priceBand.max),
  }
}

export interface SetForSaleResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Whether `channelId` is open for `state` right now - derived, never stored,
 * on exactly the footing `isAuctionTierUnlocked` (catalogs.ts) derives an
 * auction room. The rule runs the other way round from a room's, because the
 * two answer different questions: a room is shut until a guarantor opens it,
 * while a channel is open unless some mission CLAIMS it. So a channel nobody
 * has written an unlocking mission for is simply available, and Law 1's
 * floor lives in content (`StoryMissionSchema` forbids a mission claiming the
 * shop front or the trade network) rather than in a list of exceptions here.
 * Once claimed, the claiming mission's own `delivered` record IS the fact,
 * and a delivered mission is never undelivered, so a channel never closes.
 */
export function isSellingChannelUnlocked(
  state: GameState,
  context: SimContext,
  channelId: SellingChannelId,
): boolean {
  const openers = context.storyMissions.filter((m) => m.unlocksSellingChannel === channelId)
  if (openers.length === 0) return true
  return openers.some((mission) =>
    state.storyMissions.some((r) => r.missionId === mission.id && r.status === 'delivered'),
  )
}

/**
 * A re-listed entry's starting `offersSeen` (`resolveSetForSale` below):
 * fresh (0) for a car with no prior listing, otherwise the old entry's own
 * `offersSeen` carried forward at `economy.liquidity.relistRecovery` rather
 * than reset. Same plate, same advertisement: everyone has already seen it,
 * so a channel switch alone cannot buy back a stale listing's full
 * freshness for the price of a fee.
 */
function resolveOffersSeenForNewListing(
  existing: ForSaleEntry | undefined,
  economy: EconomyConfig,
): number {
  if (!existing) return 0
  return Math.round(existing.offersSeen * (1 - economy.liquidity.relistRecovery))
}

/**
 * Toggle a car's "taking offers" flag, and (while turning on) which channel
 * to list it on - free to unlist, but listing on a channel charges that
 * channel's `feeYen` immediately (`shopFront`/`tradeNetwork` are 0) and posts
 * it to that car's own ledger (`listingFeesYen`), so the profit the game
 * reports on a flip is net of what advertising it cost.
 * Marking a car for sale doesn't sell it or resolve anything by itself, it
 * just makes the car eligible for the daily offer draw (`drawDailyOffers`)
 * below. Turning it off drops the toggle and any live offer on the car -
 * there's nothing else to reconcile, since an offer only ever lives one day
 * anyway. A no-op for a car not owned.
 *
 * Re-listing on a DIFFERENT channel pays that channel's fee again. Re-listing
 * on the SAME channel is an idempotent no-op, except a channel carrying
 * `oneDrawNextEndDay` (`weekendMeet`, `collectorNetwork`): that channel's one
 * guaranteed draw is spent the moment it resolves (`weekendMeetPending`, the
 * field's own name predating the second channel that now shares its shape),
 * so listing on it again - even unchanged - is the "attend again" flow and
 * re-charges the fee for one more draw. Insufficient cash refuses quietly (no
 * log entry), the same silent gate-reason idiom every other cash-gated
 * resolver in this codebase uses.
 *
 * Every re-list (a channel switch, or a one-draw channel's attend-again)
 * carries the OLD entry's `offersSeen` forward at `relistRecovery` rather
 * than resetting it to fresh (`resolveOffersSeenForNewListing` above) - the
 * exploit this sprint closes: switching channels used to refresh a listing
 * for free.
 *
 * Listing is also a MOVE now (sprint148.md): a channel that
 * `requiresForecourt` (a buyer comes to look at the car) needs a free
 * forecourt slot, taken by releasing the car's real slot; a channel that
 * doesn't (the trade network) leaves the car exactly where it sits. Switching
 * between two forecourt-requiring channels keeps the same forecourt slot -
 * only a transition across the forecourt/trade-network line is a real move,
 * in whichever direction it happens. Delisting is the reverse: a car coming
 * off the forecourt returns to a real slot, falling back to the grace slot,
 * refusing (silently, no state change) only when even that is taken.
 */
export function resolveSetForSale(
  state: GameState,
  carInstanceId: string,
  forSale: boolean,
  context: SimContext,
  channelId: SellingChannelId = 'shopFront',
): SetForSaleResult {
  const owned = state.ownedCars.some((c) => c.id === carInstanceId)
  if (!owned) return { state, log: [] }
  const existing = state.carsForSale.find((f) => f.carInstanceId === carInstanceId)
  const onForecourt = state.forecourtCarIds.includes(carInstanceId)
  const channel = context.economy.sellingChannels[channelId]

  if (!forSale) {
    if (!existing) return { state, log: [] }
    let placedState = state
    if (onForecourt) {
      const placed = tryAssignToRealOrGrace(releaseCarFromShop(state, carInstanceId), carInstanceId)
      if (!placed) return { state, log: [] } // nowhere real (or grace) to put it back - refuse
      placedState = placed
    }
    return {
      state: {
        ...placedState,
        carsForSale: placedState.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
        pendingOffers: placedState.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
      },
      log: [],
    }
  }

  if (existing && existing.channelId === channelId && !channel.oneDrawNextEndDay) {
    return { state, log: [] }
  }

  // A channel nobody has put your name forward for is not a channel you can
  // list on. Quiet refusal, the same silent gate-reason idiom the cash and
  // ownership gates above use: the picker simply does not offer a channel
  // that is not open yet.
  if (!isSellingChannelUnlocked(state, context, channelId)) return { state, log: [] }

  const feeYen = channel.feeYen
  if (state.cashYen < feeYen) return { state, log: [] }

  let placedState = state
  if (channel.requiresForecourt) {
    if (!onForecourt) {
      if (!hasForecourtSpace(state)) {
        return {
          state,
          log: [{ type: 'acquisition-blocked', kind: 'listing', reason: 'no-forecourt-space' }],
        }
      }
      placedState = assignToForecourt(releaseCarFromShop(state, carInstanceId), carInstanceId)
    }
    // else: already on the forecourt, switching between two forecourt
    // channels - the same slot carries over, no release-and-retake.
  } else if (onForecourt) {
    // Switching away from a forecourt channel to one that doesn't need it
    // (the trade network) - a real move back to a real slot or grace.
    const placed = tryAssignToRealOrGrace(releaseCarFromShop(state, carInstanceId), carInstanceId)
    if (!placed) return { state, log: [] }
    placedState = placed
  }

  const entry: ForSaleEntry = {
    carInstanceId,
    offersSeen: resolveOffersSeenForNewListing(existing, context.economy),
    channelId,
    weekendMeetPending: channel.oneDrawNextEndDay === true,
  }
  const listedState: GameState = {
    ...placedState,
    cashYen: placedState.cashYen - feeYen,
    carsForSale: [
      ...placedState.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
      entry,
    ],
  }
  // A listing fee is charged FOR this car, so it goes on this car's ledger;
  // rent, bays, staff and machine-shop hire are running costs and stay off
  // it. A free channel posts nothing at all,
  // the same silent no-op a zero attendance fee already gets - writing a 0
  // would mint a ledger entry for a car that has none and say nothing.
  if (feeYen <= 0) return { state: listedState, log: [] }
  const log: DayLogEntry[] = [{ type: 'car-listed', carInstanceId, channelId, feeYen }]
  return {
    state: bookCashMovements(
      updateCarLedger(listedState, carInstanceId, (l) => ({
        ...l,
        listingFeesYen: l.listingFeesYen + feeYen,
      })),
      log,
      context.economy,
    ),
    log,
  }
}

/**
 * Turn an offer down explicitly.
 *
 * Drops just that car's pending offer and leaves `carsForSale` alone, so
 * the car stays on the market and tomorrow's `drawDailyOffers` can bring a
 * better one. The removal itself is the same one `resolveSetForSale`'s
 * un-list branch already performs, scoped to the offer instead of the
 * listing.
 *
 * Deliberately no reputation cost: turning down a lowball is a
 * negotiation, not a slight. A no-op (unknown car, no live offer) returns
 * the state untouched with an empty log, like every other resolver here.
 */
export function resolveRejectOffer(state: GameState, carInstanceId: string): SetForSaleResult {
  const offer = state.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
  if (!offer) return { state, log: [] }
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  return {
    state: {
      ...state,
      pendingOffers: state.pendingOffers.filter((o) => o.carInstanceId !== carInstanceId),
    },
    log: [
      {
        type: 'offer-rejected',
        carInstanceId,
        modelId: car.modelId,
        buyerId: offer.buyerId,
        priceYen: offer.priceYen,
      },
    ],
  }
}

export interface DailyOfferDrawResult {
  state: GameState
  log: DayLogEntry[]
}

/** `chance`, clamped into a real [0, 1] probability - every channel's own
 * offer-chance factor multiplies `offerChanceFor`'s base and needs the same
 * clamp that function already applies to its own result. */
function clampedChance(chance: number): number {
  return Math.max(0, Math.min(1, chance))
}

/**
 * A persona-priced channel draw: the same weighted persona pick
 * `sellViaWalkIn` uses, priced through the channel's own taste band
 * (`valuateCarForBuyerViaChannel`, this player's own `sceneStanding` raising
 * the band for a scene the shop is known in). When `matchedOnly` is set, the
 * picked persona's want must additionally be MATCHED (`isTasteMatched` - the
 * buyer/car score test, never the priced band) before anything is priced - a
 * mismatch draws no offer at all, the ad (or the meet) simply drew nobody
 * today, never a hidden penalty. Without it, the wrong crowd for a channel
 * simply never pays above its ceiling; there is no separate no-show roll.
 * Covers shopFront/freeAdsPaper (`matchedOnly` unset) and
 * tunerMagazine/weekendMeet/collectorNetwork (`matchedOnly` true) with one
 * function, driven entirely by the channel's own content flags. Priced
 * through the Stage F quality draw at this listing's own `offersSeen`,
 * replacing the old flat uniform spread band.
 */
function drawPersonaChannelOffer(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  heatPercent: number,
  tasteCeiling: number,
  matchedOnly: boolean,
  offersSeen: number,
  rng: Rng,
  weighting: ChannelDrawWeighting,
  sceneStanding: SceneStanding,
): SaleOffer | undefined {
  const picked = pickWeightedCandidate(
    car,
    model,
    context.buyers,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    rng,
    weighting,
  )
  if (!picked) return undefined
  if (matchedOnly) {
    const matched = isTasteMatched(
      picked.buyer,
      model,
      car,
      context.partsById,
      context.partsTaxonomy,
      context.economy,
    )
    if (!matched) return undefined
  }

  const value = valuateCarForBuyerViaChannel(
    picked.buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    tasteCeiling,
    sceneStanding,
  )
  const quality = drawQualityFraction(offersSeen, context.economy, rng)
  const priceYen = Math.round(value * quality)
  return { buyerId: picked.buyer.id, priceYen }
}

/**
 * tradeNetwork: no persona, no taste roll - the offer is priceBand-uniform
 * around plain `marketValueYen`, the buyer presented as the trade network
 * itself (`TRADE_NETWORK_BUYER_ID`). Driven by the channel carrying a
 * `priceBand` rather than a `tasteCeiling` - the one genuinely id-specific
 * behaviour left in the pricing shape, expressed as a flag rather than a
 * special case.
 */
function drawTradeNetworkOffer(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  heatPercent: number,
  priceBand: { min: number; max: number },
  rng: Rng,
): SaleOffer {
  const value = marketValueYen(
    model,
    car,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const { min, max } = priceBand
  const priceYen = Math.round(value * (min + rng.next() * (max - min)))
  return { buyerId: TRADE_NETWORK_BUYER_ID, priceYen }
}

interface ChannelDraw {
  offer?: SaleOffer
  /** Present only for a channel carrying `oneDrawNextEndDay` (`weekendMeet`,
   * `collectorNetwork`) - whether its one-shot flag is still owed after this
   * draw. Always `false` the moment a draw runs, hit or miss (the guaranteed
   * draw is spent either way). */
  weekendMeetPending?: boolean
  /**
   * Whether a buyer genuinely showed up today - `offersSeen` increments
   * exactly when this is true (`drawDailyOffers`), hit (a real offer got
   * priced) or miss (the visitor showed up but `matchedOnly`/tier-interest
   * rejected them, so no offer). This is deliberately NOT "did a cadence
   * roll happen" - the cadence roll runs every day a car is listed on a
   * standard channel regardless of the car's own desirability, so counting
   * that would make `offersSeen` a day count wearing a new name, exactly
   * the bug this sprint exists to fix. It is CLEARING that roll - the
   * chance itself already scaled by rarity/heat/staleness - that means
   * someone actually came to look, which is the one thing `offersSeen` is
   * allowed to measure. A specialist car's own low chance is therefore
   * what protects it: the roll rarely clears, so its clock rarely advances.
   */
  attempted: boolean
}

/**
 * A single channel's own draw: dispatches on its content flags rather than
 * its id, so a NEW channel needs only a `sellingChannels` entry with the
 * right combination of existing flags - never a code change here. `priceBand`
 * selects the trade-network-shaped, no-persona pricing; anything else prices
 * through the weighted-persona path, additionally gated on `matchedOnly`
 * when that flag is set. `SellingChannelSchema`'s own refine guarantees a
 * `tasteCeiling` accompanies every non-`priceBand` channel. `offersSeen` is
 * this listing's own Stage F clock, threaded through to whichever pricing
 * path actually reads it (the persona path's quality draw; the trade
 * network's flat `priceBand` ignores it, by design - see `sale-value-
 * system.md` S4/S6).
 */
function drawFlaggedChannelOffer(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  heatPercent: number,
  channel: SellingChannelConfig,
  offersSeen: number,
  rng: Rng,
  reputationTier: ReputationTier,
  sceneStanding: SceneStanding,
  wordOfMouth: Readonly<Partial<Record<BuyerArchetype, number>>>,
): SaleOffer | undefined {
  if (channel.priceBand) {
    return drawTradeNetworkOffer(car, model, context, heatPercent, channel.priceBand, rng)
  }
  return drawPersonaChannelOffer(
    car,
    model,
    context,
    heatPercent,
    channel.tasteCeiling!,
    channel.matchedOnly === true,
    offersSeen,
    rng,
    channelDrawWeighting(channel, reputationTier, context.economy, wordOfMouth),
    sceneStanding,
  )
}

/**
 * Today's cadence roll for a channel priced against `baseChance`, driven by
 * whichever cadence shape the channel carries (`SellingChannelSchema`'s own
 * refine guarantees exactly one): `offerChanceFactor` scales uniformly,
 * `offerChanceFactorByRarity` scales per this model's `CarRarity`.
 * `oneDrawNextEndDay` channels never reach this function - they are the
 * guaranteed single draw handled directly in `drawOfferForChannel`.
 */
function cadenceChanceFor(
  channel: SellingChannelConfig,
  model: CarModel,
  baseChance: number,
): number {
  if (channel.offerChanceFactorByRarity) {
    return clampedChance(baseChance * channel.offerChanceFactorByRarity[model.rarity])
  }
  return clampedChance(baseChance * channel.offerChanceFactor!)
}

/**
 * One listed car's channel-aware offer draw for the day about to begin -
 * reads the listing's own `channelId` only to look up its content
 * (`context.economy.sellingChannels`), never to branch on it.
 * `oneDrawNextEndDay` channels (`weekendMeet`, `collectorNetwork`) get their
 * guaranteed single draw, gated on BOTH `weekendMeetPending` and
 * `calendar.isMeetDay(day, ...)` - the meet has one real day on the calendar,
 * not whichever day happens to be the next End Day after listing - so BOTH
 * one-draw channels currently share that same weekly day; the Collector
 * Network's advertised fortnightly rhythm is a fiction the schema has no
 * separate cadence shape for yet, not a second calendar landmark. Staleness
 * does not gate the draw (it is not a chance roll at all), but it still
 * prices through this listing's own `offersSeen`. A car listed on a non-meet
 * day simply stays pending until the meet's day arrives. Every other
 * channel's daily chance is `offerChanceFor` multiplied by
 * `stalenessFor(entry.offersSeen)`
 * (Stage F: staleness multiplies the chance, it never replaces it); CLEARING
 * that roll is what `attempted` means (see `ChannelDraw` above) - a car
 * whose own chance is low clears it rarely, so its clock advances rarely,
 * which is the whole of the specialist protection this sprint exists for.
 */
function drawOfferForChannel(
  car: CarInstance,
  model: CarModel,
  entry: ForSaleEntry,
  context: SimContext,
  heatPercent: number,
  rng: Rng,
  day: number,
  reputationTier: ReputationTier,
  sceneStanding: SceneStanding,
  wordOfMouth: Readonly<Partial<Record<BuyerArchetype, number>>>,
): ChannelDraw {
  const channel = context.economy.sellingChannels[entry.channelId]

  if (channel.oneDrawNextEndDay) {
    if (!entry.weekendMeetPending || !isMeetDay(day, context.economy)) {
      return { attempted: false }
    }
    return {
      offer: drawFlaggedChannelOffer(
        car,
        model,
        context,
        heatPercent,
        channel,
        entry.offersSeen,
        rng,
        reputationTier,
        sceneStanding,
        wordOfMouth,
      ),
      weekendMeetPending: false,
      attempted: true,
    }
  }

  const staleness = stalenessFor(entry.offersSeen, context.economy)
  const baseChance = offerChanceFor(model, heatPercent, context.economy) * staleness
  if (rng.next() >= cadenceChanceFor(channel, model, baseChance)) return { attempted: false }
  return {
    offer: drawFlaggedChannelOffer(
      car,
      model,
      context,
      heatPercent,
      channel,
      entry.offersSeen,
      rng,
      reputationTier,
      sceneStanding,
      wordOfMouth,
    ),
    attempted: true,
  }
}

/** One buyer's own odds through a channel today - every field a pure read of
 * the same terms `drawOfferForChannel` above rolls against. */
export interface BuyerArrivalOdds {
  buyerId: string
  /** How strongly this archetype turns up for this car through this channel:
   * their `tierPreferences` weight for its league (or the channel's
   * `poolWidening` where they state none), times their culture affinity,
   * times the channel's own authored weight raised to the standing focus
   * exponent, times their scene's word of mouth. */
  poolWeight: number
  /** What this buyer values the car at - the size bias in the draw, and NOT
   * what they would offer for it (a channel prices its own draw through its
   * taste ceiling and the quality curve). */
  valuationYen: number
  /** `valuationYen * poolWeight`: this buyer's tickets in the hat. */
  drawWeight: number
  /** This buyer's share of the hat. */
  shareOfDraw: number
  /** P(the day's draw clears AND this buyer is the one it brings). */
  arrivalChance: number
  /** P(that visit also leaves an offer). Equal to `arrivalChance` except on a
   * `matchedOnly` channel this buyer's taste does not match, where it is 0:
   * they came, they counted against the listing, and they left nothing. */
  offerChance: number
  /** Whether this buyer's taste matches the car (`isTasteMatched`). Only a
   * `matchedOnly` channel gates on it. */
  tasteMatched: boolean
}

/** A channel's own odds for one car on one day. */
export interface ChannelArrivalOdds {
  channelId: SellingChannelId
  /**
   * P_draw: the chance the day's roll clears and somebody comes to look. It
   * is also exactly the chance this listing's `offersSeen` advances today,
   * since clearing the roll is what `attempted` means - and it stays true
   * when nobody in the pool wants this league of car, which is a visit that
   * counts and leaves nothing.
   */
  arrivalChance: number
  /** P(an offer is actually priced today) - the buyers' own `offerChance`
   * summed. Below `arrivalChance` on a `matchedOnly` channel, and on a car no
   * archetype the channel reaches has any interest in. */
  offerChance: number
  /** The hat's total weight. Zero with candidates present means every one of
   * them values the car at nothing and the pick falls back to a uniform draw
   * over the same candidates. */
  totalDrawWeight: number
  /** Whether that uniform fallback is what `shareOfDraw` reports. */
  uniformFallback: boolean
  buyers: BuyerArrivalOdds[]
  /** The id an offer is attributed to on a channel with no buyer pool at all
   * (`tradeNetwork` is a fax to the dealer circle, never a named persona).
   * Undefined on every persona channel. */
  nonBuyerOfferId?: string
}

/** What to ask the odds about, where the listing's own answer is not the
 * question: an unlisted car, a channel it is not on, or a different day. */
export interface ArrivalOddsOverrides {
  /** Defaults to this car's live listing entry, or 0 when it has none. */
  offersSeen?: number
  /** The day the draw runs on - only a one-draw channel reads it (the meet
   * has a real day on the calendar). Defaults to `state.day`. */
  day?: number
  /** Defaults to this model's own market heat. */
  heatPercent?: number
  /** Whether a one-draw channel still owes its guaranteed draw. Defaults to
   * the live entry's flag when the car is listed on THIS channel, and to true
   * otherwise (what listing on it now would set). */
  weekendMeetPending?: boolean
}

/**
 * The closed form behind `drawOfferForChannel` above: who a channel can bring
 * to this car today, and with what probability, with no roll taken. Reads the
 * same content, the same weights and the same chance terms the live draw does,
 * so a preview and the roll can never describe different odds.
 *
 * **This is a SINGLE-DAY probability and nothing else.** It cannot be raised
 * to a power for a week: staleness keys off `offersSeen`, which advances only
 * on a day the roll clears, so the listing's own chance changes underneath a
 * multi-day question. Across days this is a Markov chain on `offersSeen`, with
 * this expression as its one-step transition - still exact, but iterated
 * rather than repeated. A caller showing a figure must say which it is showing.
 *
 * The branches are the live draw's own:
 * - The four standard channels roll a cadence chance against
 *   `offerChanceFor x stalenessFor`.
 * - `weekendMeet` and `collectorNetwork` are the one guaranteed draw, gated on
 *   the meet's own day and on the draw still being owed. Rarity, heat and
 *   staleness gate nothing there, though the draw is still PRICED through the
 *   listing's `offersSeen`.
 * - `tradeNetwork` has no buyer pool at all: it prices off plain market value
 *   and attributes the offer to `nonBuyerOfferId`, so `buyers` is empty.
 *
 * `offersSeen` defaults to this car's live listing entry whatever channel it
 * sits on. That is the entry's face value: a real re-list onto a DIFFERENT
 * channel would carry it forward at `liquidity.relistRecovery` instead, so ask
 * about another channel by passing `offersSeen` rather than trusting the
 * default.
 */
export function channelArrivalOddsFor(
  car: CarInstance,
  model: CarModel,
  channelId: SellingChannelId,
  state: GameState,
  context: SimContext,
  overrides: ArrivalOddsOverrides = {},
): ChannelArrivalOdds {
  const { economy } = context
  const channel = economy.sellingChannels[channelId]
  const entry = state.carsForSale.find((f) => f.carInstanceId === car.id)
  const offersSeen = overrides.offersSeen ?? entry?.offersSeen ?? 0
  const day = overrides.day ?? state.day
  const heatPercent = overrides.heatPercent ?? state.marketHeat[model.id] ?? 100
  const weekendMeetPending =
    overrides.weekendMeetPending ??
    (entry?.channelId === channelId ? entry.weekendMeetPending === true : true)

  const arrivalChance = channel.oneDrawNextEndDay
    ? weekendMeetPending && isMeetDay(day, economy)
      ? 1
      : 0
    : cadenceChanceFor(
        channel,
        model,
        offerChanceFor(model, heatPercent, economy) * stalenessFor(offersSeen, economy),
      )

  if (channel.priceBand) {
    return {
      channelId,
      arrivalChance,
      offerChance: arrivalChance,
      totalDrawWeight: 0,
      uniformFallback: false,
      buyers: [],
      nonBuyerOfferId: TRADE_NETWORK_BUYER_ID,
    }
  }

  const weighting = channelDrawWeighting(
    channel,
    state.reputationTier,
    economy,
    wordOfMouthMultipliers(state, economy),
  )
  const candidates = saleCandidates(model, context.buyers, weighting).map((candidate) => {
    const valuationYen = valuateCarForBuyer(
      candidate.buyer,
      model,
      car,
      context.partsById,
      context.partsTaxonomy,
      context.partsTaxonomyById,
      heatPercent,
      economy,
    )
    return { ...candidate, valuationYen, drawWeight: valuationYen * candidate.poolWeight }
  })
  const totalDrawWeight = candidates.reduce((sum, candidate) => sum + candidate.drawWeight, 0)
  const uniformFallback = totalDrawWeight <= 0 && candidates.length > 0
  const matchedOnly = channel.matchedOnly === true

  const buyers = candidates.map((candidate) => {
    const shareOfDraw = uniformFallback
      ? 1 / candidates.length
      : totalDrawWeight > 0
        ? candidate.drawWeight / totalDrawWeight
        : 0
    const tasteMatched = isTasteMatched(
      candidate.buyer,
      model,
      car,
      context.partsById,
      context.partsTaxonomy,
      economy,
    )
    const buyerArrivalChance = arrivalChance * shareOfDraw
    return {
      buyerId: candidate.buyer.id,
      poolWeight: candidate.poolWeight,
      valuationYen: candidate.valuationYen,
      drawWeight: candidate.drawWeight,
      shareOfDraw,
      arrivalChance: buyerArrivalChance,
      offerChance: matchedOnly && !tasteMatched ? 0 : buyerArrivalChance,
      tasteMatched,
    }
  })

  return {
    channelId,
    arrivalChance,
    offerChance: buyers.reduce((sum, buyer) => sum + buyer.offerChance, 0),
    totalDrawWeight,
    uniformFallback,
    buyers,
  }
}

/**
 * The daily offer-draw step, called once per advanceDay tick for `day`, the
 * day about to begin (the caller passes `next.day + 1`, same convention as
 * every other day-boundary generator in advanceDay.ts): every for-sale,
 * still-owned car draws through its own listing channel
 * (`drawOfferForChannel`); a hit becomes today's live offer on that car.
 * `pendingOffers` is REPLACED wholesale, not accumulated (the no-reflex
 * rule: an offer is valid the day it's drawn for only - see advanceDay.ts's
 * own call-site comment for the full day-cycle reasoning). `carsForSale`
 * entries are pruned to still-owned cars in the same pass, so a sold (or
 * otherwise departed) car's toggle never lingers.
 *
 * Word of mouth (docs/sprints/sprint_archive/scene-standing-arc.md step 5) is computed
 * once here, off `state` alone, rather than once per car - nothing it reads
 * (`sceneStanding`, `sceneLedger`, `day`) changes within this pass.
 */
export function drawDailyOffers(
  state: GameState,
  context: SimContext,
  rng: Rng,
  day: number,
): DailyOfferDrawResult {
  const ownedIds = new Set(state.ownedCars.map((c) => c.id))
  const stillListed = state.carsForSale.filter((f) => ownedIds.has(f.carInstanceId))
  const carsForSale: ForSaleEntry[] = []
  const pendingOffers: PendingSaleOffer[] = []
  const log: DayLogEntry[] = []
  const wordOfMouth = wordOfMouthMultipliers(state, context.economy)

  for (const entry of stillListed) {
    const car = state.ownedCars.find((c) => c.id === entry.carInstanceId)
    const model = car ? context.modelsById[car.modelId] : undefined
    if (!car || !model) {
      carsForSale.push(entry)
      continue
    }

    const heatPercent = state.marketHeat[car.modelId] ?? 100
    const draw = drawOfferForChannel(
      car,
      model,
      entry,
      context,
      heatPercent,
      rng,
      day,
      state.reputationTier,
      state.sceneStanding,
      wordOfMouth,
    )
    carsForSale.push({
      ...entry,
      offersSeen: draw.attempted ? entry.offersSeen + 1 : entry.offersSeen,
      ...(draw.weekendMeetPending === undefined
        ? {}
        : { weekendMeetPending: draw.weekendMeetPending }),
    })
    if (draw.offer) {
      pendingOffers.push({
        carInstanceId: car.id,
        buyerId: draw.offer.buyerId,
        priceYen: draw.offer.priceYen,
      })
      log.push({
        type: 'offer-received',
        carInstanceId: car.id,
        modelId: car.modelId,
        buyerId: draw.offer.buyerId,
        priceYen: draw.offer.priceYen,
      })
    }
  }

  return { state: { ...state, carsForSale, pendingOffers }, log }
}

export interface SaleResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The climbing chain's own state transition (docs/sprints/
 * scene-standing-arc.md step 0): given the power (in PS) of the car just
 * delivered, decide the next `GameState.powerExpectationChain`. A delivery
 * that beats the existing best outright (or the very first delivery ever,
 * `chain` undefined) is a NEW personal best - the chain restarts at step 0.
 * A delivery that clears the CURRENT bar (`currentPowerExpectationBarPs`)
 * without beating the best climbs one step, capped at the table's last row.
 * A delivery below the current bar changes nothing - the top of the market
 * only moves when something actually meets or beats what it is already
 * asking for.
 */
export function advancePowerExpectationChain(
  chain: PowerExpectationChain | undefined,
  deliveredPowerPs: number,
  economy: EconomyConfig,
): PowerExpectationChain {
  if (!chain || deliveredPowerPs > chain.bestPowerPs) {
    return { bestPowerPs: deliveredPowerPs, climbedSteps: 0 }
  }
  const bar = currentPowerExpectationBarPs(chain, economy)
  if (bar !== undefined && deliveredPowerPs >= bar) {
    const steps = economy.statFormulas.powerExpectationChainStepDiscounts
    return { ...chain, climbedSteps: Math.min(chain.climbedSteps + 1, steps.length - 1) }
  }
  return chain
}

/**
 * What one sale outcome pays in reputation (progression bible, fifth
 * amendment). Never negative and never zero-by-subtraction: a buyer who did
 * not get what they came for simply pays nothing, and nothing in the game
 * takes reputation away.
 */
export function saleReputationBonusFor(outcome: SaleOutcome, economy: EconomyConfig): number {
  if (outcome === 'delighted') return economy.reputation.delightedSaleBonus
  if (outcome === 'satisfied') return economy.reputation.satisfiedSaleBonus
  return 0
}

/**
 * Resolve today's live offer on `carInstanceId`, if one exists - the sale
 * mechanics (reputation, market-heat ledger, staged-work cleanup, event
 * log) are this resolver's plumbing; the PRICE comes from consuming
 * today's pre-rolled `state.pendingOffers` entry (drawn by
 * `drawDailyOffers` at the end of the PREVIOUS day), never a fresh roll on
 * click. A no-op (no offer live today, or the car isn't owned) leaves
 * state untouched, same contract as every other instant resolver in this
 * file. Seeded/random only via the offer already stored in state - this
 * function itself makes no further rolls, so a repeat call is inert once
 * the offer's gone.
 */
export function resolveSellViaWalkIn(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): SaleResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const offer = state.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
  if (!offer) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model) return { state, log: [] }

  // MATCHED (the same definition `drawDailyOffers`' channel draws use,
  // `isTasteMatched`): the buyer's want is genuinely met by this car, tested
  // on the taste SCORE, never on the priced band - a raised standing floor
  // can never make this easier to clear. `trade-network` (the trade
  // channel's non-persona buyer) never resolves to a real Buyer, so a trade
  // sale is never matched; a channel with no ceiling (tradeNetwork) is the
  // same tell and is kept as the same gate.
  const listingChannelId = state.carsForSale.find(
    (f) => f.carInstanceId === carInstanceId,
  )?.channelId
  const buyer = context.buyers.find((b) => b.id === offer.buyerId)
  const tasteCeiling = listingChannelId
    ? context.economy.sellingChannels[listingChannelId].tasteCeiling
    : undefined
  const matched =
    buyer !== undefined && tasteCeiling !== undefined
      ? isTasteMatched(buyer, model, car, context.partsById, context.partsTaxonomy, context.economy)
      : false

  // Reputation reads the buyer's own verdict on the car they were sold, and
  // nothing else (progression bible, fifth amendment): no condition band, no
  // authenticity, no derived stat read directly. No real buyer behind the
  // offer means nobody to be pleased or disappointed, which is the trade
  // network's whole character - it pays cash and says nothing about you.
  const saleOutcome: SaleOutcome =
    buyer === undefined
      ? 'nothing'
      : saleOutcomeFor(buyer, model, car, context.partsById, context.partsTaxonomy, context.economy)
  const reputationDelta = saleReputationBonusFor(saleOutcome, context.economy)
  const clearedState = dissolveAssembliesForCar(
    clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId),
    carInstanceId,
  )
  // The applied delta always equals the nominal one now: reputation only ever
  // rises, so `applyReputationDelta`'s zero floor can never bind on a sale.
  const released = applyReputationDelta(clearedState, reputationDelta, context.economy)

  // Realised profit against the ledger recorded since acquisition - only when
  // the purchase price itself is known.
  const ledger = carLedgerFor(state, carInstanceId)
  const profitYen = realisedProfitYen(offer.priceYen, ledger)

  // Computed against the original, pre-sale `state`/`car` - the same snapshot
  // every other figure above reads from, before this sale's own
  // reputation/heat effects apply.
  const saleRevealLine = saleRevealLineFor(car, model, state, context)

  // The climbing chain's own update (docs/sprints/sprint_archive/scene-standing-arc.md step
  // 0): the delivered car's power, exactly as `normalizedPowerScore` reads
  // it for taste, is this delivery's measurement of "the top of the market".
  const deliveredPowerPs = computeDerivedStats(
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.economy,
  ).power
  const powerExpectationChain = advancePowerExpectationChain(
    state.powerExpectationChain,
    deliveredPowerPs,
    context.economy,
  )

  // Scene standing's own earn event (docs/sprints/sprint_archive/scene-standing-arc.md step
  // 4): a MATCHED sale credits the buyer's own archetype - never a tag, and
  // never reachable through `tradeNetwork` since `matched` is already false
  // whenever there is no real `Buyer`/`tasteCeiling` (the trade's own
  // non-persona buyer, above).
  const releasedWithStanding =
    matched && buyer !== undefined
      ? creditSceneDelivery(
          released,
          buyer.archetype,
          {
            carInstanceId,
            modelId: car.modelId,
            priceYen: offer.priceYen,
            day: state.day,
            fitmentClass: fitmentClassForTier(model.tier),
          },
          context.economy,
        )
      : released

  const log: DayLogEntry[] = [
    {
      type: 'car-sold',
      carInstanceId,
      channel: 'walk-in-offer',
      priceYen: offer.priceYen,
      ...(profitYen !== null ? { profitYen } : {}),
      ...(saleOutcome === 'nothing' ? {} : { reputationDelta, saleQuality: saleOutcome }),
      ...(saleRevealLine !== undefined ? { saleRevealLine } : {}),
      ...(matched ? { matchedSale: true as const } : {}),
    },
  ]
  return {
    state: bookCashMovements(
      bumpPlayerSales(
        deleteCarLedger(
          {
            ...releasedWithStanding,
            cashYen: releasedWithStanding.cashYen + offer.priceYen,
            ownedCars: releasedWithStanding.ownedCars.filter((c) => c.id !== carInstanceId),
            carsForSale: releasedWithStanding.carsForSale.filter(
              (f) => f.carInstanceId !== carInstanceId,
            ),
            pendingOffers: releasedWithStanding.pendingOffers.filter(
              (o) => o.carInstanceId !== carInstanceId,
            ),
            powerExpectationChain,
          },
          carInstanceId,
        ),
        car.modelId,
      ),
      log,
      context.economy,
    ),
    log,
  }
}

export interface ScrapShellResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * What scrapping a whole shell pays: `model.bookValueYen` at
 * `economy.bands.scrapValueFraction`, the same "pennies on the yen" rate a
 * single scrapped part fetches (`scrapValueYen`, bands.ts). Flat, and blind to
 * what is still bolted to the car - a stripped shell and a loaded one weigh the
 * same at the yard.
 *
 * The one figure behind the resolver below, the control's own price tag before
 * the player commits, and both teardown probes, so what the screen promises and
 * what the till receives are the same number.
 */
export function scrapShellPriceYen(model: CarModel, economy: EconomyConfig): number {
  return Math.round(model.bookValueYen * economy.bands.scrapValueFraction)
}

/**
 * Scrap the whole car at once, shell and all - the end-of-the-line donor move
 * once a car is stripped down (or not worth stripping further). Pays
 * `scrapShellPriceYen` above regardless of what's still installed, removes the
 * car and every part still on it, frees its bay/grace slot, clears any staged
 * work, and deletes its ledger entry.
 *
 * Labour is `energy.actionPoints.scrapShell` (0 in shipped content), gated on
 * `laborAvailable` when raised and spent into `energySpentToday`.
 */
export function resolveScrapShell(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
  laborAvailable: number = Infinity,
): ScrapShellResult {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return { state, log: [] }
  const model = context.modelsById[car.modelId]
  if (!model) return { state, log: [] }
  const laborSlotsUsed = context.economy.energy.actionPoints.scrapShell
  if (laborSlotsUsed > laborAvailable) return { state, log: [] }

  const priceYen = scrapShellPriceYen(model, context.economy)
  const carPartIds = ALL_CAR_PART_IDS.filter((id) => car.parts[id].installed !== null)

  const clearedState = dissolveAssembliesForCar(
    clearStagedWork(releaseCarFromShop(state, carInstanceId), carInstanceId),
    carInstanceId,
  )

  const log: DayLogEntry[] = [
    { type: 'shell-scrapped', carInstanceId, modelId: car.modelId, priceYen, carPartIds },
  ]
  return {
    state: bookCashMovements(
      deleteCarLedger(
        {
          ...clearedState,
          cashYen: clearedState.cashYen + priceYen,
          ownedCars: clearedState.ownedCars.filter((c) => c.id !== carInstanceId),
          carsForSale: clearedState.carsForSale.filter((f) => f.carInstanceId !== carInstanceId),
          pendingOffers: clearedState.pendingOffers.filter(
            (o) => o.carInstanceId !== carInstanceId,
          ),
          energySpentToday: clearedState.energySpentToday + laborSlotsUsed,
        },
        carInstanceId,
      ),
      log,
      context.economy,
    ),
    log,
  }
}
