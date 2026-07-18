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

  // Every slot is filled (including `forcedInduction`) so the car is roadworthy
  // once the taught faults are fixed: `roadworthy` requires all 29 slots filled
  // at worn+ with no NA carve-out, and the mission's own satisfiability build
  // (Sprint 78 probe) fills the slot the same way. A tutorial car must never
  // carry an untaught defect, so this is deliberately fuller than a real NA
  // lot (whose forced-induction slot generates empty).
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
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
 */
export function installTutorial(state: GameState, context: SimContext): GameState {
  const active: GameState = { ...state, tutorialStatus: 'active' }
  const offered = advanceStoryMissions(active, context).state
  return ensureTutorialLot(offered, context, offered.day)
}
