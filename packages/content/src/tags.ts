import { z } from 'zod'

/**
 * Closed set of platform tags (GDD 4.4). Tags drive part compatibility,
 * buyer preferences, and event suitability - kept as an enum, not free
 * strings, so a typo can never silently create an unmatched tag.
 */
export const TagSchema = z.enum([
  // layout
  'FR',
  'FF',
  'AWD',
  'MR',
  'RR',
  // induction
  'NA',
  'Turbo',
  'Supercharged',
  // engine family
  'Piston',
  'Rotary',
  // class
  'Kei',
  // decade
  '70s',
  '80s',
  '90s',
  '00s',
  // origin
  'JDM',
  'Gaisha',
])

/**
 * The 6 real car component groups (Sprint 26 - replaces the Sprint 12 8-way
 * split; `forcedInduction` folds into `engine`, `brakes` folds into
 * `suspension`). This stays the addressing granularity for staging, `Job`,
 * `ServiceJobWork`, and equipment - a group-level "bridge" the sprint's own
 * design decision 13 locks in - even though a car's actual condition state
 * (`CarInstance.parts`) is now tracked per `CarPartId`, one level below this.
 * Per-part addressing for staging/jobs is Sprint 28 scope, not this one.
 */
export const ComponentIdSchema = z.enum([
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
])

/**
 * The 29 real car parts (Sprint 26), one level below the 6 groups above -
 * see `docs/sprints/sprint26.md`'s locked taxonomy table. Used exclusively
 * by `CarInstance.parts`' keys, the parts catalog's `carPartId` field, and
 * `parts-taxonomy.json` - never by staging/Job/ServiceJobWork, which stay
 * group-addressed this sprint.
 */
export const CarPartIdSchema = z.enum([
  // engine
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'fuelSystem',
  'ignitionEcu',
  'cooling',
  'forcedInduction',
  // drivetrain
  'gearbox',
  'clutch',
  'differential',
  'driveline',
  'chassis',
  // suspension
  'dampers',
  'springs',
  'antiRollBars',
  'steering',
  'brakePadsDiscs',
  'brakeCalipersLines',
  // wheels
  'rims',
  'tyres',
  // body
  'panels',
  'paint',
  'underbody',
  'aero',
  // interior
  'seats',
  'dashGauges',
])

/**
 * The five named part condition bands (Sprint 26) - the ONLY condition state
 * a car part ever carries; no 0-100 number survives anywhere alongside it.
 * Ordered worst to best; `scrap` is a terminal band (never repairable, only
 * replaceable or sold for scrap value - see sprint26.md decisions 5-6).
 */
export const ConditionBandSchema = z.enum(['scrap', 'poor', 'worn', 'fine', 'mint'])

export const GradeSchema = z.enum(['stock', 'street', 'sport', 'race'])

export const RarityTierSchema = z.enum([
  'shitbox',
  'common',
  'uncommon',
  'rare',
  'gaisha',
  'legend',
])

export const ReputationTierSchema = z.enum(['unknown', 'local', 'known', 'respected', 'legend'])

export type Tag = z.infer<typeof TagSchema>
export type ComponentId = z.infer<typeof ComponentIdSchema>
export type CarPartId = z.infer<typeof CarPartIdSchema>
export type ConditionBand = z.infer<typeof ConditionBandSchema>
export type Grade = z.infer<typeof GradeSchema>
export type RarityTier = z.infer<typeof RarityTierSchema>
export type ReputationTier = z.infer<typeof ReputationTierSchema>
