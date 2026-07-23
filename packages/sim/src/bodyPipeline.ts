import {
  PanelZoneIdSchema,
  ZoneIdSchema,
  fitmentClassForTier,
  MATERIALS,
  type CarInstance,
  type CarModel,
  type ConditionBand,
  type EconomyConfig,
  type Part,
  type PartFitmentClass,
  type PipelineStageId,
  type ZoneId,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import type { SimContext } from './context'
import type { Rng } from './rng'

/**
 * The body pipeline's own module (docs/design/workshop-rework.md): zone
 * generation, the worst-governs derivation of the three body value-carrier
 * bands (`panels`/`paint`/`underbody`) from zone state, and the pure
 * per-stage effect a confirmed pipeline action applies to one zone. Pure
 * functions only - no `GameState`, no jobs.ts dependency, so this module
 * never risks a cycle with the orchestration layer (`stagedWork.ts`) that
 * calls it.
 */

export const PANEL_ZONE_IDS = PanelZoneIdSchema.options
export const ALL_ZONE_IDS = ZoneIdSchema.options

/** Zone severity (0-3) to `ConditionBand`, the mapping every derived body
 * band uses: 0 mint, 1 fine, 2 worn, 3 poor. `scrap` is never a mapped
 * severity - it is reached only via a forcing condition (a missing panel). */
const SEVERITY_BAND_ORDER: readonly ConditionBand[] = ['mint', 'fine', 'worn', 'poor']

export function bandForSeverity(severity: number): ConditionBand {
  return SEVERITY_BAND_ORDER[Math.max(0, Math.min(3, severity))]!
}

/** The severity threshold a target band maps back to - the inverse of
 * `bandForSeverity`, used to size "how far below this target is the zone."
 * `scrap`/`mint` both floor at 0 (there is nothing below mint to clear). */
export function severityThresholdForBand(targetBand: ConditionBand): number {
  const idx = SEVERITY_BAND_ORDER.indexOf(targetBand)
  return idx < 0 ? 0 : idx
}

/** Zone body score = max(metal, surface); `panels` band is the worst body
 * score across the five panel zones, mapped 0 mint/1 fine/2 worn/3 poor -
 * unless any panel zone is missing, which forces `scrap` outright. */
export function derivePanelsBand(zoneStates: ZoneStates): ConditionBand {
  if (PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].panelMissing)) return 'scrap'
  const worst = Math.max(
    ...PANEL_ZONE_IDS.map((zoneId) =>
      Math.max(zoneStates[zoneId].metal, zoneStates[zoneId].surface),
    ),
  )
  return bandForSeverity(worst)
}

/** `paint` band is the worst finish across the five panel zones, same
 * mapping, stepped one band worse when two or more painted zones disagree on
 * colour (the mismatch penalty) - an unpainted zone (`colour` absent) never
 * participates in the disagreement check. */
export function derivePaintBand(zoneStates: ZoneStates): ConditionBand {
  const worst = Math.max(...PANEL_ZONE_IDS.map((zoneId) => zoneStates[zoneId].finish))
  const band = bandForSeverity(worst)
  const colours = new Set(
    PANEL_ZONE_IDS.map((zoneId) => zoneStates[zoneId].colour).filter(
      (colour): colour is string => colour != null,
    ),
  )
  if (colours.size < 2) return band
  const idx = SEVERITY_BAND_ORDER.indexOf(band)
  return idx <= 0 ? 'scrap' : SEVERITY_BAND_ORDER[idx - 1]!
}

/** `underbody` band = max(metal, finish) on the chassis zone alone, same
 * mapping - never mismatch-penalised (a single zone cannot disagree with
 * itself) and never `scrap` (the chassis has no panel to go missing). */
export function deriveUnderbodyBand(zoneStates: ZoneStates): ConditionBand {
  const chassis = zoneStates.chassis
  return bandForSeverity(Math.max(chassis.metal, chassis.finish))
}

export interface DerivedBodyBands {
  panels: ConditionBand
  paint: ConditionBand
  underbody: ConditionBand
}

