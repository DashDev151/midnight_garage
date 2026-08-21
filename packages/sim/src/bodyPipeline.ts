import {
  MetalZoneIdSchema,
  PanelZoneIdSchema,
  PAINT_COLOURS,
  PAINT_HISTORY_STATES,
  TrimZoneIdSchema,
  ZoneIdSchema,
  fitmentClassForTier,
  MATERIALS,
  type CarCulture,
  type CarInstance,
  type CarModel,
  type ConditionBand,
  type DamageGrade,
  type EconomyConfig,
  type Grade,
  type MetalZoneId,
  type MetalZoneState,
  type PaintFinish,
  type PaintHistoryState,
  type PanelZoneId,
  type Part,
  type PartFitmentClass,
  type PartInstance,
  type PipelineStageId,
  type ZoneId,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import type { SimContext } from './context'
import { pickWeighted, type Rng } from './rng'

/**
 * The body pipeline's own module (docs/design/systems/workshop-rework.md): zone
 * generation, the worst-governs derivation of the two body value-carrier
 * bands (`bodywork`/`paint`) from zone state, and the pure per-stage effect a
 * confirmed pipeline action applies to one zone. Pure functions only - no
 * `GameState`, no jobs.ts dependency, so this module never risks a cycle with
 * the orchestration layer (`stagedWork.ts`) that calls it.
 *
 * Nine zones, two shapes: six metal zones carry `metal`/`surface` on top of
 * the shared `finish`/`panelMissing`/`colour`/`primed` fields, three trim
 * zones carry only the shared fields. `chassis` is not a zone at all - it is
 * a normal car part with its own condition band, repaired and installed like
 * any other slot.
 */

export const PANEL_ZONE_IDS = PanelZoneIdSchema.options
export const ALL_ZONE_IDS = ZoneIdSchema.options
export const METAL_ZONE_IDS = MetalZoneIdSchema.options
export const TRIM_ZONE_IDS = TrimZoneIdSchema.options

/** Whether `zone` is a metal zone - the one runtime check the two-shape model
 * still needs, at the boundary where a caller only holds a generic `ZoneState`
 * (indexed by a `ZoneId` value that came from data, not from a literal key a
 * type could narrow on). Anywhere a caller already iterates `METAL_ZONE_IDS`
 * or `TRIM_ZONE_IDS` specifically, indexing `ZoneStates` by that narrower id
 * type resolves the concrete shape at compile time and this guard is never
 * needed. */
export function isMetalZoneState(zone: ZoneState): zone is MetalZoneState {
  return 'metal' in zone
}

/** Zone severity (0-4) to `ConditionBand`, the mapping every derived body
 * band uses: 0 mint, 1 fine, 2 worn, 3 poor, 4 scrap. The axis and the band
 * ladder have the same number of rungs, so `scrap` falls out of the mapping
 * rather than needing a forcing condition of its own; a missing panel still
 * forces it separately, because an absent panel is a different fact from a
 * ruined one. Only `metal` reaches 4: ruined paint is repaintable and raw
 * filler is sandable, so neither `finish` nor `surface` grows a rung. */
const SEVERITY_BAND_ORDER: readonly ConditionBand[] = ['mint', 'fine', 'worn', 'poor', 'scrap']

/** The worst metal severity hand work can still pull back. Above it, beat and
 * weld both refuse and a fresh panel is the only route out. */
export const MAX_REPAIRABLE_METAL = 3

/** The metal severity meaning the panel is past saving - one rung above
 * weldable, and the reason `deriveBodyworkBand` can return `scrap` at all. */
export const BEYOND_REPAIR_METAL = 4

/** The finish a bare, unpainted zone reads, and the finish axis's own
 * maximum. Strip/prep leaves a zone here and a freshly fitted panel arrives
 * here; the polish stage refuses it outright, so primer and paint are the only
 * way down. */
const BARE_FINISH = 3

export function bandForSeverity(severity: number): ConditionBand {
  return SEVERITY_BAND_ORDER[Math.max(0, Math.min(BEYOND_REPAIR_METAL, severity))]!
}

/** The severity threshold a target band maps back to - the inverse of
 * `bandForSeverity`, used to size "how far below this target is the zone."
 * `mint` floors at 0 (there is nothing below mint to clear) and `scrap` tops
 * out at the beyond-repair rung, so a bill quoted against a `scrap` target
 * charges for nothing: the target is already the worst the axis can express. */
export function severityThresholdForBand(targetBand: ConditionBand): number {
  const idx = SEVERITY_BAND_ORDER.indexOf(targetBand)
  return idx < 0 ? 0 : idx
}

/**
 * A uniform-severity zone-state map, every zone reading exactly
 * `severityThresholdForBand(baseBand)` (surface/finish clamped to their own
 * smaller ranges) and one factory `colour` - the shared "every zone reads
 * one plain band" shape a hand-authored car builds from (a scripted auction
 * lot, a scripted service job), since neither rolls per-zone variation the
 * way generation does.
 */
export function uniformZoneStates(baseBand: ConditionBand, colour: string): ZoneStates {
  const severity = severityThresholdForBand(baseBand)
  const states = {} as Record<ZoneId, ZoneState>
  for (const zoneId of METAL_ZONE_IDS) {
    states[zoneId] = {
      metal: severity,
      surface: Math.min(severity, 2),
      finish: Math.min(severity, 3),
      panelMissing: false,
      primed: false,
      colour,
    }
  }
  for (const zoneId of TRIM_ZONE_IDS) {
    states[zoneId] = { finish: Math.min(severity, 3), panelMissing: false, primed: false, colour }
  }
  return states as ZoneStates
}

/** Whether this zone needs a fresh panel before any hand work on it can mean
 * anything: the panel is gone, or (metal zones only) its metal is past what
 * beating and welding can pull back. A trim zone never fails the second half
 * - it has no metal to exceed the threshold. The one gate `planPipelineStage`,
 * the repair bill and the workshop's own affordances all read, so the three
 * can never disagree about what a beyond-saving panel allows. */
export function zoneNeedsPanel(zone: ZoneState): boolean {
  return zone.panelMissing || (isMetalZoneState(zone) && zone.metal > MAX_REPAIRABLE_METAL)
}

/** The panel zones carrying no paint: stripped back, or wearing a panel that
 * arrived bare and has not been sprayed since. These are the zones holding
 * `derivePaintBand` down, and so the ones the style and authenticity readouts
 * are paying for. A zone with no panel on it is a different fact with its own
 * words, and is not counted here. */
export function unpaintedPanelZoneIds(zoneStates: ZoneStates): PanelZoneId[] {
  return PANEL_ZONE_IDS.filter(
    (zoneId) => !zoneStates[zoneId].panelMissing && zoneStates[zoneId].finish >= BARE_FINISH,
  )
}

/** Zone body score = max(metal, surface) on the six metal zones alone - trim
 * carries no metal condition to contribute; `bodywork` band is the worst of
 * those, mapped 0 mint/1 fine/2 worn/3 poor/4 scrap - and ANY of the nine
 * zones missing its panel forces `scrap` outright, since an absent panel
 * (metal or trim) has no severity to read. */
export function deriveBodyworkBand(zoneStates: ZoneStates): ConditionBand {
  if (PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].panelMissing)) return 'scrap'
  const worst = Math.max(
    ...METAL_ZONE_IDS.map((zoneId) =>
      Math.max(zoneStates[zoneId].metal, zoneStates[zoneId].surface),
    ),
  )
  return bandForSeverity(worst)
}

/**
 * The originality counterpart to `deriveBodyworkBand` above: whether every one
 * of the nine zones still wears its original panel - present (not
 * `panelMissing`) and never fitted with anything but a stock-grade one
 * (`panelGrade` absent reads as stock, see `TRIM_ZONE_FIELDS`'s own comment).
 * Worst-governs, the same rule the band already applies to condition: one
 * aftermarket panel, anywhere, makes the whole carrier non-original, exactly
 * as one gone panel is enough to force `scrap` above. This is what
 * `stocknessOf` (`derivedStats.ts`) reads instead of the carrier SKU's own
 * grade - every non-stock panel SKU is zone-scoped and can never reach
 * `car.parts.bodywork.installed.partId`, so that field never moves and cannot
 * answer this question any more.
 */
export function panelsAreAllStock(zoneStates: ZoneStates): boolean {
  return PANEL_ZONE_IDS.every((zoneId) => {
    const zone = zoneStates[zoneId]
    return !zone.panelMissing && (zone.panelGrade ?? 'stock') === 'stock'
  })
}

/** The colours a car's `factoryColour` pool entry authorises: the entry
 * itself for a single-colour car, or both halves of an `a+b` two-tone entry.
 * Shared by the paint stage's stock-grade gate, the paint band's mismatch
 * exemption and every screen marking which swatches a car legitimately wears,
 * so a two-tone car's legitimate scheme is defined in exactly one place. */
export function factoryColourSet(factoryColour: string): ReadonlySet<string> {
  return new Set(factoryColour.split('+'))
}

/** `paint` band is the worst finish across all nine zones, same mapping,
 * stepped one band worse when two or more painted zones disagree on colour
 * (the mismatch penalty) - an unpainted zone (`colour` absent) never
 * participates in the disagreement check. The step goes through the same
 * severity/band pair every other derivation uses, so `scrap` is its floor:
 * `bandForSeverity` clamps at the worst rung the ladder expresses, and panels
 * disagreeing about their colour cannot leave a car worse than that.
 *
 * `factoryColour` exempts a genuine factory two-tone: the car's factory
 * scheme is the SET of colours it legitimately wears (`factoryColourSet`),
 * and the penalty does not fire while every painted zone's colour is in that
 * set. A single-colour car's set has one member, so its behaviour is
 * unchanged; omitting `factoryColour` entirely (existing callers with no car
 * to read one from) preserves the old any-two-colours-disagree rule exactly. */
