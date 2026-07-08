import { SlotSchema, ZoneSchema } from '@midnight-garage/content'
import { z } from 'zod'

/**
 * Per-day input to advanceDay — ephemeral simulation input, not persisted
 * seed content, so it lives in sim rather than packages/content.
 */
const NewJobSpecSchema = z.object({
  carInstanceId: z.string().min(1),
  kind: z.enum(['repair-zone', 'install-part']),
  zone: ZoneSchema.optional(),
  slot: SlotSchema.optional(),
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

export const DayActionsSchema = z.object({
  createJobs: z.array(NewJobSpecSchema).default([]),
  laborAssignments: z.array(LaborAssignmentSchema).default([]),
  bidsOnLots: z.array(BidOnLotSchema).default([]),
  inspectLots: z.array(InspectLotActionSchema).default([]),
  sellViaWalkIn: z.array(SellViaWalkInActionSchema).default([]),
  listForSale: z.array(ListForSaleActionSchema).default([]),
})

export type NewJobSpec = z.infer<typeof NewJobSpecSchema>
export type LaborAssignment = z.infer<typeof LaborAssignmentSchema>
export type BidOnLotAction = z.infer<typeof BidOnLotSchema>
export type InspectLotAction = z.infer<typeof InspectLotActionSchema>
export type SellViaWalkInAction = z.infer<typeof SellViaWalkInActionSchema>
export type ListForSaleAction = z.infer<typeof ListForSaleActionSchema>
export type DayActions = z.infer<typeof DayActionsSchema>
