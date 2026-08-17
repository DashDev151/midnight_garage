import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  SCRIPTED_SERVICE_JOB,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
  type GameState,
  type ServiceJob,
} from '@midnight-garage/content'
import { carOriginLabel, stockInstanceFor } from './auctions'
import { hasForcedInduction } from './bands'
import { applyDerivedBodyBands, uniformZoneStates } from './bodyPipeline'
import type { SimContext } from './context'
import { makeCarOrigin } from './provenance'
import { deriveServiceJobPayoutYen } from './serviceJobs'

/**
 * The stand owner's one-off scripted service job: the sim side of the
 * `SCRIPTED_SERVICE_JOB` content recipe, layered over the same construction
 * `tutorial.ts`'s scripted lot uses (a fixed recipe, no RNG draws) and the
 * same payout formula every generated service job prices off
 * (`deriveServiceJobPayoutYen`). Never rolled from the board: it is not a
 * `ServiceJobType` in `SERVICE_JOB_TYPES` at all, so `generateDailyServiceJobOffers`
 * can never draw it - `ensureScriptedServiceJob` below injects it directly,
 * exactly as `ensureTutorialLot` injects the scripted lot.
 */

/**
 * Builds the scripted job's fixed customer car and derives its payout
 * against that specific car - pure and RNG-free, so the recipe's own
 * `marginRoll` and task list are byte-identical under any career seed; the
 * payout figure itself still reads `state`'s real tool ownership, exactly
 * like every other generated job (`deriveServiceJobPayoutYen`), so it can
 * vary with when in a career the job happens to be injected.
 */
export function buildScriptedServiceJob(
  context: SimContext,
  day: number,
  state: GameState,
): ServiceJob {
  const recipe = SCRIPTED_SERVICE_JOB
  const model = context.modelsById[recipe.modelId]
  if (!model) {
    throw new Error(`scripted service job references unknown model "${recipe.modelId}"`)
  }
  const fitmentClass = fitmentClassForTier(model.tier)
  const origin = makeCarOrigin(recipe.carId, carOriginLabel(model, recipe.year), day)
  const overrideBands = new Map<CarPartId, ConditionBand>(
    recipe.partOverrides.map((o) => [o.carPartId, o.band]),
  )

  // The Acty is naturally aspirated, so its `forcedInduction` slot is
  // legitimately empty - built exactly as a real NA car is
  // (`generateAuctionCarInstance`), never a phantom turbo.
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

  // The scripted job's own diagnosis beat, on exactly the footing
  // `buildTutorialLot` (tutorial.ts) builds its own scripted symptom: a real
  // generated-shape symptom whose `trueCauseId` is authored rather than
  // rolled. Absent for a recipe that carries none - the car stays honest,
  // same as before this field existed.
  const recipeSymptom = recipe.symptom
  let symptoms: CarInstance['symptoms'] = []
  let apparentBandByPartId: CarInstance['apparentBandByPartId'] = null
  if (recipeSymptom) {
    const symptomDef = context.symptomsById[recipeSymptom.symptomId]
    const remainingCauseIds = symptomDef
      ? symptomDef.causes.map((c) => c.id)
      : [recipeSymptom.trueCauseId]
    symptoms = [
      {
        symptomId: recipeSymptom.symptomId,
        trueCauseId: recipeSymptom.trueCauseId,
        remainingCauseIds,
        runTestIds: [],
        latent: false,
      },
    ]
    apparentBandByPartId = Object.fromEntries(
      recipeSymptom.apparent.map(({ carPartId, band }) => [carPartId, band]),
    )
  }

  const car: CarInstance = applyDerivedBodyBands(
    {
      id: recipe.carId,
      modelId: recipe.modelId,
      year: recipe.year,
      mileageKm: recipe.mileageKm,
      factoryColour: recipe.color,
      provenanceNote: recipe.provenanceNote,
      parts,
      symptoms,
      apparentBandByPartId,
      zoneState: uniformZoneStates(recipe.baseBand, recipe.color),
    },
    model,
    context,
  )

  // A fixed margin, not a random roll (this content is deterministic) -
  // picked from the same `[marginMin, marginMax]` range every generated
  // service job's payout rolls within, so this job's payout lands on the
  // same formula, and therefore the same scale, as an ordinary tier-1 job.
  const payoutYen = deriveServiceJobPayoutYen(
    recipe.tasks,
    car,
    model,
    context,
    state,
    recipe.marginRoll,
  )

  return {
    id: recipe.jobId,
    typeId: recipe.jobId,
    customerName: recipe.customerName,
    description: recipe.description,
    tasks: recipe.tasks,
    car,
    payoutYen,
    baseReputation: recipe.baseReputation,
    deadlineDays: recipe.deadlineDays,
    expiresOnDay: day + recipe.offerLifetimeDays,
    arrivesOnDay: null,
    dueOnDay: null,
    unlocksSellingChannel: recipe.unlocksSellingChannel,
    handbackCopy: recipe.handbackCopy,
    unlockFacts: recipe.unlockFacts,
  }
}

/** Whether the scripted job's own unlock has already been claimed - the
 * persisted fact `ensureScriptedServiceJob` stops re-posting the job on, and
 * `isSellingChannelUnlocked` (selling.ts) reads for the channel it claims. */
export function isScriptedServiceJobUnlockClaimed(state: GameState): boolean {
  return (state.serviceJobChannelUnlocks ?? []).includes(SCRIPTED_SERVICE_JOB.unlocksSellingChannel)
}

/**
 * Keeps the scripted job on the board from `recipe.appearsOnDay` onward
 * while its unlock is still unclaimed - a no-op before that day (the
 * character has no reason to have called yet), a no-op once claimed (the
 * job is delivered for good, same as a story mission), and a no-op while a
 * copy is already live as an offer or an accepted job, so this never posts
 * a second one. Injecting is otherwise unconditional: unlike the tutorial
 * lot, this job is not gated behind `tutorialActive`/`radialOffersGated` -
 * it is permanent content for every career from the day it arrives.
 *
 * A no-op (rather than `buildScriptedServiceJob`'s own hard failure) when
 * `context` doesn't carry the recipe's model at all - many sim tests build a
 * narrow, synthetic `SimContext` over a handful of models, and this call is
 * unconditional on every `createInitialGameState`/`advanceDay`, so it must
 * tolerate a context that was never meant to carry the full roster.
 */
export function ensureScriptedServiceJob(
  state: GameState,
  context: SimContext,
  day: number,
): GameState {
  const recipe = SCRIPTED_SERVICE_JOB
  if (day < recipe.appearsOnDay) return state
  if (!context.modelsById[recipe.modelId]) return state
  if (isScriptedServiceJobUnlockClaimed(state)) return state
  if (state.serviceJobOffers.some((o) => o.id === recipe.jobId)) return state
  if (state.activeServiceJobs.some((j) => j.id === recipe.jobId)) return state
  return {
    ...state,
    serviceJobOffers: [...state.serviceJobOffers, buildScriptedServiceJob(context, day, state)],
  }
}