export function derivePaintBand(zoneStates: ZoneStates, factoryColour?: string): ConditionBand {
  const worst = Math.max(...PANEL_ZONE_IDS.map((zoneId) => zoneStates[zoneId].finish))
  const band = bandForSeverity(worst)
  const colours = new Set(
    PANEL_ZONE_IDS.map((zoneId) => zoneStates[zoneId].colour).filter(
      (colour): colour is string => colour != null,
    ),
  )
  if (colours.size < 2) return band
  if (factoryColour) {
    const allowed = factoryColourSet(factoryColour)
    if ([...colours].every((colour) => allowed.has(colour))) return band
  }
  return bandForSeverity(severityThresholdForBand(band) + 1)
}

export interface DerivedBodyBands {
  bodywork: ConditionBand
  paint: ConditionBand
}

export function deriveBodyBands(zoneStates: ZoneStates, factoryColour?: string): DerivedBodyBands {
  return {
    bodywork: deriveBodyworkBand(zoneStates),
    paint: derivePaintBand(zoneStates, factoryColour),
  }
}

/**
 * One zone's own condition band, in the same poor/worn/fine/mint vocabulary
 * every part slot already carries - derived exactly the way the two whole-car
 * carriers derive theirs, just narrowed to one zone: a
 * metal zone reads the worse of its own metal and surface severities (the
 * axis pair `deriveBodyworkBand` maxes across all six), a trim zone reads its
 * finish alone (the axis `derivePaintBand` maxes across all nine). A panel
 * that is off reads `scrap` outright, same as the whole-car derivation's own
 * `panelMissing` forcing rule - there is no severity to grade on nothing.
 *
 * Deliberately not the zone's paint state on a METAL zone: a metal zone's own
 * band is a read of its STRUCTURE, matching what `deriveBodyworkBand` actually
 * sums it into. Whether that zone is also unpainted is a separate fact
 * (`zoneNextStep` below still routes a bare or faded metal zone toward prime/
 * paint/polish), surfaced through the zone's own next action and the
 * whole-car `paint` band rather than tinting the diagram by an axis the zone's
 * displayed band was never meant to carry.
 */
export function zoneConditionBand(zone: ZoneState): ConditionBand {
  if (zone.panelMissing) return 'scrap'
  if (isMetalZoneState(zone)) return bandForSeverity(Math.max(zone.metal, zone.surface))
  return bandForSeverity(zone.finish)
}

/**
 * The single pipeline stage that would advance this zone toward mint right
 * now, or `'replace-panel'` when hand work cannot reach it at all (panel gone
 * or beyond welding), or `null` once the zone is already mint. Walks the same
 * prerequisite order the real stages enforce
 * (`planMetalPipelineStage`/`planSharedPipelineStage`): metal before surface
 * before finish, `weld` only at the weldable ceiling and `beat` below it,
 * `prime` only once bare and unprimed, `paint` only once primed - so this can
 * never name a stage that would refuse if actually run.
 *
 * Silent on `stripPrep`: stripping is never the objectively necessary next
 * step toward mint (polish alone clears a faded-but-not-bare finish), only a
 * discretionary way to redo a zone's colour - a fact about player intent, not
 * about the zone's own physical state, so it has no place in a PURE
 * derivation and stays a standing control next to the paint picker instead.
 *
 * Deliberately blind to `BodyLineCapability` too: a zone's next TYPE of stage
 * is a fact about its own state, not about which tool tier the shop owns
 * today. A caller wiring this to a live action still checks the stage's own
 * plan (`pipelineActionPlan`) before enabling the control, exactly as every
 * other pipeline button already does - a zone that needs `weld` but has no
 * body line hired still names `weld`, with the button itself disabled.
 */
export function zoneNextStep(zone: ZoneState): PipelineStageId | 'replace-panel' | null {
  if (zoneNeedsPanel(zone)) return 'replace-panel'
  if (isMetalZoneState(zone)) {
    if (zone.metal > 0) return zone.metal >= MAX_REPAIRABLE_METAL ? 'weld' : 'beat'
    if (zone.surface > 0) return 'fillAndSand'
  }
  if (zone.finish >= BARE_FINISH) return zone.primed ? 'paint' : 'prime'
  if (zone.finish > 0) return 'polish'
  return null
}

/**
 * Which metal zone(s) are the reason `deriveBodyworkBand` reads as bad as it
 * does: the zone(s) tied for the worst of metal/surface among the six, or -
 * when a panel missing anywhere is what forces the `scrap` floor - every zone
 * missing its panel. Ties are real: two corners dented equally hard both bind
 * the band equally, and the diagram marks both rather than picking one
 * arbitrarily.
 */
export function bodyworkBindingZoneIds(zoneStates: ZoneStates): ZoneId[] {
  const missing = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].panelMissing)
  if (missing.length > 0) return missing
  const worst = Math.max(
    ...METAL_ZONE_IDS.map((zoneId) =>
      Math.max(zoneStates[zoneId].metal, zoneStates[zoneId].surface),
    ),
  )
  return METAL_ZONE_IDS.filter(
    (zoneId) => Math.max(zoneStates[zoneId].metal, zoneStates[zoneId].surface) === worst,
  )
}

/**
 * Which zone(s) are the reason `derivePaintBand` reads as bad as it does: the
 * zone(s) tied for the worst finish among all nine. Silent on the mismatch
 * penalty (two zones disagreeing on colour, rather than either being badly
 * finished) - that is a relationship between zones, not a fact about one, and
 * stays a whole-car reading rather than a per-zone mark.
 */
export function paintBindingZoneIds(zoneStates: ZoneStates): ZoneId[] {
  const worst = Math.max(...PANEL_ZONE_IDS.map((zoneId) => zoneStates[zoneId].finish))
  return PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].finish === worst)
}

const DERIVED_BODY_PART_IDS = ['bodywork', 'paint'] as const
export type DerivedBodyPartId = (typeof DERIVED_BODY_PART_IDS)[number]

export function isBodyDerivedPart(carPartId: string): carPartId is DerivedBodyPartId {
  return (DERIVED_BODY_PART_IDS as readonly string[]).includes(carPartId)
}

/**
 * The SINGLE WRITER: derives `bodywork`/`paint` from `car.zoneState` and writes
 * the result onto the installed carrier parts. Runs at generation and after
 * every zone mutation; nothing else may write those two bands. A no-op when
 * `car.zoneState` is absent (a car not yet on the zone model - the
 * pre-wave-2 fixtures and any legacy state), so every existing caller that
 * never sets zone state keeps its band exactly as authored. The rare case of
 * a null `installed` slot on a zone-model car (never produced by real
 * generation, which always fills these two slots) synthesises a fresh stock
 * instance rather than leaving the slot empty, since these two parts are
 * always-present value carriers under the new model.
 *
 * It writes the BAND and nothing else onto an occupied slot, so whatever SKU
 * is fitted survives every re-derivation: a carrier holding a body kit keeps
 * holding it, and its band still comes from the zones.
 */
