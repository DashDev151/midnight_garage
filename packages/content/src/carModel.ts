import { z } from 'zod'
import { RarityTierSchema, TagSchema, TyreCompoundSchema, type Tag } from './tags'

const LAYOUT_TAGS = ['FR', 'FF', 'AWD', 'MR', 'RR'] as const
const INDUCTION_TAGS = ['NA', 'Turbo', 'Supercharged'] as const
const ENGINE_FAMILY_TAGS = ['Piston', 'Rotary'] as const

function countMatching(tags: readonly Tag[], set: readonly string[]): number {
  return tags.filter((t) => (set as readonly string[]).includes(t)).length
}

/** True when both halves of a measured pair are present, or neither is. */
function isCompletePair(first: number | undefined, second: number | undefined): boolean {
  return (first === undefined) === (second === undefined)
}

/**
 * True unless the faster half of a measured pair stands alone. A car too slow
 * to reach the higher test speed legitimately publishes only the lower reading,
 * and the model has a one-measurement path for exactly that; the reverse is
 * always a gap in the data rather than a fact about the car.
 */
function hasSlowerHalf(slower: number | undefined, faster: number | undefined): boolean {
  return faster === undefined || slower !== undefined
}

/**
 * Naming Layer (GDD 2.4, roadmap risk R5): `spec` holds real, immutable
 * data - unprotectable fact. `displayName`/`brand` (real) and
 * `parodyName`/`parodyBrand` are the only fields a naming-mode flip
 * touches; see naming.ts.
 *
 * There is no separate `spec.drivetrain` field: layout (FR/FF/AWD/MR/RR)
 * lives in `tags` like every other platform facet (GDD 4.4), and the
 * refinements below guarantee exactly one layout, induction, and
 * engine-family tag is present - see `layoutTagOf`.
 */