export function deriveBodyBands(zoneStates: ZoneStates): DerivedBodyBands {
  return {
    panels: derivePanelsBand(zoneStates),
    paint: derivePaintBand(zoneStates),
    underbody: deriveUnderbodyBand(zoneStates),
  }
}

const DERIVED_BODY_PART_IDS = ['panels', 'paint', 'underbody'] as const
export type DerivedBodyPartId = (typeof DERIVED_BODY_PART_IDS)[number]

export function isBodyDerivedPart(carPartId: string): carPartId is DerivedBodyPartId {
  return (DERIVED_BODY_PART_IDS as readonly string[]).includes(carPartId)
}

/**
 * The SINGLE WRITER: derives `panels`/`paint`/`underbody` from `car.zoneState`
 * and writes the result onto the installed carrier parts. Runs at generation
 * and after every zone mutation; nothing else may write those three bands. A
 * no-op when `car.zoneState` is absent (a car not yet on the zone model - the
 * pre-wave-2 fixtures and any legacy state), so every existing caller that
 * never sets zone state keeps its band exactly as authored. The rare case of
 * a null `installed` slot on a zone-model car (never produced by real
 * generation, which always fills these three slots) synthesises a fresh
 * stock instance rather than leaving the slot empty, since these three parts
 * are always-present value carriers under the new model.
 */
export function applyDerivedBodyBands(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): CarInstance {
  const zoneStates = car.zoneState
  if (!zoneStates) return car
  const fitmentClass = fitmentClassForTier(model.tier)
  const derived = deriveBodyBands(zoneStates)
  let parts = car.parts
  for (const carPartId of DERIVED_BODY_PART_IDS) {
    const band = derived[carPartId]
    const installed = parts[carPartId].installed
    if (installed) {
      if (installed.band === band) continue
      parts = { ...parts, [carPartId]: { installed: { ...installed, band } } }
      continue
    }
    const catalogPart = context.stockPartByCarPartId[fitmentClass]?.[carPartId]
    if (!catalogPart) continue
    parts = {
      ...parts,
      [carPartId]: {
        installed: {
          id: `${car.id}-${carPartId}-derived`,
          partId: catalogPart.id,
          band,
          genuinePeriod: false,
          origin: {
            kind: 'car',
            carInstanceId: car.id,
            carLabel: car.provenanceNote || car.id,
            day: 0,
          },
        },
      },
    }
  }
  return parts === car.parts ? car : { ...car, parts }
}

/** One `[w0,w1,w2,w3]` weighted roll over severities 0-3. Mirrors the
 * cumulative-sum-over-one-draw shape every other weighted roll in this
 * codebase uses (`auctions.ts`'s `rollUpkeepTier`/`pickWeightedCause`). */
function rollSeverity(weights: readonly [number, number, number, number], rng: Rng): number {
  const total = weights[0] + weights[1] + weights[2] + weights[3]
  const roll = rng.next() * total
  let cumulative = 0
  for (let i = 0; i < 4; i++) {
    cumulative += weights[i]!
    if (roll < cumulative) return i
  }
  return 3
}

/**
 * Rolls a fresh car's six zones (docs/design/workshop-rework.md's generation
 * table): metal and finish roll independently per zone from the tier's own
 * weight tables (the chassis zone rolls metal on the next-kinder tier's row),
 * surface derives from metal with a chance of one extra step. No zone starts
 * with a missing panel or a colour (both are player/pipeline-driven states,
 * never rolled). Seeded via `rng`, the same stream the rest of generation
 * threads.
 */
