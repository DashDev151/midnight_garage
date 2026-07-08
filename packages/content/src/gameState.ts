import { z } from 'zod'
import { ReputationTierSchema, SlotSchema } from './tags'
import { CarInstanceSchema } from './carInstance'
import { PartInstanceSchema } from './part'
import { StaffMemberSchema } from './staff'

export const GameStateSchema = z.object({
  day: z.number().int().min(1),
  seed: z.number().int(),
  cashYen: z.number().int(),
  reputationTier: ReputationTierSchema,
  ownedCars: z.array(CarInstanceSchema).default([]),
  partInventory: z.array(PartInstanceSchema).default([]),
  staff: z.array(StaffMemberSchema).default([]),
})

/**
 * Sim contract: advanceDay(state, actions, seed) -> newState + eventLog.
 * DayLog is that eventLog — a typed record of what happened on a day, not
 * part of GameState itself.
 */
export const DayLogEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rent-paid'), amountYen: z.number().int() }),
  z.object({
    type: z.literal('wage-paid'),
    staffId: z.string().min(1),
    amountYen: z.number().int(),
  }),
  z.object({
    type: z.literal('job-progress'),
    carInstanceId: z.string().min(1),
    slot: SlotSchema,
    laborSlotsSpent: z.number().int().positive(),
  }),
  z.object({ type: z.literal('service-bay-income'), amountYen: z.number().int() }),
  z.object({
    type: z.literal('market-heat-shift'),
    modelId: z.string().min(1),
    deltaPercent: z.number(),
  }),
])

export const DayLogSchema = z.array(DayLogEntrySchema)

export type GameState = z.infer<typeof GameStateSchema>
export type DayLogEntry = z.infer<typeof DayLogEntrySchema>
export type DayLog = z.infer<typeof DayLogSchema>