export const CarModelSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    displayName: z.string().min(1),
    brand: z.string().min(1),
    parodyName: z.string().min(1),
    parodyBrand: z.string().min(1),
    spec: z.object({
      chassisCode: z.string().min(1),
      engineCode: z.string().min(1),
      yearFrom: z.number().int().gte(1955).lte(2010),
      curbWeightKg: z.number().int().positive(),
      stockPowerPs: z.number().int().positive(),
      quotedPowerPs: z.number().int().positive().optional(),
      powerRpm: z.number().int().positive().optional(),
      peakTorqueNm: z.number().int().positive().optional(),
      torqueRpm: z.number().int().positive().optional(),
      redlineRpm: z.number().int().positive().optional(),
      displacementCc: z.number().int().positive().optional(),
      engineConfig: z
        .enum([
          'I3',
          'I4',
          'I5',
          'I6',
          'V6',
          'V8',
          'V10',
          'V12',
          'flat-4',
          'flat-6',
          'rotary-2',
          'rotary-3',
        ])
        .optional(),
      aspiration: z.enum(['NA', 'turbo', 'twin-turbo', 'supercharged']).optional(),
      weightDistributionFront: z.number().gte(30).lte(70).optional(),
      wheelbaseMm: z.number().int().positive().optional(),
      comHeightMm: z.number().int().positive().optional(),
      dragCd: z.number().positive().optional(),
      // real published body width/height (mm); frontal area for aero drag derives as 0.82 * width * height
      widthMm: z.number().int().positive().optional(),
      heightMm: z.number().int().positive().optional(),
      stockTyre: z.string().min(1).optional(),
      tyreCompound: TyreCompoundSchema.optional(),
      /** Factory aerodynamic downforce coefficient: grip gained per (m/s)^2 of
       * speed, so it is worth nothing at a standstill and a great deal on a fast
       * corner. Absent (0) on almost every road car; only genuine factory aero
       * earns a value. Aftermarket aero replaces it (same slot). */
      downforceCoeff: z.number().nonnegative().optional(),
      /** Factory active torque-vectoring (ATTESA E-TS Pro / Super AYC), the
       * cornering edge that lifts an equipped AWD car's mechanical grip above
       * a passive one. Absent on every car without it. */
      activeYaw: z.enum(['attesa', 'ayc']).optional(),
      zeroToHundredS: z.number().positive().optional(),
      /** Top speed in km/h. Not whole-number constrained: a measured figure
       * converted from mph rarely lands on one, and rounding it would break the
       * drag coefficient that was back-solved from it. */
      topSpeedKmh: z.number().positive().optional(),
      /**
       * Measured performance, copied from the vetted spec book. Every entry
       * belongs to a PAIR read at two speeds, and the pair is the whole method:
       * a single figure cannot separate mechanical grip from aerodynamic
       * downforce, or launch traction from engine power.
       *
       * The lateral pair is indivisible, and the refinements below reject a
       * half of it. Braking and acceleration are not: a car too slow to reach
       * 161 km/h publishes only the 97 km/h figure, and the model has a
       * one-measurement path that spends it rather than discarding it. What is
       * always rejected is the FASTER half alone, which is a gap in the data
       * rather than a fact about the car.
       *
       * MIND THE SPEEDS, they differ by pair. Lateral grip is read at 97 and
       * 193 km/h (g); braking distance at 97 and 161 km/h (metres); and
       * acceleration to 97 and to 161 km/h (seconds). Downforce rises with the
       * square of speed, so reading `lateralG193` as a 161 km/h figure corrupts
       * every quantity fitted from it.
       */
      lateralG97: z.number().positive().optional(),
      lateralG193: z.number().positive().optional(),
      braking97To0M: z.number().positive().optional(),
      braking161To0M: z.number().positive().optional(),
      zeroTo97S: z.number().positive().optional(),
      zeroTo161S: z.number().positive().optional(),
      /**
       * Where the measured figures come from. `forza-panel` is a panel reading
       * carried as published. `forza-panel-override` is a car whose panel
       * measures a preset build rather than the stock one, so the figures here
       * are the corrected stock values and the spec book carries the ruling
       * that replaced them. `modelled` is a car with no measurement at all,
       * whose behaviour comes from the fallback regressions.
       */
      measuredFrom: z.enum(['forza-panel', 'forza-panel-override', 'modelled']).optional(),
      dataConfidence: z.enum(['HIGH', 'MED', 'LOW']).optional(),
      estimatedFields: z.array(z.string()).optional(),
    }),
    tier: RarityTierSchema,
    tags: z.array(TagSchema).min(1),
    bookValueYen: z.number().int().positive(),
  })
  .refine((m) => countMatching(m.tags, LAYOUT_TAGS) === 1, {
    message: 'tags must include exactly one layout tag (FR/FF/AWD/MR/RR)',
    path: ['tags'],
  })
  .refine((m) => countMatching(m.tags, INDUCTION_TAGS) === 1, {
    message: 'tags must include exactly one induction tag (NA/Turbo/Supercharged)',
    path: ['tags'],
  })
  .refine((m) => countMatching(m.tags, ENGINE_FAMILY_TAGS) === 1, {
    message: 'tags must include exactly one engine-family tag (Piston/Rotary)',
    path: ['tags'],
  })
  .refine((m) => isCompletePair(m.spec.lateralG97, m.spec.lateralG193), {
    message: 'lateralG97 (97 km/h) and lateralG193 (193 km/h) are a pair: carry both or neither',
    path: ['spec', 'lateralG193'],
  })
  .refine((m) => hasSlowerHalf(m.spec.braking97To0M, m.spec.braking161To0M), {
    message: 'braking161To0M needs braking97To0M beside it: the 97 km/h stop may stand alone',
    path: ['spec', 'braking97To0M'],
  })
  .refine((m) => hasSlowerHalf(m.spec.zeroTo97S, m.spec.zeroTo161S), {
    message: 'zeroTo161S needs zeroTo97S beside it: the 0-97 may stand alone',
    path: ['spec', 'zeroTo97S'],
  })

export const CarModelsSchema = z.array(CarModelSchema).min(1)

export type CarModel = z.infer<typeof CarModelSchema>

/** The car's layout tag (FR/FF/AWD/MR/RR) - schema-guaranteed to exist exactly once. */
export function layoutTagOf(model: CarModel): Tag {
  const found = model.tags.find((t) => (LAYOUT_TAGS as readonly string[]).includes(t))
  if (!found) {
    throw new Error(`car ${model.id} has no layout tag - should be impossible past schema parse`)
  }
  return found
}