export function rollZoneStates(
  fitmentClass: PartFitmentClass,
  economy: EconomyConfig,
  rng: Rng,
): ZoneStates {
  const { metalWeightsByTier, finishWeightsByTier, chassisMetalWeightsByTier, surfaceExtraChance } =
    economy.partsGeneration.zoneStates
  const rollZone = (metalWeights: readonly [number, number, number, number]): ZoneState => {
    const metal = rollSeverity(metalWeights, rng)
    const finish = rollSeverity(finishWeightsByTier[fitmentClass], rng)
    let surface = Math.max(0, metal - 1)
    if (rng.next() < surfaceExtraChance) surface = Math.min(2, surface + 1)
    return { metal, surface, finish, panelMissing: false, primed: false }
  }
  const zoneStates = {} as Record<ZoneId, ZoneState>
  for (const zoneId of PANEL_ZONE_IDS)
    zoneStates[zoneId] = rollZone(metalWeightsByTier[fitmentClass])
  zoneStates.chassis = rollZone(chassisMetalWeightsByTier[fitmentClass])
  return zoneStates as ZoneStates
}

/** The one zone field that actually drives `carPartId`'s MONEY bill - metal
 * is repaired by hand (beat/weld), never priced in yen, so it is never a
 * lever for either the floor top-up or the Law 2 softening pass below, only
 * for the pipeline stages themselves. `panels` money rides on `surface`
 * (fill-and-sand), capped at 2; `paint`/`underbody` money rides on `finish`
 * (prime+paint / prime+underseal), capped at 3. */
function moneyFieldFor(carPartId: DerivedBodyPartId): { field: 'surface' | 'finish'; cap: number } {
  return carPartId === 'panels' ? { field: 'surface', cap: 2 } : { field: 'finish', cap: 3 }
}

/**
 * Whether `carPartId` still has real MONEY headroom to degrade further - any
 * relevant zone's money field (`moneyFieldFor`) still below its cap. The
 * eligibility check `degradeCandidates` (auctions.ts) uses in place of the
 * generic band-index check for a zone-backed part: the derived BAND can
 * saturate at `poor` from `metal` alone (never touched by the degrade
 * top-up, since metal is money-free), which would otherwise strand real
 * surface/finish headroom sitting in a different zone.
 */
export function hasZoneDegradeHeadroom(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): boolean {
  const { field, cap } = moneyFieldFor(carPartId)
  if (carPartId === 'underbody') return zoneStates.chassis.finish < cap
  return PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId][field] < cap)
}

/**
 * The IMPROVE-direction mirror of `hasZoneDegradeHeadroom`: whether
 * `carPartId` still has real MONEY headroom to improve further (a missing
 * panel to un-miss, or a money field still above 0). The Law 2 softening
 * pass (`enforceMaxBillFraction`) uses this to EXCLUDE an already-exhausted
 * zone-backed part from its worst-band computation, not merely from being
 * picked to improve: metal never moves, so a high-metal zone can pin a
 * carrier's derived band below `mint` PERMANENTLY even once its money
 * contribution is already zero - left in the worst-band pool, it would
 * wrongly stay the eternal "worst part" and starve every other part still
 * genuinely below mint of its own climb passes.
 */
export function hasZoneImproveHeadroom(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): boolean {
  if (carPartId === 'panels' && PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].panelMissing)) {
    return true
  }
  const { field } = moneyFieldFor(carPartId)
  if (carPartId === 'underbody') return zoneStates.chassis.finish > 0
  return PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId][field] > 0)
}

/**
 * Sets a body-derived carrier's zone state to reach AT LEAST `targetBand` -
 * a symptom's damage (`auctions.ts`'s `applySymptoms`), the one other
 * writer of these three parts' apparent severity besides generation and the
 * pipeline itself. Unlike the money-only degrade/improve helpers above, a
 * symptom is a real, hidden DEFECT (not a money-optimisation move), so it
 * legitimately moves METAL too - a "rust patch" or "panel respray" cause is
 * about the panel's physical state, not what the cheapest fix costs. Always
 * applied to the SAME fixed zone (deterministic, no extra RNG draw) -
 * worst-governs means one zone carrying it is enough to drive the whole
 * carrier's derived band. A no-op if the carrier is already at or worse
 * than `targetBand` (mirrors the "worse of current or cause" rule every
 * other symptom cause already follows).
 */
