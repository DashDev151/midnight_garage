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
 * The 6 real car component groups. This stays the addressing granularity for
 * staging, `Job`, `ServiceJobWork`, and equipment. A car's actual condition
 * state (`CarInstance.parts`) is tracked per `CarPartId`, one level below this.
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
 * The 29 real car parts, one level below the 6 groups above. Used exclusively
 * by `CarInstance.parts`' keys, the parts catalog's `carPartId` field, and
 * `parts-taxonomy.json` - never by staging/Job/ServiceJobWork, which stay
 * group-addressed.
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
 * The five named part condition bands - the ONLY condition state a car part
 * ever carries; no 0-100 number survives anywhere alongside it. Ordered
 * worst to best; `scrap` is a terminal band (never repairable, only
 * replaceable or sold for scrap value).
 */
export const ConditionBandSchema = z.enum(['scrap', 'poor', 'worn', 'fine', 'mint'])

/**
 * The four physical dials a car's part condition degrades - each one a
 * quantity the performance model runs on, and each with exactly one condition
 * path into it: a part reaches a dial through the taxonomy's
 * `physicalWeights`, and that dial's own band curve
 * (`statFormulas.condition.bandFactor`) says what a band costs it.
 *
 * The dials are not all independent of each other, and the weights have to
 * respect that: braking is DERIVED from mechanical grip in the model, so a part
 * weighted on both `grip` and `braking` would reach braking twice. Those two
 * part sets stay disjoint.
 *
 * There is deliberately no `power` dial. Engine condition already reaches the
 * model through the car's CURRENT power, so a second factor would charge a
 * worn engine twice and stop the model reproducing its own measurements.
 */
export const PhysicalDialSchema = z.enum(['grip', 'braking', 'driveline', 'aero'])

export const GradeSchema = z.enum(['stock', 'street', 'sport', 'race'])

/**
 * A car's engine response, derived from its own spec rather than authored
 * (`engineCharacterOf`, `packages/sim/src/derivedStats.ts`) - what an
 * aftermarket power part's fraction resolves against
 * (`StatModifierSchema.powerFraction`). `forced` wins outright from
 * `hasForcedInduction`; otherwise the car's specific output (stock PS per
 * effective litre) is compared against
 * `economy.statFormulas.engineCharacter.naHighStrungThreshold` to split the
 * naturally aspirated field into `high-strung-na` and `lazy-na`.
 *
 * Effective displacement applies a 1.8x equivalency factor to a rotary's
 * literal cc figure before the specific-output comparison - a 13B is 1308cc
 * by convention but breathes like roughly 2.6 litres, so without the factor
 * every rotary reads as implausibly high-strung. The factor is moot on every
 * shipped rotary today (both are factory turbo, so `forced` wins first), but
 * it is what keeps the comparison honest for a naturally aspirated rotary.
 */
export const EngineCharacterSchema = z.enum(['high-strung-na', 'lazy-na', 'forced'])

/**
 * The tyre compound tier a car's grip is computed from - the stock fitment's
 * chemistry tier, plus the higher tiers a fitted aftermarket tyre reaches.
 * `slick` is reached only by a fitted race tyre, never a stock fitment.
 */
export const TyreCompoundSchema = z.enum([
  'eco',
  'touring',
  'performance',
  'sport',
  'grand',
  'slick',
])

/**
 * What league a car plays in - its market position, and nothing else. Drives
 * the parts fitment class it is charged for, the condition the market expects
 * of it (`valuation.expectationByTier`), and its repair economics.
 *
 * Deliberately says nothing about how hard the car is to find (`CarRarity`) or
 * where it came from (`CarOrigin`). None of the four labels names a body type,
 * so a car that is neither kei nor compact sits in `entry` without the label
 * lying, and none collides with a part `grade` (`stock`/`street`/`sport`/
 * `race`).
 */
export const CarTierSchema = z.enum(['entry', 'everyday', 'enthusiast', 'flagship'])

/**
 * How often you see one. Drives how often a car is drawn out of its own price
 * band into an auction catalogue (`economy.auction.rarityDrawMultiplier`),
 * flash-sale duration, and walk-in desirability - never price band, which is
 * `CarTier`. Which ROOM a car turns up in is the room's own appetite for its
 * price band, not its scarcity; the single exception is `legend`, which GDD
 * 9.2 confines to the Collector Network (`canAppearAtAuctionTier`).
 *
 * `legend` currently has no car in it: the rung exists so the rep-gated
 * Collector Network has somewhere to draw from once one is authored.
 */
export const CarRaritySchema = z.enum(['common', 'uncommon', 'rare', 'legend'])

/**
 * Where the car came from. Read by the Import Broker channel when that is
 * built; inert everywhere else. Every shipped car is `jdm`.
 */
export const CarOriginSchema = z.enum(['jdm', 'gaisha'])

export const ReputationTierSchema = z.enum(['unknown', 'local', 'known', 'respected', 'legend'])

export type Tag = z.infer<typeof TagSchema>
export type ComponentId = z.infer<typeof ComponentIdSchema>
export type CarPartId = z.infer<typeof CarPartIdSchema>
export type ConditionBand = z.infer<typeof ConditionBandSchema>
export type PhysicalDial = z.infer<typeof PhysicalDialSchema>
export type Grade = z.infer<typeof GradeSchema>
export type EngineCharacter = z.infer<typeof EngineCharacterSchema>
export type TyreCompound = z.infer<typeof TyreCompoundSchema>
export type CarTier = z.infer<typeof CarTierSchema>
export type CarRarity = z.infer<typeof CarRaritySchema>
export type CarOrigin = z.infer<typeof CarOriginSchema>
export type ReputationTier = z.infer<typeof ReputationTierSchema>