export function applyDerivedBodyBands(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): CarInstance {
  const zoneStates = car.zoneState
  if (!zoneStates) return car
  const fitmentClass = fitmentClassForTier(model.tier)
  const derived = deriveBodyBands(zoneStates, car.factoryColour)
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
 * codebase uses (`auctions.ts`'s `rollDamageGrade`/`pickWeightedCause`). */
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

/** The two heaviest of the four ordered damage grades. A panel goes past
 * saving only on a car whose history says it was properly hurt, which is what
 * keeps the state the car that got hit rather than the car that got old. */
const BEYOND_REPAIR_GRADES: readonly DamageGrade[] = ['rough', 'project']

/**
 * Rolls a fresh car's nine zones (docs/design/systems/workshop-rework.md's
 * generation table): the six metal zones roll `metal`, `surface` and `finish`
 * independently per zone from the tier's own weight tables; the three trim
 * zones roll `finish` alone, from the same finish table (a bumper's paint
 * wears the same way a panel's does; it just has no metal underneath to
 * rust). No zone starts with a colour (that is a paint-stage state, never
 * rolled), and only the grade-gated escalation below can start one with a
 * missing panel. Seeded via `rng`, the same stream the rest of generation
 * threads.
 *
 * `severityOrder` ARRANGES the nine zones' rolled severities without changing
 * them: the metal zones' rolled states are dealt out worst-first along the
 * order's own metal subsequence, and the trim zones' along its trim
 * subsequence, so the caller decides which zones carry the damage the tier
 * tables already decided the car has. Dealing the two shapes separately keeps
 * a metal roll from ever landing on a trim zone (which cannot receive one) -
 * only WHERE moves, never WHAT. Defaults to the zones' own order, which is a
 * no-op for both subsequences.
 *
 * `history` is the ONE thing that can take a panel past what hand work can
 * pull back, and it is not a permutation: the lead METAL zone of
 * `severityOrder` (the metal panel the pattern implicates most, holding the
 * worst severities the tier tables rolled) escalates its metal to
 * `BEYOND_REPAIR_METAL` when the car's history is one of the two heaviest
 * grades, that zone's metal already sits at the weldable maximum, and
 * `zoneBeyondRepairChance` lands. A second roll against `zonePanelMissingChance`
 * then decides whether the panel is absent outright rather than ruined in
 * place. Both rolls are drawn whenever a history is supplied, applied only
 * when the gates hold, so a car's draw sequence does not depend on how it
 * happened to roll. `history` absent means neither state can occur, which is
 * what a caller with no story behind the car wants; `allowPanelMissing` false
 * keeps the panel on the car (a customer's own car never turns up with a
 * panel gone), leaving only the ruined-in-place state.
 *
 * `factoryColour` and `culture`, given TOGETHER, additionally roll the car's
 * whole-car paint state (`applyPaintHistory`) and write the result onto the
 * returned zones' `colour`/`primed` fields. Either absent (the default) skips
 * that roll entirely and leaves every zone with no colour at all, exactly the
 * prior behaviour - so every existing caller with no car to roll a colour for
 * keeps its draw sequence and its result unchanged.
 */
export function rollZoneStates(
  fitmentClass: PartFitmentClass,
  economy: EconomyConfig,
  rng: Rng,
  severityOrder: readonly ZoneId[] = PANEL_ZONE_IDS,
  history: DamageGrade | null = null,
  allowPanelMissing: boolean = true,
  factoryColour: string | null = null,
  culture: CarCulture | null = null,
): ZoneStates {
  const {
    metalWeightsByTier,
    finishWeightsByTier,
    surfaceExtraChance,
    zoneBeyondRepairChance,
    zonePanelMissingChance,
  } = economy.partsGeneration.zoneStates
  const rollMetalZone = (): MetalZoneState => {
    const metal = rollSeverity(metalWeightsByTier[fitmentClass], rng)
    const finish = rollSeverity(finishWeightsByTier[fitmentClass], rng)
    let surface = Math.max(0, metal - 1)
    if (rng.next() < surfaceExtraChance) surface = Math.min(2, surface + 1)
    return { metal, surface, finish, panelMissing: false, primed: false }
  }
  const rollTrimZone = () => ({
    finish: rollSeverity(finishWeightsByTier[fitmentClass], rng),
    panelMissing: false,
    primed: false,
  })

  const zoneStates = {} as Record<ZoneId, ZoneState>
  // Rolled first, in the zones' own fixed order so the draw sequence is
  // unchanged, then dealt out worst-first along `severityOrder`'s own
  // subsequence for each shape. A caller may legitimately name only the
  // zones it has an opinion about (a metal-only order to arrange a purely
  // mechanical escalation, say) - any zone of either shape `severityOrder`
  // never mentions is appended in the zones' own natural order, so every
  // metal and every trim zone always ends up dealt exactly one rolled state,
  // whatever the caller's order actually lists.
  const isMetalId = (zoneId: ZoneId): zoneId is MetalZoneId =>
    (METAL_ZONE_IDS as readonly string[]).includes(zoneId)
  const metalOrder = [
    ...severityOrder.filter(isMetalId),
    ...METAL_ZONE_IDS.filter((zoneId) => !severityOrder.includes(zoneId)),
  ]
  const trimOrder = [
    ...severityOrder.filter((zoneId) => !isMetalId(zoneId)),
    ...TRIM_ZONE_IDS.filter((zoneId) => !severityOrder.includes(zoneId)),
  ]
  const rolledMetal = METAL_ZONE_IDS.map(() => rollMetalZone())
  rolledMetal.sort((a, b) => b.metal + b.surface + b.finish - (a.metal + a.surface + a.finish))
  metalOrder.forEach((zoneId, index) => {
    zoneStates[zoneId] = rolledMetal[index]!
  })
  const rolledTrim = TRIM_ZONE_IDS.map(() => rollTrimZone())
  rolledTrim.sort((a, b) => b.finish - a.finish)
  trimOrder.forEach((zoneId, index) => {
    zoneStates[zoneId] = rolledTrim[index]!
  })

  if (history !== null) {
    const beyondRepairRoll = rng.next()
    const panelMissingRoll = rng.next()
    const leadZoneId = metalOrder[0]!
    const lead = zoneStates[leadZoneId] as MetalZoneState
    if (
      BEYOND_REPAIR_GRADES.includes(history) &&
      lead.metal === MAX_REPAIRABLE_METAL &&
      beyondRepairRoll < zoneBeyondRepairChance
    ) {
      zoneStates[leadZoneId] = {
        ...lead,
        metal: BEYOND_REPAIR_METAL,
        panelMissing: allowPanelMissing && panelMissingRoll < zonePanelMissingChance,
      }
    }
  }
  if (factoryColour !== null && culture !== null) {
    return applyPaintHistory(zoneStates as ZoneStates, factoryColour, culture, economy, rng)
  }
  return zoneStates as ZoneStates
}

/** The colour each panel zone wears when the car is in its factory scheme: the
 * `factoryColour` pool entry itself for every zone on a single-colour car, or
 * - for a genuine two-tone entry (`a+b`) - the two halves dealt across the
 * nine panel zones in their own declared order. Which physical panel takes
 * which half is deliberately not modelled (the research could not establish
 * the arrangement for most of the seven two-tone roster cars), so this is the
 * simplest deterministic split rather than an authored one: the first half of
 * `PANEL_ZONE_IDS` (by count, rounded up) wears the first colour, the rest the
 * second. Exported so anything BUILDING a car in its factory scheme deals the
 * halves the way generation does, rather than writing the joined token into a
 * zone, which is not a palette colour and which the paint stage would refuse. */
export function factoryReferenceColours(factoryColour: string): Record<PanelZoneId, string> {
  const halves = factoryColour.split('+')
  if (halves.length === 1) {
    return Object.fromEntries(PANEL_ZONE_IDS.map((zoneId) => [zoneId, halves[0]!])) as Record<
      PanelZoneId,
      string
    >
  }
  const firstHalfCount = Math.ceil(PANEL_ZONE_IDS.length / 2)
  return Object.fromEntries(
    PANEL_ZONE_IDS.map((zoneId, index) => [zoneId, halves[index < firstHalfCount ? 0 : 1]!]),
  ) as Record<PanelZoneId, string>
}

/** A uniformly picked near neighbour of `colour`, from its own palette family
 * and excluding itself - the wrong-shade panel a mismatched-panel car wears,
 * so a badly repainted zone reads as the wrong white rather than a random
 * colour. Falls back to `colour` itself only if the palette ever shipped a
 * family of one, which every authored family avoids. */
function pickFamilyNeighbour(colour: string, rng: Rng): string {
  const entry = PAINT_COLOURS.find((candidate) => candidate.id === colour)
  if (!entry) return colour
  const neighbours = PAINT_COLOURS.filter(
    (candidate) => candidate.family === entry.family && candidate.id !== colour,
  )
  return neighbours.length > 0 ? rng.pick(neighbours).id : colour
}

/**
 * Rolls one of the four named whole-car paint states
 * (docs/design/systems/paint-system-design.md) from the culture's own
 * profile (`economy.partsGeneration.paintHistoryByCulture` ->
 * `paintHistory`) and writes the result onto `zoneStates`'s nine zones.
 * The state is structural, never per-zone independent draws, which is what
 * makes a three-way clown-car mismatch impossible by construction rather than
 * merely unlikely:
 *
 * - `original`: every zone its own reference colour (`factoryReferenceColours`
 *   - both halves of a two-tone car's scheme, dealt across zones).
 * - `resprayed`: one colour, picked uniformly from the 34 excluding the car's
 *   own factory colour(s), on every zone alike.
 * - `mismatchedPanel`: every zone its own reference colour except one
 *   (uniform across the nine), which wears a family neighbour of the colour
 *   it should be.
 * - `primedPanel`: every zone its own reference colour except one, which is
 *   left bare (`primed: true`, no colour at all).
 *
 * `resprayed` is the only state `generatedPaintGrade` reads back as anything
 * but stock, so this function never itself decides the paint SKU - it only
 * ever writes colour and primed state.
 */
function applyPaintHistory(
  zoneStates: ZoneStates,
  factoryColour: string,
  culture: CarCulture,
  economy: EconomyConfig,
  rng: Rng,
): ZoneStates {
  const { paintHistory, paintHistoryByCulture } = economy.partsGeneration
  const weights = paintHistory[paintHistoryByCulture[culture]]
  const state: PaintHistoryState = pickWeighted(PAINT_HISTORY_STATES, (s) => weights[s], rng)
  const reference = factoryReferenceColours(factoryColour)

  if (state === 'resprayed') {
    const factorySet = factoryColourSet(factoryColour)
    const respray = rng.pick(PAINT_COLOURS.filter((colour) => !factorySet.has(colour.id))).id
    let next = zoneStates
    for (const zoneId of PANEL_ZONE_IDS) {
      next = { ...next, [zoneId]: { ...next[zoneId], colour: respray } }
    }
    return next
  }

  const affected = rng.pick(PANEL_ZONE_IDS)
  let next = zoneStates
  for (const zoneId of PANEL_ZONE_IDS) {
    if (state !== 'original' && zoneId === affected) continue
    next = { ...next, [zoneId]: { ...next[zoneId], colour: reference[zoneId] } }
  }
  if (state === 'primedPanel') {
    next = { ...next, [affected]: { ...next[affected], primed: true } }
  } else if (state === 'mismatchedPanel') {
    const neighbour = pickFamilyNeighbour(reference[affected]!, rng)
    next = { ...next, [affected]: { ...next[affected], colour: neighbour } }
  }
  return next
}

/**
 * Whether generation's rolled zone colours amount to a respray: every panel
 * zone the SAME colour, and that colour outside the car's own factory set.
 * `applyPaintHistory`'s `resprayed` state is the only one that paints every
 * zone alike in a colour that is not the car's own, so this reads that fact
 * back rather than threading a second value out of the roll - the same
 * derive-don't-duplicate shape `derivePaintBand` itself uses. Never returns
 * `sport` or `race`: a resprayed car always arrives at the cheap solid job
 * (docs/design/systems/paint-system-design.md), and metallic or pearl are
 * things only the player buys.
 */
export function generatedPaintGrade(zoneStates: ZoneStates, factoryColour: string): Grade {
  const colours = PANEL_ZONE_IDS.map((zoneId) => zoneStates[zoneId].colour)
  const [first, ...rest] = colours
  if (first == null) return 'stock'
  const uniform = rest.every((colour) => colour === first)
  return uniform && !factoryColourSet(factoryColour).has(first) ? 'street' : 'stock'
}

/**
 * Whether `carPartId` still has real MONEY headroom to degrade further:
 * `bodywork` reads the six metal zones' `surface` (capped at 2, trim carries
 * none); `paint` reads all nine zones' `finish` (capped at 3). The
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
  if (carPartId === 'bodywork')
    return METAL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].surface < 2)
  return PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].finish < 3)
}

/**
 * The IMPROVE-direction mirror of `hasZoneDegradeHeadroom`: whether
 * `carPartId` still has real MONEY headroom to improve further (a panel
 * needing replacement anywhere across the nine zones, or a money field still
 * above 0 on the zones that carry one). The Law 2 softening pass
 * (`enforceMaxBillFraction`) uses this to EXCLUDE an already-exhausted
 * zone-backed part from its worst-band computation, not merely from being
 * picked to improve: repairable metal never moves, so a high-metal zone can pin
 * a carrier's derived band below `mint` PERMANENTLY even once its money
 * contribution is already zero - left in the worst-band pool, it would
 * wrongly stay the eternal "worst part" and starve every other part still
 * genuinely below mint of its own climb passes.
 */
export function hasZoneImproveHeadroom(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): boolean {
  if (carPartId === 'bodywork') {
    if (PANEL_ZONE_IDS.some((zoneId) => zoneNeedsPanel(zoneStates[zoneId]))) return true
    return METAL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].surface > 0)
  }
  return PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].finish > 0)
}

