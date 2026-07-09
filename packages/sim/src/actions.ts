import { BayKindSchema, ComponentIdSchema } from '@midnight-garage/content'
import { z } from 'zod'

/**
 * Per-day input to advanceDay — ephemeral simulation input, not persisted
 * seed content, so it lives in sim rather than packages/content.
 */
const NewJobSpecSchema = z.object({
  carInstanceId: z.string().min(1),
  kind: z.enum(['repair-zone', 'install-part']),
  componentId: ComponentIdSchema,
  partInstanceId: z.string().min(1).optional(),
  laborSlotsRequired: z.number().int().positive(),
})

const LaborAssignmentSchema = z.object({
  jobId: z.string().min(1),
  laborSlots: z.number().int().positive(),
})

const BidOnLotSchema = z.object({
  lotId: z.string().min(1),
  maxBidYen: z.number().int().positive(),
})

const InspectLotActionSchema = z.object({ lotId: z.string().min(1) })

const SellViaWalkInActionSchema = z.object({ carInstanceId: z.string().min(1) })

const ListForSaleActionSchema = z.object({
  carInstanceId: z.string().min(1),
  waitDays: z.number().int().positive().optional(),
})

const BuyPartActionSchema = z.object({ partId: z.string().min(1) })

const BuyoutLotActionSchema = z.object({ lotId: z.string().min(1) })

const AcceptServiceJobActionSchema = z.object({ offerId: z.string().min(1) })

const MoveCarActionSchema = z.object({
  carInstanceId: z.string().min(1),
  to: BayKindSchema,
})

const BuyBayActionSchema = z.object({ kind: BayKindSchema })

const BuyEquipmentActionSchema = z.object({ equipmentId: z.string().min(1) })

export const DayActionsSchema = z.object({
  createJobs: z.array(NewJobSpecSchema).default([]),
  laborAssignments: z.array(LaborAssignmentSchema).default([]),
  bidsOnLots: z.array(BidOnLotSchema).default([]),
  buyoutLots: z.array(BuyoutLotActionSchema).default([]),
  inspectLots: z.array(InspectLotActionSchema).default([]),
  sellViaWalkIn: z.array(SellViaWalkInActionSchema).default([]),
  listForSale: z.array(ListForSaleActionSchema).default([]),
  buyParts: z.array(BuyPartActionSchema).default([]),
  acceptServiceJobs: z.array(AcceptServiceJobActionSchema).default([]),
  /** Bots' only path to moving cars between bays — the player moves instantly
   * via a direct store call (see sim/facilities.ts's applyMoves doc). */
  moveCars: z.array(MoveCarActionSchema).default([]),
  /** Bots' only path to buying a bay — the player buys instantly likewise. */
  buyBays: z.array(BuyBayActionSchema).default([]),
  /** Bots' only path to buying equipment — the player buys instantly likewise. */
  buyEquipment: z.array(BuyEquipmentActionSchema).default([]),
})
// Note: completing a service job is NOT a DayAction. The player resolves it
// immediately (a store call to resolveServiceJob) the moment they click
// "Complete Job", and advanceDay only enforces the per-job deadline as a
// backstop — End Day never decides a player's job is done.

export type NewJobSpec = z.infer<typeof NewJobSpecSchema>
export type LaborAssignment = z.infer<typeof LaborAssignmentSchema>
export type BidOnLotAction = z.infer<typeof BidOnLotSchema>
export type InspectLotAction = z.infer<typeof InspectLotActionSchema>
export type SellViaWalkInAction = z.infer<typeof SellViaWalkInActionSchema>
export type ListForSaleAction = z.infer<typeof ListForSaleActionSchema>
export type BuyPartAction = z.infer<typeof BuyPartActionSchema>
export type BuyoutLotAction = z.infer<typeof BuyoutLotActionSchema>
export type AcceptServiceJobAction = z.infer<typeof AcceptServiceJobActionSchema>
export type MoveCarAction = z.infer<typeof MoveCarActionSchema>
export type BuyBayAction = z.infer<typeof BuyBayActionSchema>
export type BuyEquipmentAction = z.infer<typeof BuyEquipmentActionSchema>
export type DayActions = z.infer<typeof DayActionsSchema>

/**
 * A fresh, fully-defaulted (all-empty) DayActions. One home for the shape
 * so adding an action type doesn't break every caller that builds a literal.
 */
export function emptyDayActions(): DayActions {
  return DayActionsSchema.parse({})
}
