import { z } from 'zod'
import {
  CarCultureSchema,
  CarOriginSchema,
  CarRaritySchema,
  CarTierSchema,
  TagSchema,
  TyreCompoundSchema,
  type Tag,
} from './tags'

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
    spec: z
      .object({
        chassisCode: z.string().min(1),
        engineCode: z.string().min(1),
        /**
         * The scene this car belongs to, authored per car for all 94 roster
         * rows (directive 24) and normalised from the roster CSV's own
         * `culture` column. It is the game's answer to "what kind of car is
         * this likely to be": with `tier` it selects the car's care profile
         * (`partsGeneration.damageGrades.careProfileByCulture`), which is the
         * distribution its history is rolled from, and the history then drives
         * both how rough the car arrives and how likely it is to carry
         * aftermarket parts.
         *
         * Required, not defaulted, on the same footing as `reliabilityBase`
         * and `styleBase`: a car added later cannot silently inherit a scene
         * nobody chose.
         */
        culture: CarCultureSchema,
        /**
         * The variant's production window. A generated car's model year is
         * drawn inside `[yearFrom, yearTo]` (`generateAuctionCarInstance`), so
         * a Hakosuka built 1969 to 1972 can no longer turn up as a 1977 car.
         * Both ends are authored per car for all 94 roster rows, never
         * derived; a variant built in one model year only carries the same
         * value twice, and a car still in production at the roster's 2010
         * horizon carries 2010.
         */
        yearFrom: z.number().int().gte(1955).lte(2010),
        yearTo: z.number().int().gte(1955).lte(2010),
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
        /**
         * What this car is when everything is right: a stock mint example sits
         * exactly here, and nothing the game does ever lifts a car above its own
         * base (`computeDerivedStats`'s reliability derivation multiplies
         * everything else). Required, not defaulted - the same footing as any
         * other per-car character constant this schema carries - so a car added
         * later cannot silently inherit a value nobody chose.
         *
         * The scale runs 65 to 100, age and engineering culture rather than
         * price. The floor sits at 65 rather than lower because the base
         * multiplies condition and coherence: a car with almost nothing to lose
         * is a car where neither of those two systems still matters.
         */
        reliabilityBase: z.number().min(0).max(100),
        /**
         * How the car looks stock, on the same footing as `reliabilityBase`
         * above: a mint stock example sits exactly here, and no aftermarket
         * part lifts a car above it until one is actually fitted.
         * Required, not defaulted - a car added later cannot silently inherit
         * a value nobody chose, which is exactly the `powerFraction` gap this
         * schema already closed once.
         *
         * The scale runs 0 to 100 and the authored roster spans 15 (a Honda
         * Acty) to 88 (a Lamborghini Countach), so a beautiful car is beautiful
         * before anything is bolted to it.
         */
        styleBase: z.number().min(0).max(100),
        /**
         * How good the car could ever look, fully and tastefully modified. With
         * `styleBase` above it forms the pair the whole style axis turns on:
         * aftermarket parts do not ADD style, they close the gap between the
         * two (`computeDerivedStats`), so the same kit is transformative on a
         * car with sixty points of headroom and near worthless on one with
         * five.
         *
         * Authored per car for all 94 roster rows, never derived - not from
         * `aeroCeiling` (which asks what a body can be made to DO, a different
         * question from what a scene can be made to do WITH it) and not from
         * `culture`. The roster spans 42 to 96.
         */
        styleCeiling: z.number().min(0).max(100),
        /**
         * How much of a fitted aero part's downforce this body can actually
         * work: a 0-to-1 multiplier on whatever the aero grade delivers
         * (`effectiveDownforce`). 1.0 means the part performs exactly as
         * authored; a kei box at 0.20 keeps a fifth of it, so the same wing
         * transforms an FD and does almost nothing to a Wagon R. It scales the
         * downforce only, never the drag that comes with it, which is why a
         * wing on the wrong car is worse than no wing at all.
         *
         * The question it answers is what a body can be made to DO - shape,
         * floor, and whether real aerodynamic development sits behind it - and
         * not how fast, expensive or desirable the car is. Several of the most
         * desirable cars on the roster sit near the bottom because they have no
         * aerodynamic development behind them at all, which is the correct
         * reading rather than a gap to be closed.
         *
         * Authored per car for all 94 roster rows. Required, not defaulted, on
         * the same footing as `reliabilityBase` and `styleBase`: a car added
         * later cannot silently inherit a value nobody chose.
         */
        aeroCeiling: z.number().min(0).max(1),
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
      })
      .strict(),
    /** Market position: what the car is worth and what basket of parts it is
     * charged for. Independent of `rarity` and `origin`. */
    tier: CarTierSchema,
    /** Scarcity: how often one turns up, and where. */
    rarity: CarRaritySchema,
    /** Sourcing channel. Inert until the Import Broker exists. */
    origin: CarOriginSchema,
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
  .refine((m) => m.spec.yearTo >= m.spec.yearFrom, {
    message: 'yearTo closes the production window opened by yearFrom: it cannot sit below it',
    path: ['spec', 'yearTo'],
  })
  .refine((m) => m.spec.styleCeiling >= m.spec.styleBase, {
    message:
      'styleCeiling is what the car could look like at its best: it cannot sit below styleBase',
    path: ['spec', 'styleCeiling'],
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