/**
 * Sets a body-derived carrier's zone state to reach AT LEAST `targetBand` on
 * `zoneId` - a symptom's damage (`auctions.ts`'s `applySymptoms`), the one
 * other writer of these two parts' apparent severity besides generation and
 * the pipeline itself. Unlike the money-only degrade/improve helpers above, a
 * symptom is a real, hidden DEFECT (not a money-optimisation move), so it
 * legitimately moves METAL too when `carPartId` is `bodywork` - a "rust patch"
 * cause is about the panel's physical state, not what the cheapest fix costs.
 *
 * `zoneId` is the CALLER'S choice, drawn from the car's damage pattern
 * (docs/design/systems/generation-damage.md, layer 3) - a metal zone for
 * `bodywork` (the only shape `metal` exists on), any of the nine for `paint`.
 * It used to be a fixed `PANEL_ZONE_IDS[0]` to avoid an RNG draw, which put
 * every rust patch and every respray in the game on the bonnet;
 * worst-governs means one zone carrying the damage is enough to drive the
 * whole carrier's derived band, so WHICH zone was free to be arbitrary and is
 * now free to be the one the car's own story implicates.
 *
 * A no-op if the carrier is already at or worse than `targetBand` on that
 * zone (mirrors the "worse of current or cause" rule every other symptom
 * cause already follows), and a no-op on `bodywork` if `zoneId` somehow names a
 * trim zone (never produced by a correct caller, since `bodywork` damage is
 * always dealt a metal zone).
 *
 * A symptom never takes a panel past saving, however bad its cause reads: the
 * target severity is clamped to `MAX_REPAIRABLE_METAL`, so the worst a hidden
 * defect can leave is a panel that still beats and welds back. Past that is
 * generation's own grade-gated roll (`rollZoneStates`), which is where the
 * story of a car being hit belongs.
 */
export function setZoneCarrierToAtLeastBand(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  targetBand: ConditionBand,
  zoneId: PanelZoneId,
): ZoneStates {
  const targetSeverity = Math.min(MAX_REPAIRABLE_METAL, severityThresholdForBand(targetBand))
  const zone = zoneStates[zoneId]
  if (carPartId === 'bodywork') {
    if (!isMetalZoneState(zone)) return zoneStates
    if (Math.max(zone.metal, zone.surface) >= targetSeverity) return zoneStates
    return { ...zoneStates, [zoneId]: { ...zone, metal: Math.max(zone.metal, targetSeverity) } }
  }
  if (zone.finish >= targetSeverity) return zoneStates
  return { ...zoneStates, [zoneId]: { ...zone, finish: targetSeverity } }
}

/**
 * Worsens one zone that still has headroom before hitting `carPartId`'s
 * money-relevant field cap - the generation damage budget's zone-aware
 * degrade move (`spendDamageBudget`, auctions.ts). `bodywork` degrades a metal
 * zone's `surface`; `paint` degrades any of the nine zones' `finish`.
 *
 * WHICH zone is the caller's to choose, through `chooseZone`, because that is
 * the whole of how a collision becomes expressible: the budget hands it the
 * car's own damage pattern and a shunted car spends its bodywork on the bonnet
 * and the wings rather than evenly around the shell. Absent, it falls back to
 * the zone with the least headroom left, which deepens one zone before starting
 * another and is the right default for a caller with no story to tell.
 *
 * A no-op once every relevant zone is already capped: `bodywork` never reaches
 * `scrap` this way - that needs a panel gone or ruined past saving, two
 * separate and more drastic states this helper never touches, matching
 * `degradeBand`'s own never-forced-to-scrap contract.
 */
export function degradeZoneCarrierOneStep(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  chooseZone?: (candidates: readonly PanelZoneId[]) => PanelZoneId,
): ZoneStates {
  if (carPartId === 'bodywork') {
    const withHeadroom = METAL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].surface < 2)
    if (withHeadroom.length === 0) return zoneStates
    const targetId = chooseZone
      ? chooseZone(withHeadroom)
      : withHeadroom.reduce((worst, zoneId) =>
          zoneStates[zoneId].surface > zoneStates[worst].surface ? zoneId : worst,
        )
    const zone = zoneStates[targetId] as MetalZoneState
    return { ...zoneStates, [targetId]: { ...zone, surface: zone.surface + 1 } }
  }
  const withHeadroom = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].finish < 3)
  if (withHeadroom.length === 0) return zoneStates
  const targetId = chooseZone
    ? chooseZone(withHeadroom)
    : withHeadroom.reduce((worst, zoneId) =>
        zoneStates[zoneId].finish > zoneStates[worst].finish ? zoneId : worst,
      )
  const zone = zoneStates[targetId]
  return { ...zoneStates, [targetId]: { ...zone, finish: zone.finish + 1 } }
}

/**
 * Improves whichever zone currently carries the MOST of `carPartId`'s
 * money-relevant field - the Law 2 generation-softening pass's zone-aware
 * move (`enforceMaxBillFraction`, auctions.ts). For `bodywork`, a zone needing a
 * panel (any of the nine) is put back on the repairable ladder FIRST (the two
 * scrap-forcing states, and the only path a `bodywork` bill can carry a real
 * panel-purchase cost), before any metal zone's surface improves, mirroring
 * the general pass improving the single worst part one step at a time.
 * Absent and ruined-past-saving clear together in that one step because they
 * are one fact to the bill: exactly one panel price, charged once, gone once.
 */
export function improveZoneCarrierOneStep(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): ZoneStates {
  if (carPartId === 'bodywork') {
    const needsPanelId = PANEL_ZONE_IDS.find((zoneId) => zoneNeedsPanel(zoneStates[zoneId]))
    if (needsPanelId) {
      const zone = zoneStates[needsPanelId]
      const cleared = isMetalZoneState(zone)
        ? { ...zone, metal: Math.min(zone.metal, MAX_REPAIRABLE_METAL), panelMissing: false }
        : { ...zone, panelMissing: false }
      return { ...zoneStates, [needsPanelId]: cleared }
    }
    const withRoom = METAL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].surface > 0)
    if (withRoom.length === 0) return zoneStates
    const targetId = withRoom.reduce((worst, zoneId) =>
      zoneStates[zoneId].surface > zoneStates[worst].surface ? zoneId : worst,
    )
    const zone = zoneStates[targetId] as MetalZoneState
    return { ...zoneStates, [targetId]: { ...zone, surface: zone.surface - 1 } }
  }
  const withRoom = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].finish > 0)
  if (withRoom.length === 0) return zoneStates
  const targetId = withRoom.reduce((worst, zoneId) =>
    zoneStates[zoneId].finish > zoneStates[worst].finish ? zoneId : worst,
  )
  const zone = zoneStates[targetId]
  return { ...zoneStates, [targetId]: { ...zone, finish: zone.finish - 1 } }
}

function materialCostYen(materialId: string): number {
  const material = MATERIALS.find((m) => m.id === materialId)
  if (!material) throw new Error(`bodyPipeline: unknown material "${materialId}"`)
  return material.priceYen
}

