import { ReputationTierSchema, SessionEventInputSchema } from '@midnight-garage/content'
import type { SessionEvent, SessionEventInput } from '@midnight-garage/content'
import { z } from 'zod'

/**
 * A career script is ephemeral measurement input, not persisted seed
 * content, so it lives in sim rather than packages/content - the same
 * reasoning `actions.ts`'s `DayActions` gives for living here.
 *
 * A checkpoint is a named, disclosed assertion the replay runner
 * (`careerReplay.ts`) evaluates and reports on, never one that hard-gates:
 * nothing here fails a run until specific curve properties are signed off
 * for real. `hash` pins a `hashState` figure for
 * exact golden-master reproduction; the rest are named bands on a day's
 * observable state, for a script that wants to disclose "cash should be
 * roughly here by now" without demanding bit-for-bit reproduction.
 */
export const CareerCheckpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hash'), expected: z.string().min(1) }),
  z.object({ kind: z.literal('cashAtLeast'), amountYen: z.number().int() }),
  z.object({ kind: z.literal('cashAtMost'), amountYen: z.number().int() }),
  z.object({ kind: z.literal('carsOwned'), count: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('reputationTier'), tier: ReputationTierSchema }),
  z.object({ kind: z.literal('labourUsedAtMost'), slots: z.number().int().nonnegative() }),
])

export type CareerCheckpoint = z.infer<typeof CareerCheckpointSchema>

/** One day's worth of a career script: the typed events to replay, in
 * recorded order, plus whatever checkpoints that day carries. `events`
 * defaults empty (an idle day - rent, market heat and the rest of
 * `advanceDay`'s own day-boundary tick still run). */
export const CareerScriptDaySchema = z.object({
  day: z.number().int().positive(),
  events: z.array(SessionEventInputSchema).default([]),
  checkpoints: z.array(CareerCheckpointSchema).default([]),
})

export type CareerScriptDay = z.infer<typeof CareerScriptDaySchema>

/**
 * A recorded (or hand-built) career, replayed deterministically. `synthetic`
 * is required, not defaulted - a script's header must say plainly whether it
 * is a real recorded session or an engineering fixture built to exercise the
 * runner, so the two can never be mistaken for one another (the sprint's own
 * "never a baseline" rule for the smoke script). `seed` is the career's
 * starting seed: the session-export bundle (`SaveMenu.vue`'s
 * `exportSessionLog`) carries it as `gameState.seed`, so
 * `sessionBundleToScript` reads it straight off the bundle for any export
 * that has one; an explicit `seed` argument remains the fallback for an
 * older bundle exported before that field existed.
 */
export const CareerScriptSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  synthetic: z.boolean(),
  seed: z.number().int(),
  days: z.array(CareerScriptDaySchema),
})

export type CareerScript = z.infer<typeof CareerScriptSchema>

/** The shape `SaveMenu.vue`'s `exportSessionLog` writes: the action stream
 * (despite the field's name, `SessionEvent` rows - `logSessionEvent`'s own
 * persisted shape) and the per-day cash ledger, under a career id and the
 * day they were exported on. Declared again here (mirroring the export
 * site's own inline object literal) since the export code has no shared type
 * of its own to import. */
export interface SessionExportBundle {
  career: string
  exportedOnDay: number
  /** The career's starting seed, absent only on a bundle exported before this
   * field existed - see `sessionBundleToScript`'s own fallback below. */
  seed?: number
  actions: readonly SessionEvent[]
  ledger?: readonly unknown[]
}

/**
 * Converts an exported session bundle into a replayable `CareerScript`.
 * Given the typed vocabulary (content/sessionEvent.ts), this is close to an
 * identity map: group the recorded events by day (in recorded order,
 * `id` ascending as a tie-breaker for same-millisecond actions) and drop the
 * envelope fields a script event doesn't carry. It fails loudly, never
 * silently, the moment a recorded event's `type`/`payload` cannot be placed
 * against `SessionEventInputSchema` - the situation the two archived
 * pre-Sprint-202 sessions are in, and exactly why they stay historical
 * artefacts rather than being converted.
 *
 * `seed` reads off `bundle.seed` when present; the explicit second argument
 * is only the fallback for a bundle exported before that field existed (and
 * still overrides, so a caller with independent knowledge of the real seed
 * is never second-guessed by an absent or wrong bundle value). Neither
 * source leaves a script with no seed at all - one of the two must resolve
 * to a number, or this throws.
 */
export function sessionBundleToScript(
  bundle: SessionExportBundle,
  seed?: number,
  options: { name?: string; description?: string } = {},
): CareerScript {
  const resolvedSeed = seed ?? bundle.seed
  if (resolvedSeed === undefined) {
    throw new Error(
      `sessionBundleToScript: career "${bundle.career}" bundle carries no seed and none was ` +
        `supplied explicitly - an older export needs its seed noted down separately.`,
    )
  }
  const sorted = [...bundle.actions].sort((a, b) => a.day - b.day || (a.id ?? 0) - (b.id ?? 0))
  const dayMap = new Map<number, SessionEventInput[]>()
  for (const event of sorted) {
    const input = SessionEventInputSchema.safeParse({ type: event.type, payload: event.payload })
    if (!input.success) {
      throw new Error(
        `sessionBundleToScript: career "${bundle.career}" day ${event.day} carries an event ` +
          `type/payload SessionEventInputSchema cannot place ("${event.type}") - ` +
          `${input.error.message}`,
      )
    }
    const events = dayMap.get(event.day) ?? []
    events.push(input.data)
    dayMap.set(event.day, events)
  }
  const days: CareerScriptDay[] = [...dayMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, events]) => ({ day, events, checkpoints: [] }))
  return CareerScriptSchema.parse({
    name: options.name ?? `career-${bundle.career}`,
    description: options.description ?? `Converted from exported session "${bundle.career}".`,
    synthetic: false,
    seed: resolvedSeed,
    days,
  })
}