export function setZoneCarrierToAtLeastBand(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  targetBand: ConditionBand,
): ZoneStates {
  const targetSeverity = Math.min(3, severityThresholdForBand(targetBand))
  if (carPartId === 'underbody') {
    const chassis = zoneStates.chassis
    if (Math.max(chassis.metal, chassis.finish) >= targetSeverity) return zoneStates
    return {
      ...zoneStates,
      chassis: { ...chassis, finish: Math.max(chassis.finish, targetSeverity) },
    }
  }
  const zoneId = PANEL_ZONE_IDS[0]!
  const zone = zoneStates[zoneId]
  if (carPartId === 'panels') {
    if (Math.max(zone.metal, zone.surface) >= targetSeverity) return zoneStates
    return { ...zoneStates, [zoneId]: { ...zone, metal: Math.max(zone.metal, targetSeverity) } }
  }
  if (zone.finish >= targetSeverity) return zoneStates
  return { ...zoneStates, [zoneId]: { ...zone, finish: targetSeverity } }
}

/**
 * Worsens whichever panel zone has the LEAST headroom left before hitting
 * `carPartId`'s money-relevant field cap (`underbody` reads the chassis zone
 * alone) - the core-loop floor's zone-aware top-up move
 * (`enforceMinWorkBill`, auctions.ts). A no-op once every relevant zone is
 * already capped: `panels` never reaches `scrap` this way - that needs a
 * missing panel, a separate and more drastic state this helper never
 * touches, matching `degradeBand`'s own never-forced-to-scrap contract.
 */
export function degradeZoneCarrierOneStep(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): ZoneStates {
  const { field, cap } = moneyFieldFor(carPartId)
  if (carPartId === 'underbody') {
    const chassis = zoneStates.chassis
    if (chassis.finish >= cap) return zoneStates
    return { ...zoneStates, chassis: { ...chassis, finish: chassis.finish + 1 } }
  }
  const withHeadroom = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId][field] < cap)
  if (withHeadroom.length === 0) return zoneStates
  const targetId = withHeadroom.reduce((worst, zoneId) =>
    zoneStates[zoneId][field] > zoneStates[worst][field] ? zoneId : worst,
  )
  const zone = zoneStates[targetId]
  return { ...zoneStates, [targetId]: { ...zone, [field]: zone[field] + 1 } }
}

/**
 * Improves whichever panel zone currently carries the MOST of `carPartId`'s
 * money-relevant field - the Law 2 generation-softening pass's zone-aware
 * move (`enforceMaxBillFraction`, auctions.ts). For `panels`, a
 * `panelMissing` zone is un-missed FIRST (the scrap-forcing state and the
 * only path a `panels` bill can carry a real panel-purchase cost), before
 * any field improves, mirroring the general pass improving the single worst
 * part one step at a time.
 */
export function improveZoneCarrierOneStep(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): ZoneStates {
  if (carPartId === 'panels') {
    const missingId = PANEL_ZONE_IDS.find((zoneId) => zoneStates[zoneId].panelMissing)
    if (missingId) {
      return { ...zoneStates, [missingId]: { ...zoneStates[missingId], panelMissing: false } }
    }
  }
  const { field } = moneyFieldFor(carPartId)
  if (carPartId === 'underbody') {
    const chassis = zoneStates.chassis
    if (chassis.finish <= 0) return zoneStates
    return { ...zoneStates, chassis: { ...chassis, finish: chassis.finish - 1 } }
  }
  const withRoom = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId][field] > 0)
  if (withRoom.length === 0) return zoneStates
  const targetId = withRoom.reduce((worst, zoneId) =>
    zoneStates[zoneId][field] > zoneStates[worst][field] ? zoneId : worst,
  )
  const zone = zoneStates[targetId]
  return { ...zoneStates, [targetId]: { ...zone, [field]: zone[field] - 1 } }
}

function materialCostYen(materialId: string): number {
  const material = MATERIALS.find((m) => m.id === materialId)
  if (!material) throw new Error(`bodyPipeline: unknown material "${materialId}"`)
  return material.priceYen
}