const FILL_AND_SAND_COST_YEN = materialCostYen('filler') + materialCostYen('paper')
const PRIME_COST_YEN = materialCostYen('primer')
const PAINT_COST_YEN = materialCostYen('paint')
const PAINT_METALLIC_COST_YEN = materialCostYen('paint-metallic')
const PAINT_PEARL_COST_YEN = materialCostYen('paint-pearl')
const POLISH_COST_YEN = materialCostYen('polish')

/** The tin a panel paint job charges, by finish grade - stock and street both
 * lay a solid colour and share one tin; sport (metallic) and race (pearl)
 * each have their own. Exported so the respray resolver
 * (`resolvePipelineResprayAction`, pipelineActions.ts) prices its own tin
 * draw at the same per-use rate a panel-by-panel paint job charges, rather
 * than restating it. */
export const PAINT_TIN_COST_YEN_BY_GRADE: Readonly<Record<Grade, number>> = {
  stock: PAINT_COST_YEN,
  street: PAINT_COST_YEN,
  sport: PAINT_METALLIC_COST_YEN,
  race: PAINT_PEARL_COST_YEN,
}

/** The finish a paint grade lays - stock and street both lay a plain solid
 * colour, sport lays metallic, race lays pearl. The same grouping
 * `PAINT_TIN_COST_YEN_BY_GRADE` above prices; `consumables.ts` reads this to
 * turn a staged paint action's grade into the shelf key it draws from, so a
 * grade can never mean two different finishes to the two modules. */
export const PAINT_FINISH_BY_GRADE: Readonly<Record<Grade, PaintFinish>> = {
  stock: 'solid',
  street: 'solid',
  sport: 'metallic',
  race: 'pearl',
}

/** The zone-panel catalog SKU for one zone, at one fitment class and grade -
 * a `zoneId`-carrying entry, the stock one (priced through the `zonePanel`
 * pricing basis) unless another grade is asked for. */
export function zonePanelPart(
  partsById: Readonly<Record<string, Part>>,
  zoneId: ZoneId,
  fitmentClass: PartFitmentClass,
  grade: Grade = 'stock',
): Part | undefined {
  return Object.values(partsById).find(
    (part) => part.zoneId === zoneId && part.fitmentClass === fitmentClass && part.grade === grade,
  )
}

/**
 * Every AFTERMARKET panel a car's nine zones are actually wearing, as the
 * catalogue SKU each zone's `panelGrade` names at `fitmentClass`. The one walk
 * the three zone-panel terms below share, so what the body looks like, what it
 * is worth and what it weighs can never disagree about what is fitted.
 *
 * Two zones contribute nothing and are skipped here rather than in each
 * caller: one whose panel is GONE (there is no panel there to read), and one
 * still wearing STOCK (`panelGrade` absent reads as stock, see
 * `TRIM_ZONE_FIELDS`) - stock is the baseline every zone starts from, never an
 * upgrade. So an untouched car costs no catalogue lookups at all.
 */
export function fittedZonePanels(
  zoneStates: ZoneStates,
  partsById: Readonly<Record<string, Part>>,
  fitmentClass: PartFitmentClass,
): Part[] {
  const fitted: Part[] = []
  for (const zoneId of PANEL_ZONE_IDS) {
    const zone = zoneStates[zoneId]
    const grade = zone.panelGrade ?? 'stock'
    if (zone.panelMissing || grade === 'stock') continue
    const part = zonePanelPart(partsById, zoneId, fitmentClass, grade)
    if (part) fitted.push(part)
  }
  return fitted
}

/**
 * The style points the bodywork SLOT delivers on a car on the zone model: the
 * MEAN of its nine zones' own fitted SKUs, read off the catalogue's authored
 * ladder rather than any second table. A car wearing one grade all round
 * therefore delivers exactly the points that grade's panel is authored with,
 * the same one figure every other slot contributes from its one fitted part,
 * and a car wearing over-fenders on two corners delivers two ninths of it -
 * a partial kit is a partial statement.
 *
 * That is what keeps the body one slot among many. Nine zones each paying in
 * full would put a full set of race body panels at nine times the loudest
 * single part in the catalogue, past `styleSaturationPoints` on its own, and every other style
 * part on that car would be worth exactly nothing.
 */
export function zonePanelStylePoints(
  zoneStates: ZoneStates,
  partsById: Readonly<Record<string, Part>>,
  fitmentClass: PartFitmentClass,
): number {
  let total = 0
  for (const part of fittedZonePanels(zoneStates, partsById, fitmentClass)) {
    total += part.statModifiers.style
  }
  return total / PANEL_ZONE_IDS.length
}

/**
 * The catalogue yen a car's fitted body panels represent: the SUM of the nine
 * zones' own aftermarket SKU prices, which is what
 * `installedPartsValueYen` (marketValue.ts) credits them at, discounted there
 * by coherence retention and the tier's `aftermarketReturn` exactly as every
 * other fitted part is.
 *
 * A SUM here where style takes a mean, and the two are not in tension: style
 * is one statement a whole car makes, and the body is one slot making it, so
 * nine zones share one slot's worth. Money is not shared. Nine carbon panels
 * are nine purchases at nine prices, and a player who has done the whole shell
 * has spent nine times what one who did the bonnet has. A mean would price
 * eight of those purchases at zero.
 *
 * Nothing here is charged twice. A panel's `pricePaidYen` posts to the car's
 * `partsYen` LEDGER when it is fitted, which is what the car has cost its
 * owner, never what it is worth to a buyer. And the restoration bill only ever
 * quotes a STOCK panel, and only for a zone that needs one at all
 * (`bodyworkRepairBillYen`), so a fitted carbon bonnet's catalogue price
 * appears in no other term.
 */
export function zonePanelValueYen(
  zoneStates: ZoneStates,
  partsById: Readonly<Record<string, Part>>,
  fitmentClass: PartFitmentClass,
): number {
  let total = 0
  for (const part of fittedZonePanels(zoneStates, partsById, fitmentClass)) {
    total += part.priceYen
  }
  return total
}

/**
 * The mass multiplier a car's fitted body panels deliver - the MEAN across all
 * nine zones of each zone's own SKU `physicalModifiers.mass`, with a stock or
 * absent panel reading 1.0 (it saves nothing).
 *
 * The mean is right here for the physical reason style's is: the nine zones
 * are ONE shell between them, and the figure authored on a panel SKU is what a
 * whole set of that grade saves, not what one panel does. So a full carbon set
 * reads the authored 0.975 and the four corners alone read about 0.989 -
 * roughly 30 kg off a 1,200 kg car for the full set, which is what carbon
 * panels really weigh against steel.
 */
export function zonePanelMassFactor(
  zoneStates: ZoneStates,
  partsById: Readonly<Record<string, Part>>,
  fitmentClass: PartFitmentClass,
): number {
  const fitted = fittedZonePanels(zoneStates, partsById, fitmentClass)
  let total = PANEL_ZONE_IDS.length - fitted.length
  for (const part of fitted) {
    total += part.physicalModifiers.mass
  }
  return total / PANEL_ZONE_IDS.length
}

export interface PipelineStageEffect {
  ok: true
  zone: ZoneState
  /** Materials only - labour is not part of a stage's own effect. The
   * caller (`pipelineActions.ts`) reads the labour figure straight off
   * `economy.energy.bodyStagePoints[stage]`, a flat content value per stage
   * with no tool-tier multiplication, so it is never expressed twice. */
  materialsCostYen: number
}

export interface PipelineStageRefusal {
  ok: false
  reason:
    | 'prereq'
    | 'needs-panel'
    | 'wrong-colour'
    | 'metal-only'
    /** The body line lacks the capability this stage needs: polish below
     * `unlocked` (tier 2 owned or hired today), or a respray below
     * `fullCapability` (tier 3 owned or hired today). */
    | 'tool-tier'
    /** The shelf does not hold enough of a consumable this stage needs
     * (`stagedWork.ts`'s live stock gate, ahead of `chargeAndApplyPipelineEffect`
     * - never returned by this module's own zone/capability planners, which
     * know nothing about the shelf). */
    | 'out-of-stock'
  /** Which `GameState.consumableStock` key is short - set only when `reason`
   * is `'out-of-stock'`, so a refusal names the tin rather than just the
   * fact of running out. */
  missingConsumable?: string
}

/** Options a stage's own gate reads - both express "the body line's daily
 * capability," at two different thresholds: `unlocked` (owned tier 2, or
 * hired today) gates the better paint finish and whether polish runs at all
 * (weld is priced at a rate through `machineLaborMultiplier` instead -
 * `pipelineActions.ts` - never a wall, sprint208.md); `fullCapability` (owned
 * tier 3, or hired today - hire always grants the WHOLE line, not just tier
 * 2) gates the best polish floor and the whole-car respray (`planRespray`
 * below). */
export interface BodyLineCapability {
  unlocked: boolean
  fullCapability: boolean
}

const METAL_ONLY_STAGE_IDS = ['beat', 'weld', 'fillAndSand'] as const
type MetalOnlyStageId = (typeof METAL_ONLY_STAGE_IDS)[number]
type SharedStageId = 'stripPrep' | 'prime' | 'polish'

function isMetalOnlyStage(stage: string): stage is MetalOnlyStageId {
  return (METAL_ONLY_STAGE_IDS as readonly string[]).includes(stage)
}

