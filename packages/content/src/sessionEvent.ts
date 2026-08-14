import { z } from 'zod'
import { AssemblyIdSchema } from './assembly'
import { AuctionTierSchema } from './auction'
import { BuyerArchetypeSchema } from './buyer'
import { PaintFinishSchema, PaintTinSizeSchema, SimpleConsumableIdSchema } from './consumable'
import { BayKindSchema } from './facilities'
import { PipelineStageIdSchema } from './material'
import { SaleChannelSchema } from './sale'
import { SellingChannelIdSchema } from './economy'
import { StaffAssignmentSchema } from './staff'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema, GradeSchema } from './tags'
import { ZoneIdSchema } from './zone'

/**
 * The typed session-event vocabulary: one payload schema per player action
 * the game store logs (`logSessionEvent`, `packages/game/src/stores/
 * gameStore.ts`). Lives here, not in sim, for the same reason `DayLogEntry`
 * does: both the store (the writer) and the career-script replay
 * interpreter (a reader, `packages/sim/src/careerReplay.ts`) need one shared
 * shape to agree on, and content is the one package both sim and game
 * already depend on.
 *
 * `SessionEventInputSchema` (the `{type, payload}` pair, no envelope) is the
 * primary definition - it is exactly what a store action builds and hands to
 * `logSessionEvent`, and exactly what one event in a career script's day
 * carries. `SessionEventSchema` (the persisted row, envelope and all) is
 * derived from it rather than authored a second time, so the two can never
 * drift apart.
 *
 * This is the whole of what keeps a career script replayable: the store's
 * `logSessionEvent` accepts only `SessionEventInput` (so a call site logging
 * a type or payload shape this file doesn't know is a compile error), and
 * the replay interpreter switches over the same union exhaustively (so a
 * variant this file adds without a matching interpreter case is also a
 * compile error, the other direction). Neither side can silently drift from
 * the other.
 *
 * Three small vocabularies below (`WorkStationSchema`, `DeliverySpeedSchema`,
 * `ServiceJobOutcomeSchema`) restate string unions sim already declares as
 * plain TypeScript types (`parts.ts`'s `WorkStation`/`DeliverySpeed`,
 * `serviceJobs.ts`'s `ServiceJobOutcome`) rather than importing them -
 * content never depends on sim (the boundary law runs the other way), and
 * none of the three was ever a zod schema on the sim side to begin with, so
 * this is the one place their values are enumerated as data.
 */
const WorkStationSchema = z.enum(['workbench', 'machine'])
const DeliverySpeedSchema = z.enum(['standard', 'express'])
const ServiceJobOutcomeSchema = z.enum(['paid', 'failed', 'not-found', 'in-transit'])

/** Builds one variant of the `SessionEventInputSchema` discriminated union:
 * a literal `type` paired with its own typed `payload`, nothing else. */
function sessionEventVariant<Type extends string, Payload extends z.ZodTypeAny>(
  type: Type,
  payload: Payload,
) {
  return z.object({ type: z.literal(type), payload })
}

