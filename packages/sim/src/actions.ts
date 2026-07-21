import {
  BayKindSchema,
  CarPartIdSchema,
  ComponentIdSchema,
  ConditionBandSchema,
} from '@midnight-garage/content'
import { z } from 'zod'

/**
 * Per-day input to advanceDay - ephemeral simulation input, not persisted
 * seed content, so it lives in sim rather than packages/content.
 *
 * Sprint 26: `fix-issue` retired with the hidden-issue system. `targetBand`
 * (decision 5) is set for `repair-zone` specs only - how far the player is
 * staging every eligible part in the group to climb; `jobs.ts`'s
 * `repairJobGate`/`applyJobToCar` are what actually resolve it per part.
 *
 * Sprint 28: `carPartId` narrows a spec from the whole `componentId` group
 * to one specific part within it - mirrors `Job`/`StagedAction`'s own
 * addition (content package). Absent means the pre-Sprint-28 group-level
 * behavior; bots never set this (`bots/bandHelpers.ts`'s `queueGroupRepair`
 * stays group-scoped by design), so every existing queued spec is
 * unaffected.
 */
const NewJobSpecSchema = z.object({
  carInstanceId: z.string().min(1),
  kind: z.enum(['repair-zone', 'install-part']),
  componentId: ComponentIdSchema,
  partInstanceId: z.string().min(1).optional(),
  targetBand: ConditionBandSchema.optional(),
  carPartId: CarPartIdSchema.optional(),
  laborSlotsRequired: z.number().int().positive(),
})

const LaborAssignmentSchema = z.object({
  jobId: z.string().min(1),
  laborSlots: z.number().int().positive(),
})

/** Sprint 31: accept today's live pending offer on this car, resolving
 * through `resolveSellViaWalkIn`'s reputation/heat/event-log plumbing. */
const AcceptOfferActionSchema = z.object({ carInstanceId: z.string().min(1) })

/** Sprint 31: toggle "taking offers" on a car - replaces both the old
 * instant walk-in sell and list-publicly actions. */
const SetForSaleActionSchema = z.object({
  carInstanceId: z.string().min(1),
  forSale: z.boolean(),
})

const BuyPartActionSchema = z.object({
  partId: z.string().min(1),
  /** Sprint 14: defaults to 'express' (today's pre-Sprint-14 instant-buy
   * behavior) so every pre-existing caller/fixture that omits it keeps
   * working unchanged. */
  deliverySpeed: z.enum(['standard', 'express']).default('express'),
})

const BuyoutLotActionSchema = z.object({ lotId: z.string().min(1) })

/** Sprint 26 decision 6: sell a scrap `PartInstance` for scrap value - the
 * only action available on it. */
const ScrapPartActionSchema = z.object({ partInstanceId: z.string().min(1) })

/**
 * Sprint 33: bots' only path to pulling a part off a slot before installing
 * a replacement - the player does this instantly via a direct store call
 * (`resolveRemovePart`, jobs.ts) using the same Remove button that gates
 * Replace behind an empty slot. Needed because Sprint 32's stock-baseline
 * model fills every real slot by default (including a service-job
 * customer's car), so a bot's queued install task can no longer assume the
 * target slot starts empty - `bots/serviceJobHelpers.ts`'s
 * `queueServiceJobTasks` queues this first, on its own tick, exactly
 * mirroring the player's required remove-then-replace two-step.
 */
const RemovePartActionSchema = z.object({
  carInstanceId: z.string().min(1),
  carPartId: CarPartIdSchema,
})

const AcceptServiceJobActionSchema = z.object({ offerId: z.string().min(1) })

const MoveCarActionSchema = z.object({
  carInstanceId: z.string().min(1),
  to: BayKindSchema,
})

const BuyBayActionSchema = z.object({ kind: BayKindSchema })

/** Sprint 36: climb one tool line one tier (sequential, cash-gated only -
 * no reputation gate). Replaces the retired buy-equipment action. */
const UpgradeToolLineActionSchema = z.object({ componentId: ComponentIdSchema })

export const DayActionsSchema = z.object({
  createJobs: z.array(NewJobSpecSchema).default([]),
  laborAssignments: z.array(LaborAssignmentSchema).default([]),
  buyoutLots: z.array(BuyoutLotActionSchema).default([]),
  acceptOffers: z.array(AcceptOfferActionSchema).default([]),
  setForSale: z.array(SetForSaleActionSchema).default([]),
  buyParts: z.array(BuyPartActionSchema).default([]),
  scrapParts: z.array(ScrapPartActionSchema).default([]),
  removeParts: z.array(RemovePartActionSchema).default([]),
  acceptServiceJobs: z.array(AcceptServiceJobActionSchema).default([]),
  /** Bots' only path to moving cars between bays - the player moves instantly
   * via a direct store call (see sim/facilities.ts's applyMoves doc). */
  moveCars: z.array(MoveCarActionSchema).default([]),
  /** Bots' only path to buying a bay - the player buys instantly likewise. */
  buyBays: z.array(BuyBayActionSchema).default([]),
  /** Bots' only path to upgrading a tool line - the player upgrades instantly likewise. */
  upgradeToolLines: z.array(UpgradeToolLineActionSchema).default([]),
})
// Note: completing a service job is NOT a DayAction. The player resolves it
// immediately (a store call to resolveServiceJob) the moment they click
// "Complete Job", and advanceDay only enforces the per-job deadline as a
// backstop - End Day never decides a player's job is done.

export type NewJobSpec = z.infer<typeof NewJobSpecSchema>
export type LaborAssignment = z.infer<typeof LaborAssignmentSchema>
export type AcceptOfferAction = z.infer<typeof AcceptOfferActionSchema>
export type SetForSaleAction = z.infer<typeof SetForSaleActionSchema>
export type BuyPartAction = z.infer<typeof BuyPartActionSchema>
export type ScrapPartAction = z.infer<typeof ScrapPartActionSchema>
export type RemovePartAction = z.infer<typeof RemovePartActionSchema>
export type BuyoutLotAction = z.infer<typeof BuyoutLotActionSchema>
export type AcceptServiceJobAction = z.infer<typeof AcceptServiceJobActionSchema>
export type MoveCarAction = z.infer<typeof MoveCarActionSchema>
export type BuyBayAction = z.infer<typeof BuyBayActionSchema>
export type UpgradeToolLineAction = z.infer<typeof UpgradeToolLineActionSchema>
export type DayActions = z.infer<typeof DayActionsSchema>

/**
 * A fresh, fully-defaulted (all-empty) DayActions. One home for the shape
 * so adding an action type doesn't break every caller that builds a literal.
 */
export function emptyDayActions(): DayActions {
  return DayActionsSchema.parse({})
}
