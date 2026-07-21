import type { AuctionLot, CarInstance, GameState, Symptom } from '@midnight-garage/content'
import { ALL_CAR_PART_IDS, TUTORIAL_LOT, fitmentClassForTier } from '@midnight-garage/content'
import {
  carOriginLabel,
  createRng,
  hasForcedInduction,
  hashStringToSeed,
  makeCarOrigin,
  stockInstanceFor,
  type Rng,
  type SimContext,
} from '@midnight-garage/sim'

/**
 * View-local machine for the dev-only inspection demo screen
 * (InspectionDemoScreen.vue): builds one synthetic local-yard lot carrying
 * exactly the picked symptom, on the SAME fixed cheap model TUTORIAL_LOT
 * already scripts (a Wagon R runabout) - nothing here invents a
 * second demo car recipe. Every diagnosis step from there runs through the
 * real sim functions (`runDiagnosticTest`, the store's own
 * `symptomChecklistForCar`, `playerEstimateYen`); this module only rolls the
 * symptom's true cause and assembles the car/lot/state around it. Nothing
 * here reads or writes saves or any live sim state.
 */

/** The one lot id every rebuild reuses, so a run test always addresses the
 * same lot the checklist is reading. */
export const DEMO_LOT_ID = 'inspection-demo-lot'
const DEMO_CAR_ID = 'inspection-demo-car'
/** Far enough out that the demo lot's own backstop close never matters - this
 * screen never advances a day. */
const DEMO_EXPIRES_ON_DAY = 9999

/**
 * Whether a symptom's diagnostic tree actually forks (some test unlocks only
 * once a sibling has run) rather than offering every test as a root from the
 * start. The picker lists these "routed" symptoms first, since they are the
 * ones the routed-diagnosis tree (`availableTestIdsFor`) exists for.
 */
export function isRoutedSymptom(symptom: Symptom): boolean {
  return symptom.tests.some((test) => test.unlockedBy)
}

/** All of `symptoms`, routed ones first, content order preserved within each
 * group - the picker's fixed list of every symptom in content. */
export function orderedSymptoms(symptoms: readonly Symptom[]): Symptom[] {
  const routed = symptoms.filter(isRoutedSymptom)
  const flat = symptoms.filter((symptom) => !isRoutedSymptom(symptom))
  return [...routed, ...flat]
}

/**
 * Rolls a symptom's true cause with the same weighted cumulative-sum draw
 * `pickWeightedCause` (sim/auctions.ts) uses at real generation time. That
 * helper is not exported, so this mirrors its one `rng.next()` draw rather
 * than reimplementing any narrowing logic of its own - narrowing itself
 * still runs entirely through the real `runDiagnosticTest`.
 */
export function pickWeightedCauseId(symptom: Symptom, rng: Rng): string {
  const total = symptom.causes.reduce((sum, cause) => sum + cause.weight, 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (const cause of symptom.causes) {
    cumulative += cause.weight
    if (roll < cumulative) return cause.id
  }
  return symptom.causes[symptom.causes.length - 1]!.id
}

/**
 * Builds the demo car: TUTORIAL_LOT's own fixed model/year/mileage/colour/
 * provenance (the already-scripted cheap shitbox this codebase keeps for a
 * deterministic dev car), every part slot stock at the recipe's own base
 * band, carrying ONLY the chosen symptom with every cause still open
 * (`remainingCauseIds` is the full cause list, `runTestIds: []`).
 */
function buildDemoCar(symptom: Symptom, trueCauseId: string, context: SimContext): CarInstance {
  const model = context.modelsById[TUTORIAL_LOT.modelId]
  if (!model) {
    throw new Error(`inspection demo references unknown model "${TUTORIAL_LOT.modelId}"`)
  }
  const fitmentClass = fitmentClassForTier(model.tier)
  const origin = makeCarOrigin(DEMO_CAR_ID, carOriginLabel(model, TUTORIAL_LOT.year), 1)
  const carHasForcedInduction = hasForcedInduction(model)
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      const installed = stockInstanceFor(
        partId,
        TUTORIAL_LOT.baseBand,
        `${DEMO_CAR_ID}-part`,
        fitmentClass,
        context.stockPartByCarPartId,
        origin,
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']

  return {
    id: DEMO_CAR_ID,
    modelId: TUTORIAL_LOT.modelId,
    year: TUTORIAL_LOT.year,
    mileageKm: TUTORIAL_LOT.mileageKm,
    color: TUTORIAL_LOT.color,
    provenanceNote: TUTORIAL_LOT.provenanceNote,
    authenticityPercent: TUTORIAL_LOT.authenticityPercent,
    parts,
    symptoms: [
      {
        symptomId: symptom.id,
        trueCauseId,
        remainingCauseIds: symptom.causes.map((cause) => cause.id),
        runTestIds: [],
      },
    ],
    apparentBandByPartId: null,
  }
}

/**
 * Rebuilds the whole demo-local state from a chosen symptom and a seed: the
 * true cause rolls fresh from a `hashStringToSeed`-derived stream keyed to
 * both, so the same (symptom, seed) pair always reproduces the identical
 * roll (Reset) and a different seed reliably rolls a different draw
 * (Reroll). The visit is granted outright at the full
 * `economy.diagnosis.visitMinutes` - a dev tool needs no fee or labour spent
 * before looking closer.
 */
export function buildDemoState(
  gameState: GameState,
  symptom: Symptom,
  seed: number,
  context: SimContext,
): GameState {
  const rng = createRng(hashStringToSeed(`inspection-demo:${symptom.id}:${seed}`))
  const trueCauseId = pickWeightedCauseId(symptom, rng)
  const car = buildDemoCar(symptom, trueCauseId, context)
  const model = context.modelsById[TUTORIAL_LOT.modelId]!
  const lot: AuctionLot = {
    id: DEMO_LOT_ID,
    tier: 'local-yard',
    modelId: TUTORIAL_LOT.modelId,
    car,
    bookValueYen: model.bookValueYen,
    expiresOnDay: DEMO_EXPIRES_ON_DAY,
    currentBidYen: 0,
    leadingBidder: null,
    quietDays: 0,
    playerHasBid: false,
    turnout: 'steady',
  }
  return {
    ...gameState,
    activeAuctionLots: [lot],
    inspectionVisit: { tier: 'local-yard', minutesLeft: context.economy.diagnosis.visitMinutes },
  }
}
