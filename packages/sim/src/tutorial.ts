import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  TUTORIAL_LOT,
  type AuctionLot,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
  type GameState,
} from '@midnight-garage/content'
import { carOriginLabel, stockInstanceFor } from './auctions'
import { hasForcedInduction } from './bands'
import type { SimContext } from './context'
import { advanceStoryMissions } from './missions'
import { makeCarOrigin } from './provenance'

/**
 * Sprint 89 (Yuki teaches you the game). The guided tutorial's sim side: the
 * scripted auction lot and the new-career install, both layered OVER existing
 * machinery (the story-mission machine, auction generation, the bidding sim) -
 * no parallel quest or auction system. Every function here is deterministic and
 * seed-independent (the scripted car is a fixed recipe, no RNG draws), and none
 * changes an economic outcome beyond keeping the one flagged lot on the board.
 */

/** Whether the guided tutorial is live for this career. */
export function tutorialActive(state: GameState): boolean {
  return state.tutorialStatus === 'active'
}

/**
 * Sprint 95 decision 4, the radial-offer gate: while the tutorial is active
 * and Yuki's mission is not yet delivered, the service-job board is
 * deliberately Yuki-only. `generateDailyServiceJobOffers` is gated at its two
 * call sites (advanceDay's daily step and createInitialGameState's day-1
 * seed batch), never forked. Delivering the mission, or ending the tutorial
 * ('skipped' or 'done'), lifts the gate at the next generation point (the
 * following End Day). A non-tutorial career (`tutorialStatus` absent) is
 * never gated. A missing mission record counts as undelivered: a fresh
 * tutorial career is gated from the moment it is created, before
 * `advanceStoryMissions` has even offered the mission.
 */
export function radialOffersGated(state: GameState): boolean {
  if (!tutorialActive(state)) return false
  const record = state.storyMissions.find((r) => r.missionId === TUTORIAL_LOT.missionId)
  return record?.status !== 'delivered'
}

/**
 * Sprint 95 decision 5, the no-second-Wagon-R rule: while the tutorial is
 * active, random auction generation must never roll the tutorial model - the
 * shitbox rarity weighs heavily at `unknown` reputation and there is no lot
 * dedupe, so an un-scripted twin beside the scripted lot is a real day-1
 * risk. Consumed by `catalogs.ts`'s shared generation loop, which threads it
 * into `generateAuctionCatalog`'s eligible-pool filter for both the day-1
 * batch and the daily arrivals. Empty once the tutorial ends ('done' or
 * 'skipped'), so the model spawns freely afterwards.
 */
export function excludedAuctionModelIds(state: GameState): readonly string[] {
  return tutorialActive(state) ? [TUTORIAL_LOT.modelId] : []
}

/**
 * Builds the scripted tutorial lot from the `TUTORIAL_LOT` content recipe
 * (Sprint 89 decision 2) - a fixed shitbox runabout with one visible symptom
 * whose true cause is the MINOR one, so a yard inspection reveals the room's
 * fear was unearned. Pure and RNG-free: the car is fully determined by the
 * recipe, so it is byte-identical under any career seed. `expiresOnDay` is the
 * day it is live for, so it resolves at that day's End Day (a scripted lot
 * never receives a rival raise, so it only ever closes on the quiet-days /
 * backstop rule - see `advanceLotOvernight`).
 */