const FILL_AND_SAND_COST_YEN = materialCostYen('filler') + materialCostYen('paper')
const PRIME_COST_YEN = materialCostYen('primer')
const PAINT_COST_YEN = materialCostYen('paint')
const UNDERSEAL_COST_YEN = materialCostYen('underseal')
const POLISH_COST_YEN = materialCostYen('polish')

/** The zone-panel catalog SKU for one zone, at one fitment class - a stock,
 * `zoneId`-carrying entry, priced through the `zonePanel` pricing basis. */
export function zonePanelPart(
  partsById: Readonly<Record<string, Part>>,
  zoneId: ZoneId,
  fitmentClass: PartFitmentClass,
): Part | undefined {
  return Object.values(partsById).find(
    (part) =>
      part.zoneId === zoneId && part.fitmentClass === fitmentClass && part.grade === 'stock',
  )
}

/**
 * `panels`' money-only repair bill: metal is always free to climb (beat/weld
 * are labour, never yen), so the only money in this bill is fill-and-sand
 * materials for a zone whose surface still exceeds the target, plus a fresh
 * zone panel for any
 * zone whose panel is missing outright (the only path out of `scrap` - a
 * missing panel has no metal to beat or weld). The cheapest real money path
 * to any target band, never a shop's current tool tier (mirrors every other
 * whole-car bill function, which prices the work, not today's capability).
 */
export function panelsRepairBillYen(
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): number {
  const threshold = severityThresholdForBand(targetBand)
  let total = 0
  for (const zoneId of PANEL_ZONE_IDS) {
    const zone = zoneStates[zoneId]
    if (zone.panelMissing) {
      const panel = zonePanelPart(partsById, zoneId, fitmentClass)
      if (panel) total += panel.priceYen
      continue
    }
    if (zone.surface > threshold) total += FILL_AND_SAND_COST_YEN
  }
  return total
}

/** `paint`'s money-only repair bill: prime + paint materials for every zone
 * whose finish still exceeds the target. */
export function paintRepairBillYen(zoneStates: ZoneStates, targetBand: ConditionBand): number {
  const threshold = severityThresholdForBand(targetBand)
  let total = 0
  for (const zoneId of PANEL_ZONE_IDS) {
    if (zoneStates[zoneId].finish > threshold) total += PRIME_COST_YEN + PAINT_COST_YEN
  }
  return total
}

/** `underbody`'s money-only repair bill: prime + underseal materials on the
 * chassis zone alone, only if its finish still exceeds the target - metal is
 * free (beat/weld) exactly as it is for `panels`. */
export function underbodyRepairBillYen(zoneStates: ZoneStates, targetBand: ConditionBand): number {
  const threshold = severityThresholdForBand(targetBand)
  return zoneStates.chassis.finish > threshold ? PRIME_COST_YEN + UNDERSEAL_COST_YEN : 0
}

/** The one dispatcher `bands.ts`'s whole-car bill functions route
 * `panels`/`paint`/`underbody` through when `car.zoneState` is present. */
export function bodyPartRepairBillYen(
  carPartId: DerivedBodyPartId,
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): number {
  if (carPartId === 'panels')
    return panelsRepairBillYen(zoneStates, targetBand, fitmentClass, partsById)
  if (carPartId === 'paint') return paintRepairBillYen(zoneStates, targetBand)
  return underbodyRepairBillYen(zoneStates, targetBand)
}

export interface PipelineStageEffect {
  ok: true
  zone: ZoneState
  /** Labour in `energyPerBandStepByToolTier` band-step units - the caller
   * (`stagedWork.ts`) multiplies by the body group's own tier rate. */
  laborUnits: number
  materialsCostYen: number
}

export interface PipelineStageRefusal {
  ok: false
  reason: 'prereq' | 'machine-line'
}

/** Options a stage's own gate reads - both express "the body line's daily
 * capability," at two different thresholds: `unlocked` (owned tier 2, or
 * hired today) gates weld and the better paint finish; `fullCapability`
 * (owned tier 3, or hired today - hire always grants the WHOLE line, not
 * just tier 2) gates the best polish floor. */
