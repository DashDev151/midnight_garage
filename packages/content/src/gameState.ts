import { z } from 'zod'
import { ReputationTierSchema } from './tags'
import { CarInstanceSchema } from './carInstance'
import { PartInstanceSchema } from './part'
import { StaffMemberSchema } from './staff'
import { JobKindSchema, JobSchema } from './job'
import { AuctionLotSchema, AuctionTierSchema } from './auction'
import { PublicListingSchema, SaleChannelSchema } from './sale'

export const GameStateSchema = z.object({
  day: z.number().int().min(1),
  seed: z.number().int(),
  cashYen: z.number().int(),
  reputationTier: ReputationTierSchema,
  ownedCars: z.array(CarInstanceSchema).default([]),
  partInventory: z.array(PartInstanceSchema).default([]),
  staff: z.array(StaffMemberSchema).default([]),
  jobs: z.array(JobSchema).default([]),
  /** Demand index per CarModel id, base 100 (GDD 6.4). */
  marketHeat: z.record(z.string(), z.number()).default({}),
  activeAuctionLots: z.array(AuctionLotSchema).default([]),
  activeListings: z.array(PublicListingSchema).default([]),
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
    type: z.literal('job-created'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
  }),
  z.object({
    type: z.literal('job-progress'),
    jobId: z.string().min(1),
    laborSlotsSpent: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('job-completed'),
    jobId: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
  }),
  z.object({
    type: z.literal('job-blocked'),
    jobId: z.string().min(1),
    reason: z.enum(['slot-occupied']),
  }),
  z.object({
    type: z.literal('labor-overbooked'),
    requestedSlots: z.number().int().positive(),
    availableSlots: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('service-bay-income'), amountYen: z.number().int() }),
  z.object({
    type: z.literal('market-heat-shift'),
    modelId: z.string().min(1),
    deltaPercent: z.number(),
  }),
  z.object({
    type: z.literal('auction-catalog-refreshed'),
    tier: AuctionTierSchema,
    lotCount: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('lot-inspected'), lotId: z.string().min(1) }),
  z.object({
    type: z.literal('auction-bid-won'),
    lotId: z.string().min(1),
    finalPriceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('auction-bid-lost'),
    lotId: z.string().min(1),
    winningPriceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('lot-bought-out'),
    lotId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('listing-created'),
    listingId: z.string().min(1),
    carInstanceId: z.string().min(1),
    askingPriceYen: z.number().int().positive(),
    resolvesOnDay: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('car-sold'),
    carInstanceId: z.string().min(1),
    channel: SaleChannelSchema,
    priceYen: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('part-bought'),
    partId: z.string().min(1),
    partInstanceId: z.string().min(1),
    priceYen: z.number().int().nonnegative(),
  }),
])

export const DayLogSchema = z.array(DayLogEntrySchema)

export type GameState = z.infer<typeof GameStateSchema>
export type DayLogEntry = z.infer<typeof DayLogEntrySchema>
export type DayLog = z.infer<typeof DayLogSchema>