/**
 * The three metal-only stages' pure effect on one metal zone
 * (docs/design/systems/workshop-rework.md's pipeline table): beat and weld
 * straighten metal, fill-and-sand levels the surface underneath the paint.
 * Typed on `MetalZoneState`, not `ZoneState` - a trim zone cannot reach this
 * function at all without going through the runtime shape check the
 * dispatcher (`planPipelineStage`) performs first, so a caller that already
 * knows it holds a metal zone (anything indexing by `MetalZoneId`) gets that
 * guarantee from the type checker instead of a check of its own.
 *
 * `weld` now refuses below severity 3: a dent (1-2) is `beat`'s job, and
 * welding is for rot or a bend at the weldable maximum. That is the one rung
 * hand work can still pull back before a fresh panel becomes the only route
 * out.
 *
 * Weld is never a wall (sprint208.md - the starting shop owns a cheap stick
 * welder, so weld works day one): `capability` no longer gates it here at
 * all, only the metal-severity prerequisite does. What the body line buys is
 * SPEED, priced as a labour-rate multiplier by the caller
 * (`pipelineActions.ts`'s `resolvePipelineStageAction`, `machineLaborMultiplier`
 * against the `'body'` group), the same rate-not-wall shape every other
 * machine gate in this codebase already uses.
 *
 * All three stages also reset `finish` to `BARE_FINISH` and clear `primed`:
 * working the metal or levelling the surface underneath destroys whatever
 * paint sat on top, so a zone that needed hand work always owes the finish
 * chain again afterwards. Idempotent - a zone already bare and unprimed just
 * reads the same values back.
 */
export function planMetalPipelineStage(
  stage: MetalOnlyStageId,
  zone: MetalZoneState,
): PipelineStageEffect | PipelineStageRefusal {
  if (zone.panelMissing) return { ok: false, reason: 'needs-panel' }
  switch (stage) {
    case 'beat':
      if (zone.metal > MAX_REPAIRABLE_METAL) return { ok: false, reason: 'needs-panel' }
      if (zone.metal < 1 || zone.metal > 2) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, metal: zone.metal - 1, finish: BARE_FINISH, primed: false },
        materialsCostYen: 0,
      }
    case 'weld':
      if (zone.metal > MAX_REPAIRABLE_METAL) return { ok: false, reason: 'needs-panel' }
      if (zone.metal < MAX_REPAIRABLE_METAL) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, metal: 0, finish: BARE_FINISH, primed: false },
        materialsCostYen: 0,
      }
    case 'fillAndSand':
      if (zone.metal !== 0 || zone.surface === 0) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, surface: 0, finish: BARE_FINISH, primed: false },
        materialsCostYen: FILL_AND_SAND_COST_YEN,
      }
  }
}

/**
 * The three stages shared by both zone shapes: strip/prep, prime, polish -
 * none of them touch `metal` or `surface`, so a trim zone runs them exactly
 * as a metal zone does.
 *
 * A zone with no panel on it refuses every stage: there is nothing there to
 * strip, prime or polish. Refuses with `needs-panel`, which names the remedy
 * rather than the obstacle, because that is what the player has to be told.
 */
export function planSharedPipelineStage(
  stage: SharedStageId,
  zone: ZoneState,
  capability: BodyLineCapability,
): PipelineStageEffect | PipelineStageRefusal {
  if (zone.panelMissing) return { ok: false, reason: 'needs-panel' }
  switch (stage) {
    case 'stripPrep':
      return {
        ok: true,
        zone: { ...zone, finish: BARE_FINISH, primed: false },
        materialsCostYen: 0,
      }
    case 'prime': {
      // A trim zone has no surface to level in the first place, so its
      // filler prerequisite is vacuously satisfied - only `primed` gates it.
      const surfaceReady = !isMetalZoneState(zone) || zone.surface === 0
      if (!surfaceReady || zone.primed) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, primed: true },
        materialsCostYen: PRIME_COST_YEN,
      }
    }
    case 'polish': {
      if (zone.finish >= BARE_FINISH) return { ok: false, reason: 'prereq' } // bare - nothing to polish
      if (!capability.unlocked) return { ok: false, reason: 'tool-tier' }
      const floor = capability.fullCapability ? 0 : 1
      const nextFinish = Math.max(floor, zone.finish - 1)
      if (nextFinish === zone.finish) return { ok: false, reason: 'prereq' } // already at this tier's floor
      return {
        ok: true,
        zone: { ...zone, finish: nextFinish },
        materialsCostYen: POLISH_COST_YEN,
      }
    }
  }
}

/**
 * The six generic (non-paint, non-panel) stages' pure effect on one zone -
 * the single dispatcher every caller with a runtime-generic `ZoneState`
 * calls (`stagedWork.ts`'s staged-action resolver, and this module's own
 * bill-quoting walk). Metal-only stages refuse outright on a trim zone
 * (`metal-only`) rather than reading a field that is not there; the type
 * system does the real work inside `planMetalPipelineStage` itself, this is
 * the one runtime branch that decides which of the two typed planners a
 * dynamic zone id actually reaches.
 */
export function planPipelineStage(
  stage: Exclude<PipelineStageId, 'paint'>,
  zone: ZoneState,
  capability: BodyLineCapability,
): PipelineStageEffect | PipelineStageRefusal {
  if (isMetalOnlyStage(stage)) {
    if (!isMetalZoneState(zone)) return { ok: false, reason: 'metal-only' }
    return planMetalPipelineStage(stage, zone)
  }
  return planSharedPipelineStage(stage, zone, capability)
}

/**
 * What a fresh panel at `panelBand` leaves a zone reading: metal at the
 * fitted part's own band-implied severity (metal zones only) and a sound
 * surface, or - on a trim zone - just the bare finish/no-metal facts; either
 * way bare, unpainted and unprimed, so the zone needs the fill-prime-paint
 * chain again regardless of what it looked like before. This is the only
 * route out of a panel that is gone or past saving, and it clears both
 * outright: shape-preserving, so a metal zone in still reads as a metal zone
 * out. It reads the fitted panel honestly rather than clamping it: fitting a
 * `scrap` panel harvested off another shell leaves the zone exactly as
 * beyond saving as the panel is.
 *
 * `grade` records the fitted panel's own catalog grade onto the zone
 * (`panelGrade` - see `TRIM_ZONE_FIELDS`'s own comment), which is what lets
 * `panelsAreAllStock` above answer originality without ever reading the
 * whole-car carrier's own SKU. Defaults to `stock` because every caller below
 * except the live install action (`stagedWork.ts`'s
 * `resolvePipelineInstallPanelAction`, which passes the player's actual
 * fitted grade) fits a stock replacement panel: generation's own refit,
 * the whole-car carrier refit (`refitCarrierZoneStates`, reachable only with
 * the stock carrier SKU - every non-stock one is zone-scoped and refused
 * there), and every repair-bill projection below.
 *
 * The one function both the STAGED player action (install a panel from the
 * shelf) and the pure bill-quoting/carrier-refit walks below call - a fresh
 * panel is one physical fact, quoted or actually fitted through the same
 * arithmetic either way.
 */
export function planInstallPanel(
  zone: ZoneState,
  panelBand: ConditionBand,
  grade: Grade = 'stock',
  captured?: PartInstance['panelState'],
): ZoneState {
  if (isMetalZoneState(zone)) {
    return {
      metal: severityThresholdForBand(panelBand),
      surface: captured?.surface ?? 0,
      finish: captured?.finish ?? BARE_FINISH,
      panelMissing: false,
      primed: captured?.primed ?? false,
      ...(captured?.colour ? { colour: captured.colour } : {}),
      panelGrade: grade,
    }
  }
  return {
    finish: captured?.finish ?? BARE_FINISH,
    panelMissing: false,
    primed: captured?.primed ?? false,
    ...(captured?.colour ? { colour: captured.colour } : {}),
    panelGrade: grade,
  }
}

/** What pulling a zone's panel off leaves behind: missing, and otherwise
 * exactly as found - the physical panel is not discarded, it is harvested
 * onto the shelf as a `PartInstance` by the caller (`stagedWork.ts`), the
 * same shape `resolveRemovePart` uses for every other slot. A missing zone's
 * other fields go unread everywhere that matters (`zoneNeedsPanel` and
 * `deriveBodyworkBand` both key off `panelMissing` alone), so there is nothing
 * to clear. */
export function planRemovePanel(zone: ZoneState): ZoneState {
  return { ...zone, panelMissing: true }
}

/**
 * The zones each body value carrier's own physical parts occupy: all nine for
 * `bodywork`, none for `paint` - it is a finish the pipeline lays on rather
 * than a part that arrives, so changing what is fitted there moves no zone.
 */
const CARRIER_ZONE_IDS: Readonly<Record<DerivedBodyPartId, readonly PanelZoneId[]>> = {
  bodywork: PANEL_ZONE_IDS,
  paint: [],
}

/**
 * Every zone `carPartId` covers, as `planInstallPanel` leaves it once a fresh
 * part at `band` is on the car. Fitting a body kit is the same physical event
 * as fitting one fresh panel per zone, so it takes the same route rather than
 * a second one of its own, and a re-panelled car owes its paint exactly as a
 * re-panelled zone does.
 *
 * Identity and condition stay orthogonal either side of this: the fitted SKU
 * says what the car IS, and the band `applyDerivedBodyBands` writes afterwards
 * still comes from the zones alone, so a dented set of sport body panels is
 * still a set of sport body panels.
 */