export interface BodyLineCapability {
  unlocked: boolean
  fullCapability: boolean
}

/**
 * The six generic stages' pure effect on one zone (docs/design/
 * workshop-rework.md's pipeline table): strip/prep, beat, weld, fill-and-sand,
 * prime, polish. `swapPanel` and `paint` carry extra player input and have
 * their own functions below.
 */
export function planPipelineStage(
  stage: Exclude<PipelineStageId, 'swapPanel' | 'paint'>,
  zone: ZoneState,
  capability: BodyLineCapability,
): PipelineStageEffect | PipelineStageRefusal {
  switch (stage) {
    case 'stripPrep':
      return {
        ok: true,
        zone: { ...zone, finish: 3, primed: false },
        laborUnits: 1,
        materialsCostYen: 0,
      }
    case 'beat':
      if (zone.metal < 1 || zone.metal > 2) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, metal: zone.metal - 1 },
        laborUnits: 1,
        materialsCostYen: 0,
      }
    case 'weld':
      if (zone.metal <= 0) return { ok: false, reason: 'prereq' }
      if (!capability.unlocked) return { ok: false, reason: 'machine-line' }
      return { ok: true, zone: { ...zone, metal: 0 }, laborUnits: 2, materialsCostYen: 0 }
    case 'fillAndSand':
      if (zone.metal !== 0 || zone.surface === 0) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, surface: 0 },
        laborUnits: 1,
        materialsCostYen: FILL_AND_SAND_COST_YEN,
      }
    case 'prime':
      if (zone.surface !== 0 || zone.primed) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, primed: true },
        laborUnits: 1,
        materialsCostYen: PRIME_COST_YEN,
      }
    case 'polish': {
      if (zone.finish >= 3) return { ok: false, reason: 'prereq' } // never painted - nothing to polish
      const floor = capability.fullCapability ? 0 : 1
      const nextFinish = Math.max(floor, zone.finish - 1)
      if (nextFinish === zone.finish) return { ok: false, reason: 'prereq' } // already at this tier's floor
      return {
        ok: true,
        zone: { ...zone, finish: nextFinish },
        laborUnits: 1,
        materialsCostYen: POLISH_COST_YEN,
      }
    }
  }
}

/** Swap panel's effect: the zone's metal resets to the fitted panel's own
 * band-implied severity, and - a fresh physical panel - its surface/finish
 * reset too (bare, unprimed sheet metal), so the zone needs the fill-prime-
 * paint chain again regardless of what it looked like before. Never chased
 * (`panelZone: PanelZoneId`, so chassis is excluded at the type level by
 * every caller). Labour is the fitting (bolt-on) class, priced by the caller,
 * not a band-step unit - `laborUnits` is 0 here by convention. */
export function planSwapPanel(zone: ZoneState, panelBand: ConditionBand): PipelineStageEffect {
  return {
    ok: true,
    zone: {
      metal: severityThresholdForBand(panelBand),
      surface: 0,
      finish: 3,
      panelMissing: false,
      primed: false,
    },
    laborUnits: 0,
    materialsCostYen: 0,
  }
}

/** Paint's effect: needs the zone primed; the achieved finish is 1 with the
 * body line unlocked (owned tier 2, or hired today), else 2 - tier 1 hand
 * tools and rattle cans cap at tidy. Chassis colours as the underseal shade
 * rather than a chosen hue; the material differs (underseal, not paint tin)
 * but the effect shape is identical. */
export function planPaintStage(
  zone: ZoneState,
  zoneId: ZoneId,
  colour: string,
  capability: BodyLineCapability,
): PipelineStageEffect | PipelineStageRefusal {
  if (!zone.primed) return { ok: false, reason: 'prereq' }
  const finish = capability.unlocked ? 1 : 2
  return {
    ok: true,
    zone: { ...zone, finish, primed: false, colour },
    laborUnits: 1,
    materialsCostYen: zoneId === 'chassis' ? UNDERSEAL_COST_YEN : PAINT_COST_YEN,
  }
}