export const SessionEventInputSchema = z.discriminatedUnion('type', [
  sessionEventVariant('buyDyno', z.object({ priceYen: z.number().int().nonnegative().optional() })),
  sessionEventVariant('runDynoSession', z.object({ carInstanceId: z.string().min(1) })),
  sessionEventVariant(
    'machinePart',
    z.object({ partInstanceId: z.string().min(1), operationId: z.string().min(1) }),
  ),
  sessionEventVariant(
    'machineFittedPart',
    z.object({ carId: z.string().min(1), operationId: z.string().min(1) }),
  ),
  sessionEventVariant(
    'placeOnStation',
    z.object({ station: WorkStationSchema, partInstanceId: z.string().min(1) }),
  ),
  sessionEventVariant('takeFromStation', z.object({ station: WorkStationSchema })),
  sessionEventVariant('beginInspectionVisit', z.object({ tier: AuctionTierSchema })),
  sessionEventVariant(
    'runDiagnosticTest',
    z.object({
      lotId: z.string().min(1),
      symptomIndex: z.number().int().nonnegative(),
      testId: z.string().min(1),
    }),
  ),
  sessionEventVariant('resolveOwnedWorkup', z.object({ carInstanceId: z.string().min(1) })),
  sessionEventVariant('resolveSendInspector', z.object({ lotId: z.string().min(1) })),
  sessionEventVariant('moveCar', z.object({ carId: z.string().min(1), to: BayKindSchema })),
  sessionEventVariant(
    'swapCars',
    z.object({ serviceCarId: z.string().min(1), parkingCarId: z.string().min(1) }),
  ),
  sessionEventVariant(
    'moveCarToSlot',
    z.object({
      carId: z.string().min(1),
      to: BayKindSchema,
      slotIndex: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'buyBay',
    z.object({ kind: BayKindSchema, priceYen: z.number().int().nonnegative().optional() }),
  ),
  sessionEventVariant(
    'buyToolShop',
    z.object({ shopId: z.string().min(1), priceYen: z.number().int().nonnegative().optional() }),
  ),
  sessionEventVariant(
    'upgradeToolLine',
    z.object({
      componentId: ComponentIdSchema,
      priceYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'hireMachineLine',
    z.object({
      group: ComponentIdSchema,
      feeYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'attendAuction',
    z.object({
      tier: AuctionTierSchema,
      feeYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'repair',
    z.object({
      carId: z.string().min(1),
      componentId: ComponentIdSchema,
      targetBand: ConditionBandSchema,
      carPartId: CarPartIdSchema.optional(),
      costYen: z.number().int().nonnegative().optional(),
      laborSlotsUsed: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'install',
    z.object({
      carId: z.string().min(1),
      componentId: ComponentIdSchema,
      partInstanceId: z.string().min(1),
      carPartId: CarPartIdSchema.optional(),
      laborSlotsUsed: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'pipelineStage',
    z.object({
      carId: z.string().min(1),
      zoneId: ZoneIdSchema,
      stage: PipelineStageIdSchema.exclude(['paint']),
      laborSlotsUsed: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'pipelinePaint',
    z.object({
      carId: z.string().min(1),
      zoneId: ZoneIdSchema,
      colour: z.string().min(1),
      grade: GradeSchema,
      laborSlotsUsed: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'removePanel',
    z.object({
      carId: z.string().min(1),
      zoneId: ZoneIdSchema,
      laborSlotsUsed: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'installPanel',
    z.object({
      carId: z.string().min(1),
      zoneId: ZoneIdSchema,
      partInstanceId: z.string().min(1),
      laborSlotsUsed: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'removePart',
    z.object({ carId: z.string().min(1), carPartId: CarPartIdSchema }),
  ),
  sessionEventVariant(
    'removeAssembly',
    z.object({ carId: z.string().min(1), assemblyId: AssemblyIdSchema }),
  ),
  sessionEventVariant(
    'refitAssembly',
    z.object({ carId: z.string().min(1), assemblyId: AssemblyIdSchema }),
  ),
  sessionEventVariant(
    'swapAssemblyMember',
    z.object({
      containerId: z.string().min(1),
      memberSlot: CarPartIdSchema,
      partInstanceId: z.string().min(1),
    }),
  ),
  sessionEventVariant(
    'removeAssemblyMember',
    z.object({ containerId: z.string().min(1), memberSlot: CarPartIdSchema }),
  ),
  sessionEventVariant(
    'scrapPart',
    z.object({
      partInstanceId: z.string().min(1),
      priceYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'sellPart',
    z.object({
      partInstanceId: z.string().min(1),
      priceYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'reconditionPart',
    z.object({ partInstanceId: z.string().min(1), targetBand: ConditionBandSchema }),
  ),
  sessionEventVariant(
    'buyout',
    z.object({ lotId: z.string().min(1), priceYen: z.number().int().nonnegative().optional() }),
  ),
  sessionEventVariant('buyCoffee', z.object({ priceYen: z.number().int().nonnegative() })),
  sessionEventVariant(
    'settleAuctionHammer',
    z.object({ lotId: z.string().min(1), priceYen: z.number().int().nonnegative() }),
  ),
  sessionEventVariant('loseAuctionLot', z.object({ lotId: z.string().min(1) })),
  sessionEventVariant(
    'checkoutCart',
    z.object({
      deliverySpeed: DeliverySpeedSchema,
      boughtCount: z.number().int().nonnegative(),
      remainingCount: z.number().int().nonnegative(),
      items: z.array(
        z.object({ partId: z.string().min(1), priceYen: z.number().int().nonnegative() }),
      ),
      totalYen: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'buyConsumableTin',
    z.object({
      id: SimpleConsumableIdSchema,
      priceYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'buyPaintTin',
    z.object({
      finish: PaintFinishSchema,
      size: PaintTinSizeSchema,
      colour: z.string().min(1),
      priceYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant('acceptServiceJob', z.object({ offerId: z.string().min(1) })),
  sessionEventVariant('rejectServiceJobOffer', z.object({ offerId: z.string().min(1) })),
  sessionEventVariant('acceptMission', z.object({ missionId: z.string().min(1) })),
  sessionEventVariant(
    'deliverMission',
    z.object({
      missionId: z.string().min(1),
      carInstanceId: z.string().min(1),
      payoutYen: z.number().int().nonnegative().optional(),
      tipYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant('acceptSceneCommission', z.object({ scene: BuyerArchetypeSchema })),
  sessionEventVariant(
    'deliverSceneCommission',
    z.object({
      scene: BuyerArchetypeSchema,
      carInstanceId: z.string().min(1),
      payoutYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant(
    'completeServiceJob',
    z.object({
      jobId: z.string().min(1),
      outcome: ServiceJobOutcomeSchema,
      payoutYen: z.number().int().nonnegative(),
    }),
  ),
  sessionEventVariant(
    'acceptOffer',
    z.object({
      carId: z.string().min(1),
      priceYen: z.number().int().nonnegative().optional(),
      channel: SaleChannelSchema.optional(),
    }),
  ),
  sessionEventVariant('rejectOffer', z.object({ carId: z.string().min(1) })),
  sessionEventVariant(
    'setForSale',
    z.object({
      carId: z.string().min(1),
      forSale: z.boolean(),
      channelId: SellingChannelIdSchema,
    }),
  ),
  sessionEventVariant(
    'scrapShell',
    z.object({ carId: z.string().min(1), priceYen: z.number().int().nonnegative().optional() }),
  ),
  sessionEventVariant('endDay', z.object({ endedDay: z.number().int().positive() })),
  sessionEventVariant('acknowledgeTutorialStep', z.object({ stepId: z.string().min(1) })),
  sessionEventVariant('skipTutorial', z.object({})),
  sessionEventVariant('finishTutorial', z.object({})),
  sessionEventVariant(
    'hireStaff',
    z.object({
      candidateId: z.string().min(1),
      introFeeYen: z.number().int().nonnegative().optional(),
    }),
  ),
  sessionEventVariant('dismissStaff', z.object({ staffId: z.string().min(1) })),
  sessionEventVariant(
    'reassignStaff',
    z.object({ staffId: z.string().min(1), to: StaffAssignmentSchema }),
  ),
])

/**
 * What a caller actually builds and hands to `logSessionEvent` - the event's
 * own `type`/`payload` pair. `logSessionEvent` accepting only this type is
 * what makes an unlisted event type a compile error at the call site, per
 * this file's own doc comment above. Also exactly the shape one event in a
 * career script's day carries (`packages/sim/src/careerScript.ts`).
 */
export type SessionEventInput = z.infer<typeof SessionEventInputSchema>

/** Every session-event `type` string, in declaration order - the vocabulary
 * a career-script converter or a coverage test walks without hand-copying
 * the list a second time. */
export const SESSION_EVENT_TYPES = SessionEventInputSchema.options.map(
  (option) => option.shape.type.value,
) as readonly SessionEventInput['type'][]

/** The envelope every persisted session-event row carries beyond its own
 * `type`/`payload` - when it happened in career days, when it happened on
 * the wall clock, and the row's own autoincrement id once stored. */
const SessionEventEnvelopeSchema = z.object({
  id: z.number().int().nonnegative().optional(),
  day: z.number().int().positive(),
  timestamp: z.number(),
})

/**
 * One persisted session-log row (`packages/game/src/save/saveDb.ts`'s
 * `sessionEvents` table): `SessionEventInputSchema`'s `type`/`payload` pair
 * plus the envelope above. An intersection, not a second hand-authored
 * union, so the persisted shape can never drift from what
 * `SessionEventInputSchema` actually allows.
 */
export const SessionEventSchema = z.intersection(
  SessionEventInputSchema,
  SessionEventEnvelopeSchema,
)

export type SessionEvent = z.infer<typeof SessionEventSchema>