export function refitCarrierZoneStates(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  band: ConditionBand,
): ZoneStates {
  let next = zoneStates
  for (const zoneId of CARRIER_ZONE_IDS[carPartId]) {
    next = { ...next, [zoneId]: planInstallPanel(next[zoneId], band) }
  }
  return next
}

/** Paint's effect: needs the zone primed; the achieved finish is 1 with the
 * body line unlocked (owned tier 2, or hired today), else 2 - tier 1 hand
 * tools and rattle cans cap at tidy. A zone with no panel on it has nothing to
 * paint and says so.
 *
 * `grade` sets which tin the job charges (`PAINT_TIN_COST_YEN_BY_GRADE`) and
 * is the one gate that makes "respray it back and it is original again"
 * work: a `stock`-grade job is refused everywhere but the car's own factory
 * colour (`factoryColourSet`, so a two-tone car may lay either of its two
 * factory halves) - `pipelineActions.ts` reads that refusal to keep a player
 * from laying a stock-grade job in a colour the car never wore. Street, sport
 * and race lay any colour, since choosing to respray already spends the
 * car's authenticity. */
export function planPaintStage(
  zone: ZoneState,
  colour: string,
  capability: BodyLineCapability,
  grade: Grade,
  factoryColour: string,
): PipelineStageEffect | PipelineStageRefusal {
  if (zone.panelMissing) return { ok: false, reason: 'needs-panel' }
  if (!zone.primed) return { ok: false, reason: 'prereq' }
  if (grade === 'stock' && !factoryColourSet(factoryColour).has(colour)) {
    return { ok: false, reason: 'wrong-colour' }
  }
  const finish = capability.unlocked ? 1 : 2
  return {
    ok: true,
    zone: { ...zone, finish, primed: false, colour },
    materialsCostYen: PAINT_TIN_COST_YEN_BY_GRADE[grade],
  }
}

/** `planRespray`'s success shape: every zone `planRespray` touched, and which
 * ones - a whole-car operation, so unlike `PipelineStageEffect` there is no
 * single zone to return. Materials and labour are the resolver's own
 * arithmetic off `coveredZoneIds.length` (docs/sprints/sprint222.md, "The
 * respray": labour is 1 per covered zone, tin draw is
 * `ceil(covered x 2/3)`), not priced here - `planRespray` only decides WHICH
 * zones move and WHERE they land, the same split `PipelineStageEffect`
 * itself keeps `chargeAndApplyPipelineEffect` to do for one zone. */
export interface RespraySprayEffect {
  ok: true
  zoneStates: ZoneStates
  coveredZoneIds: PanelZoneId[]
}

/**
 * The whole-car respray's plan: every currently primed zone painted in one
 * pass at booth quality (finish 1 - a booth is never the tier-1 "tidy"
 * ceiling `planPaintStage` allows, since `fullCapability` implies
 * `unlocked`), refusing outright rather than partially covering the car.
 * Three refusals, checked in order: the body line's full capability (booth
 * owned or hired today - `fullCapability`, not merely `unlocked`, since a
 * respray is the tier-3 ability); fewer than two zones primed (one primed
 * zone is a touch-up, which per-panel Paint already covers); and the same
 * stock-grade colour gate `planPaintStage` enforces (a `stock`-grade job
 * refused everywhere but the car's own factory colour(s)). A zone missing
 * its panel is never primed to begin with (`planSharedPipelineStage`'s
 * `prime` case refuses a missing panel outright), so no separate check is
 * needed here to exclude it.
 */
export function planRespray(
  zoneStates: ZoneStates,
  colour: string,
  capability: BodyLineCapability,
  grade: Grade,
  factoryColour: string,
): RespraySprayEffect | PipelineStageRefusal {
  if (!capability.fullCapability) return { ok: false, reason: 'tool-tier' }
  const coveredZoneIds = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId].primed)
  if (coveredZoneIds.length < 2) return { ok: false, reason: 'prereq' }
  if (grade === 'stock' && !factoryColourSet(factoryColour).has(colour)) {
    return { ok: false, reason: 'wrong-colour' }
  }
  let next = zoneStates
  for (const zoneId of coveredZoneIds) {
    next = { ...next, [zoneId]: { ...next[zoneId], finish: 1, primed: false, colour } }
  }
  return { ok: true, zoneStates: next, coveredZoneIds }
}

/** The capability a BILL prices at: the whole body line. A bill is the work a
 * car needs, never what today's shop can finish, which is the contract every
 * other whole-car bill function in the sim already keeps. */
const BILL_CAPABILITY: BodyLineCapability = { unlocked: true, fullCapability: true }

/**
 * One zone's route through the pipeline: the state the stages leave behind,
 * and their materials money split by the carrier that owns each stage. Filler
 * is `bodywork`'s (metal zones only); primer, the paint tin and polish belong
 * to `paint`, on every zone alike.
 */
interface ZoneRepairRoute {
  zone: ZoneState
  /** True when the only way in was a fresh panel. Its price is the caller's
   * to add: a panel is bought from the catalogue rather than out of a stage's
   * materials, so `planInstallPanel` charges nothing for it. */
  panelFitted: boolean
  fillerYen: number
  finishYen: number
  /** The stages the route actually runs, in the order it works them, split by
   * the carrier that owns each one - the labour half of the same walk the two
   * money fields price. The split is the money split: metalwork and the fill
   * are `bodywork`'s, primer/tin/polish are `paint`'s, so no stage is ever
   * charged to both carriers. Priced by `bodyPartRepairLabourPoints` at
   * `economy.energy.bodyStagePoints`; the money bills ignore them. */
  bodyworkStages: PipelineStageId[]
  paintStages: PipelineStageId[]
}

/** Metal down to what `targetSeverity` allows, through the stages that
 * actually do it: `beat` walks one rung at a time and `weld` clears the lot.
 * Both cost labour and never yen, so this moves the zone and the stage list
 * and never the money. */
function straightenMetal(
  zone: MetalZoneState,
  targetSeverity: number,
): { zone: MetalZoneState; stages: PipelineStageId[] } {
  let current = zone
  const stages: PipelineStageId[] = []
  while (current.metal > targetSeverity) {
    const beat = planMetalPipelineStage('beat', current)
    if (beat.ok) {
      current = beat.zone as MetalZoneState
      stages.push('beat')
      continue
    }
    const weld = planMetalPipelineStage('weld', current)
    if (!weld.ok) break
    current = weld.zone as MetalZoneState
    stages.push('weld')
  }
  return { zone: current, stages }
}

/** The prime-paint-polish chain toward `targetSeverity`'s finish, shared by
 * both zone shapes since none of the three stages read `metal` or `surface`.
 * The shade handed in is put straight back rather than invented: a bill
 * prices the tin and never a chosen colour, so the zone is repainted in
 * whatever it already wore - a projected respray must not invent the colour
 * disagreement `derivePaintBand` penalises. Grade `street` here is a plain
 * solid tin, same price as `stock` and never refused on colour, so a bill
 * never has to know what grade is actually fitted. */
function repaintChain(
  zone: ZoneState,
  targetSeverity: number,
): { zone: ZoneState; finishYen: number; stages: PipelineStageId[] } {
  let current = zone
  let finishYen = 0
  const stages: PipelineStageId[] = []
  const needsRepaint = current.finish > targetSeverity && current.finish >= BARE_FINISH
  if (needsRepaint) {
    const prime = planSharedPipelineStage('prime', current, BILL_CAPABILITY)
    if (prime.ok) {
      current = prime.zone
      finishYen += prime.materialsCostYen
      stages.push('prime')
    }
    const paint = planPaintStage(current, current.colour ?? '', BILL_CAPABILITY, 'street', '')
    if (paint.ok) {
      current = { ...paint.zone, colour: current.colour }
      finishYen += paint.materialsCostYen
      stages.push('paint')
    }
  }
  while (current.finish > targetSeverity) {
    const polish = planSharedPipelineStage('polish', current, BILL_CAPABILITY)
    if (!polish.ok) break
    current = polish.zone
    finishYen += polish.materialsCostYen
    stages.push('polish')
  }
  return { zone: current, finishYen, stages }
}

/**
 * The stages the pipeline would run to bring one METAL zone to
 * `targetSeverity`, and what their materials cost. It DRIVES
 * `planInstallPanel`, `planMetalPipelineStage`/`planSharedPipelineStage` and
 * `planPaintStage` rather than restating their prices, so a quote and the
 * charge `stagedWork.ts` makes for the same work can never disagree, and so
 * the bill measures a DISTANCE: two zones at different severities above one
 * target walk different numbers of stages and cost different money.
 *
 * The repair route rather than the cheapest one: metal is beaten and welded
 * back (labour, never yen) and a fresh panel is quoted only for a zone with no
 * other way out (`zoneNeedsPanel`). A fresh panel arrives straight and bare, so
 * a zone that gets one never also pays for filler, and always owes a repaint.
 *
 * The prerequisite chain is what makes this more than a per-axis sum: primer
 * refuses to go over raw filler and filler refuses to go over unstraightened
 * metal, so a repaint drags a fill along with it even where the target band
 * would have tolerated the surface it found.
 *
 * Metal is straightened in ONE pass, before the fill and before
 * `repaintChain` is priced, following one causal chain rather than
 * re-deriving it from the zone's state at three different points: metal
 * left above target still owes straightening, and straightening that far
 * bares the finish, so it owes the repaint too (`metalWorkOwed` feeds
 * `repaintOwed`, not the other way round - deciding the fill from the
 * PRE-metalwork finish alone missed exactly this case, a zone whose paint
 * was fine before the beats ran); a repaint owed over any raw surface owes
 * the fill (`repaintOwed` feeds `needsFill`, since `prime` refuses over
 * unlevelled surface); and the fill owes fully straight metal
 * (`planMetalPipelineStage`'s `fillAndSand` prerequisite), so the pass goes
 * all the way to 0 whenever a fill is coming, otherwise it stops at
 * `targetSeverity` - the same endpoint the old trailing straighten call
 * used, now run early enough for its finish reset to reach the price.
 */