export function buildTutorialLot(context: SimContext, day: number): AuctionLot {
  const recipe = TUTORIAL_LOT
  const model = context.modelsById[recipe.modelId]
  if (!model) {
    throw new Error(`tutorial lot references unknown model "${recipe.modelId}"`)
  }
  const fitmentClass = fitmentClassForTier(model.tier)
  const origin = makeCarOrigin(recipe.carId, carOriginLabel(model, recipe.year), day)
  const overrideBands = new Map<CarPartId, ConditionBand>(
    recipe.partOverrides.map((o) => [o.carPartId, o.band]),
  )

  // The scripted Wagon R is naturally aspirated, so its `forcedInduction` slot
  // is legitimately empty - built exactly as a real NA lot is
  // (`generateAuctionCarInstance`), never a phantom turbo. `roadworthy` (Sprint
  // 90) grades that absent slot as sound, so the car is roadworthy the moment
  // the two taught faults (scrap tyres, the buried head tick) are cleared, with
  // no untaught defect anywhere else.
  const carHasForcedInduction = hasForcedInduction(model)
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      const band = overrideBands.get(partId) ?? recipe.baseBand
      const installed = stockInstanceFor(
        partId,
        band,
        `${recipe.carId}-part`,
        fitmentClass,
        context.stockPartByCarPartId,
        origin,
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']

  const symptomDef = context.symptomsById[recipe.symptom.symptomId]
  const remainingCauseIds = symptomDef
    ? symptomDef.causes.map((c) => c.id)
    : [recipe.symptom.trueCauseId]
  const apparentBandByPartId: Partial<Record<CarPartId, ConditionBand>> = {}
  for (const { carPartId, band } of recipe.symptom.apparent) {
    apparentBandByPartId[carPartId] = band
  }

  const car: CarInstance = {
    id: recipe.carId,
    modelId: recipe.modelId,
    year: recipe.year,
    mileageKm: recipe.mileageKm,
    color: recipe.color,
    provenanceNote: recipe.provenanceNote,
    authenticityPercent: recipe.authenticityPercent,
    parts,
    symptoms: [
      {
        symptomId: recipe.symptom.symptomId,
        trueCauseId: recipe.symptom.trueCauseId,
        remainingCauseIds,
        runTestIds: [],
      },
    ],
    apparentBandByPartId,
  }

  return {
    id: recipe.lotId,
    tier: recipe.tier,
    modelId: recipe.modelId,
    car,
    bookValueYen: model.bookValueYen,
    expiresOnDay: day,
    currentBidYen: 0,
    leadingBidder: null,
    quietDays: 0,
    playerHasBid: false,
    turnout: 'thin',
    scripted: true,
  }
}

/**
 * Keeps the scripted lot on the board while the tutorial window is open
 * (Sprint 89 decision 2). Injects the lot when the tutorial is active, its
 * mission is still live (offered or active, never delivered), the scripted car
 * is not already owned, and the lot is not already on the board - a no-op
 * otherwise, so a lot the player has already bid on is never reset, and a won
 * or delivered car ends the injection for good. Injecting while the mission is
 * merely OFFERED (not strictly accepted) is deliberate: the yard lot has to be
 * ready the moment the player reaches it on day 1, before End Day ever runs.
 */
export function ensureTutorialLot(state: GameState, context: SimContext, day: number): GameState {
  if (!tutorialActive(state)) return state
  const recipe = TUTORIAL_LOT
  const record = state.storyMissions.find((r) => r.missionId === recipe.missionId)
  if (!record || record.status === 'delivered') return state
  if (state.ownedCars.some((c) => c.id === recipe.carId)) return state
  if (state.activeAuctionLots.some((l) => l.id === recipe.lotId)) return state
  return {
    ...state,
    activeAuctionLots: [...state.activeAuctionLots, buildTutorialLot(context, day)],
  }
}

/**
 * Turns a fresh career into a tutorial career (Sprint 89 decisions 1-2). Marks
 * the tutorial active, offers the tutorial mission on day 1 via the ordinary
 * story-mission machine (`advanceStoryMissions`, reused as-is - `four-wheels`
 * gates at reputation 0, so it offers immediately), and seeds the scripted lot
 * so the Local Yard already holds it. The game layer calls this on every new
 * career; a bot/probe career built straight from `createInitialGameState`
 * never does, so its state stays free of any tutorial scaffolding.
 *
 * Sprint 95: the day-1 isolation gates (the Yuki-only job board and the
 * tutorial-model auction exclusion) do NOT live here - they are generation
 * predicates, so the tutorial intent has to exist before the day-1 board is
 * rolled. The game layer builds the state with
 * `createInitialGameState(context, seed, { tutorial: true })` and only then
 * calls this; the status stamp below is idempotent for that path, and this
 * function's own job stays what it was: mission offer + scripted lot.
 */
export function installTutorial(state: GameState, context: SimContext): GameState {
  const active: GameState = { ...state, tutorialStatus: 'active' }
  const offered = advanceStoryMissions(active, context).state
  return ensureTutorialLot(offered, context, offered.day)
}