function planMetalZoneRepair(zone: MetalZoneState, targetSeverity: number): ZoneRepairRoute {
  let current = zone
  let panelFitted = false
  let fillerYen = 0
  if (zoneNeedsPanel(current)) {
    current = planInstallPanel(current, 'mint') as MetalZoneState
    panelFitted = true
  }

  const metalWorkOwed = current.metal > targetSeverity
  const repaintOwed =
    metalWorkOwed || (current.finish > targetSeverity && current.finish >= BARE_FINISH)
  const needsFill = current.surface > 0 && (repaintOwed || current.surface > targetSeverity)

  const straightened = straightenMetal(current, needsFill ? 0 : targetSeverity)
  current = straightened.zone
  const bodyworkStages = straightened.stages

  if (needsFill) {
    const fill = planMetalPipelineStage('fillAndSand', current)
    if (fill.ok) {
      current = fill.zone as MetalZoneState
      fillerYen += fill.materialsCostYen
      bodyworkStages.push('fillAndSand')
    }
  }

  const {
    zone: paintedZone,
    finishYen,
    stages: paintStages,
  } = repaintChain(current, targetSeverity)
  return {
    zone: paintedZone as MetalZoneState,
    panelFitted,
    fillerYen,
    finishYen,
    bodyworkStages,
    paintStages,
  }
}

/** The stages the pipeline would run to bring one TRIM zone to
 * `targetSeverity` - no metal, no surface, no filler: strip/prep, prime,
 * paint and polish are the whole of it. */
function planTrimZoneRepair(zone: ZoneState, targetSeverity: number): ZoneRepairRoute {
  let current = zone
  let panelFitted = false
  if (zoneNeedsPanel(current)) {
    current = planInstallPanel(current, 'mint')
    panelFitted = true
  }
  const { zone: paintedZone, finishYen, stages } = repaintChain(current, targetSeverity)
  return {
    zone: paintedZone,
    panelFitted,
    fillerYen: 0,
    finishYen,
    bodyworkStages: [],
    paintStages: stages,
  }
}

/**
 * One zone's repair route, dispatched by shape: `planMetalZoneRepair` for the
 * six metal zones, `planTrimZoneRepair` for the three trim ones. A `scrap`
 * target is the worst any axis can express, so nothing is owed - checked once
 * here rather than in each shape's own planner.
 */
function planZoneRepair(zone: ZoneState, targetSeverity: number): ZoneRepairRoute {
  if (targetSeverity >= BEYOND_REPAIR_METAL) {
    return {
      zone,
      panelFitted: false,
      fillerYen: 0,
      finishYen: 0,
      bodyworkStages: [],
      paintStages: [],
    }
  }
  return isMetalZoneState(zone)
    ? planMetalZoneRepair(zone, targetSeverity)
    : planTrimZoneRepair(zone, targetSeverity)
}

/** One zone's own share of a body carrier's money-only repair bill. */
export interface ZoneBillLine {
  zoneId: PanelZoneId
  yen: number
}

/** The zone lines summed - the whole-bill form every existing caller reads. */
function sumZoneBill(lines: readonly ZoneBillLine[]): number {
  let total = 0
  for (const line of lines) total += line.yen
  return total
}

/**
 * `bodywork`'s money-only repair bill, per zone: the filler each metal zone's
 * own route calls for, plus a fresh zone panel for any of the nine zones that
 * needs one (`zoneNeedsPanel`). Repairable metal is always free to climb (beat
 * and weld are labour, never yen), so it costs money only where it has gone
 * past saving and a panel is the way out. Both panel-forcing states quote the
 * same one price and quote it once: a panel that is gone and a panel ruined
 * past welding cost the same to put right, and the fresh panel arrives with
 * its own sound surface, so neither also pays for filler.
 */
export function bodyworkRepairBillByZoneYen(
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): ZoneBillLine[] {
  const targetSeverity = severityThresholdForBand(targetBand)
  return PANEL_ZONE_IDS.map((zoneId) => {
    const route = planZoneRepair(zoneStates[zoneId], targetSeverity)
    const panelYen = route.panelFitted
      ? (zonePanelPart(partsById, zoneId, fitmentClass)?.priceYen ?? 0)
      : 0
    return { zoneId, yen: route.fillerYen + panelYen }
  })
}

/** `paint`'s money-only repair bill, per zone: the primer, paint and polish
 * each zone's own route calls for. A zone getting a fresh panel is quoted the
 * full repaint the bare replacement needs, since that is the finish it arrives
 * in. */
export function paintRepairBillByZoneYen(
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
): ZoneBillLine[] {
  const targetSeverity = severityThresholdForBand(targetBand)
  return PANEL_ZONE_IDS.map((zoneId) => ({
    zoneId,
    yen: planZoneRepair(zoneStates[zoneId], targetSeverity).finishYen,
  }))
}

/** `bodywork`'s money-only repair bill: its zone lines, summed. */
export function bodyworkRepairBillYen(
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): number {
  return sumZoneBill(bodyworkRepairBillByZoneYen(zoneStates, targetBand, fitmentClass, partsById))
}

/** `paint`'s money-only repair bill: its zone lines, summed. */
export function paintRepairBillYen(zoneStates: ZoneStates, targetBand: ConditionBand): number {
  return sumZoneBill(paintRepairBillByZoneYen(zoneStates, targetBand))
}

/**
 * Every zone as the repair route above leaves it at `band` - the state side of
 * the same walk the two bills price, so the money and the car always
 * describe one piece of work. A caller that charges the bill and then applies
 * this is buying exactly what it paid for, and the two halves of a bill split
 * at any intermediate band sum to the whole: repairing to the band and then
 * billing from there costs what billing straight to mint costs.
 *
 * It is NOT a per-axis clamp, because the pipeline is not one: a fill takes
 * the surface to zero rather than to the target, a repaint lands on the finish
 * the body line achieves, and a zone needing a panel gets the fresh, bare one
 * the bill quoted. Prices no capability and no labour, like the bills
 * themselves; the live workshop moves a zone one stage at a time through
 * `planPipelineStage`.
 */
export function zoneStatesRepairedToBand(zoneStates: ZoneStates, band: ConditionBand): ZoneStates {
  const targetSeverity = severityThresholdForBand(band)
  const repaired = {} as Record<string, ZoneState>
  for (const zoneId of ALL_ZONE_IDS) {
    repaired[zoneId] = planZoneRepair(zoneStates[zoneId], targetSeverity).zone
  }
  return repaired as ZoneStates
}

/** The one dispatcher `bands.ts`'s whole-car bill functions route
 * `bodywork`/`paint` through when `car.zoneState` is present. */
export function bodyPartRepairBillYen(
  carPartId: DerivedBodyPartId,
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): number {
  return sumZoneBill(
    bodyPartRepairBillByZoneYen(carPartId, zoneStates, targetBand, fitmentClass, partsById),
  )
}

/**
 * `bodyPartRepairBillYen`'s LABOUR sibling: what reaching `targetBand` on this
 * carrier costs in energy points, as the stages the same nine-zone walk would
 * actually run, each at its flat `economy.energy.bodyStagePoints` figure - the
 * rate `pipelineActions.ts` charges a player working that stage in the body
 * bay, so a quote and the shop floor price one piece of work rather than two.
 *
 * A sibling and not a second opinion: both halves come off `planZoneRepair`,
 * so what a carrier's money buys and what its labour works can never disagree
 * about which stages the car needs. The carrier split is the money split -
 * beating, welding and the fill are `bodywork`'s, primer, the tin and polish
 * are `paint`'s - so a car owing both metalwork and a respray never pays for
 * the same stage twice across the two carriers.
 *
 * Points, never yen, like every other labour figure in the sim; a caller
 * pricing labour at a market rate divides by `energy.pointsPerLabour` itself.
 * Hanging a fresh panel is not a stage and is not counted here: the panel is a
 * purchase, and `bodyworkRepairBillByZoneYen` already carries its price.
 */
export function bodyPartRepairLabourPoints(
  carPartId: DerivedBodyPartId,
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  bodyStagePoints: Readonly<Record<PipelineStageId, number>>,
): number {
  const targetSeverity = severityThresholdForBand(targetBand)
  let points = 0
  for (const zoneId of PANEL_ZONE_IDS) {
    const route = planZoneRepair(zoneStates[zoneId], targetSeverity)
    const stages = carPartId === 'bodywork' ? route.bodyworkStages : route.paintStages
    for (const stage of stages) points += bodyStagePoints[stage]
  }
  return points
}

/** `bodyPartRepairBillYen` unsummed - the same nine zone lines it adds up, for
 * a caller that has to show where a body carrier's bill actually falls. */
export function bodyPartRepairBillByZoneYen(
  carPartId: DerivedBodyPartId,
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): ZoneBillLine[] {
  if (carPartId === 'bodywork')
    return bodyworkRepairBillByZoneYen(zoneStates, targetBand, fitmentClass, partsById)
  return paintRepairBillByZoneYen(zoneStates, targetBand)
}
