import {
  PanelZoneIdSchema,
  PAINT_COLOURS,
  PAINT_HISTORY_STATES,
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
  type PaintHistoryState,
  type PanelZoneId,
  type Part,
  type PartFitmentClass,
  type PipelineStageId,
  type ZoneId,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import type { SimContext } from './context'
import { pickWeighted, type Rng } from './rng'

/**
 * The body pipeline's own module (docs/design/systems/workshop-rework.md): zone
 * generation, the worst-governs derivation of the three body value-carrier
 * bands (`panels`/`paint`/`underbody`) from zone state, and the pure
 * per-stage effect a confirmed pipeline action applies to one zone. Pure
 * functions only - no `GameState`, no jobs.ts dependency, so this module
 * never risks a cycle with the orchestration layer (`stagedWork.ts`) that
 * calls it.
 */

export const PANEL_ZONE_IDS = PanelZoneIdSchema.options
export const ALL_ZONE_IDS = ZoneIdSchema.options

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
 * weldable, and the reason `derivePanelsBand` can return `scrap` at all. */
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

/** Whether this zone needs a fresh panel before any hand work on it can mean
 * anything: the panel is gone, or its metal is past what beating and welding
 * can pull back. The one gate `planPipelineStage`, the repair bill and the
 * workshop's own affordances all read, so the three can never disagree about
 * what a beyond-saving panel allows. */
export function zoneNeedsPanel(zone: ZoneState): boolean {
  return zone.panelMissing || zone.metal > MAX_REPAIRABLE_METAL
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

/** Zone body score = max(metal, surface); `panels` band is the worst body
 * score across the five panel zones, mapped 0 mint/1 fine/2 worn/3 poor/4
 * scrap - and any missing panel forces `scrap` outright, since an absent
 * panel has no severity to read. */
export function derivePanelsBand(zoneStates: ZoneStates): ConditionBand {
  if (PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId].panelMissing)) return 'scrap'
  const worst = Math.max(
    ...PANEL_ZONE_IDS.map((zoneId) =>
      Math.max(zoneStates[zoneId].metal, zoneStates[zoneId].surface),
    ),
  )
  return bandForSeverity(worst)
}

/** The colours a car's `factoryColour` pool entry authorises: the entry
 * itself for a single-colour car, or both halves of an `a+b` two-tone entry.
 * Shared by the paint stage's stock-grade gate and the paint band's mismatch
 * exemption, so a two-tone car's legitimate scheme is defined in exactly one
 * place. */
function factoryColourSet(factoryColour: string): ReadonlySet<string> {
  return new Set(factoryColour.split('+'))
}

/** `paint` band is the worst finish across the five panel zones, same
 * mapping, stepped one band worse when two or more painted zones disagree on
 * colour (the mismatch penalty) - an unpainted zone (`colour` absent) never
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

export function deriveBodyBands(zoneStates: ZoneStates, factoryColour?: string): DerivedBodyBands {
  return {
    panels: derivePanelsBand(zoneStates),
    paint: derivePaintBand(zoneStates, factoryColour),
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
 * Rolls a fresh car's six zones (docs/design/systems/workshop-rework.md's generation
 * table): metal and finish roll independently per zone from the tier's own
 * weight tables (the chassis zone rolls metal on the next-kinder tier's row),
 * surface derives from metal with a chance of one extra step. No zone starts
 * with a colour (that is a paint-stage state, never rolled), and only the
 * grade-gated escalation below can start one with a missing panel. Seeded via
 * `rng`, the same stream the rest of generation threads.
 *
 * `severityOrder` ARRANGES the five panel zones' rolled severities without
 * changing them: the rolled states are dealt out worst-first along that order,
 * so the caller decides which zones carry the damage the tier tables already
 * decided the car has. Six independent per-zone rolls could not express a
 * collision at all, because `left` and `right` were unrelated and there was no
 * front or rear. It is a pure permutation, which is exactly what a damage
 * pattern is allowed to do: `panels`/`paint` derive from the WORST panel zone,
 * and a worst-of is invariant under permutation, so the derived bands, the
 * repair bill and every Law 2 check see an identical distribution. Only WHERE
 * moves. Defaults to the zones' own order, which is a no-op.
 *
 * `history` is the ONE thing that can take a panel past what hand work can
 * pull back, and it is not a permutation: the lead zone of `severityOrder` (the
 * panel the pattern implicates most, holding the worst severities the tier
 * tables rolled) escalates its metal to `BEYOND_REPAIR_METAL` when the car's
 * history is one of the two heaviest grades, that zone's metal already sits at
 * the weldable maximum, and `zoneBeyondRepairChance` lands. A second roll
 * against `zonePanelMissingChance` then decides whether the panel is absent
 * outright rather than ruined in place. Both rolls are drawn whenever a history
 * is supplied, applied only when the gates hold, so a car's draw sequence does
 * not depend on how it happened to roll. `history` absent means neither state
 * can occur, which is what a caller with no story behind the car wants;
 * `allowPanelMissing` false keeps the panel on the car (a customer's own car
 * never turns up with a panel gone), leaving only the ruined-in-place state.
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
  severityOrder: readonly PanelZoneId[] = PANEL_ZONE_IDS,
  history: DamageGrade | null = null,
  allowPanelMissing: boolean = true,
  factoryColour: string | null = null,
  culture: CarCulture | null = null,
): ZoneStates {
  const {
    metalWeightsByTier,
    finishWeightsByTier,
    chassisMetalWeightsByTier,
    surfaceExtraChance,
    zoneBeyondRepairChance,
    zonePanelMissingChance,
  } = economy.partsGeneration.zoneStates
  const rollZone = (metalWeights: readonly [number, number, number, number]): ZoneState => {
    const metal = rollSeverity(metalWeights, rng)
    const finish = rollSeverity(finishWeightsByTier[fitmentClass], rng)
    let surface = Math.max(0, metal - 1)
    if (rng.next() < surfaceExtraChance) surface = Math.min(2, surface + 1)
    return { metal, surface, finish, panelMissing: false, primed: false }
  }
  const zoneStates = {} as Record<ZoneId, ZoneState>
  // Rolled first, in the zones' own fixed order so the draw sequence is
  // unchanged, then dealt out worst-first along `severityOrder`.
  const rolled = PANEL_ZONE_IDS.map(() => rollZone(metalWeightsByTier[fitmentClass]))
  rolled.sort((a, b) => b.metal + b.surface + b.finish - (a.metal + a.surface + a.finish))
  severityOrder.forEach((zoneId, index) => {
    zoneStates[zoneId] = rolled[index]!
  })
  zoneStates.chassis = rollZone(chassisMetalWeightsByTier[fitmentClass])
  if (history !== null) {
    const beyondRepairRoll = rng.next()
    const panelMissingRoll = rng.next()
    const leadZoneId = severityOrder[0]!
    const lead = zoneStates[leadZoneId]!
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
 * five panel zones in their own declared order. Which physical panel takes
 * which half is deliberately not modelled (the research could not establish
 * the arrangement for most of the seven two-tone roster cars), so this is the
 * simplest deterministic split rather than an authored one: the first half of
 * `PANEL_ZONE_IDS` (by count, rounded up) wears the first colour, the rest the
 * second. */
function factoryReferenceColours(factoryColour: string): Record<PanelZoneId, string> {
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
 * `paintHistory`) and writes the result onto `zoneStates`' five panel zones.
 * The state is structural, never per-zone independent draws, which is what
 * makes a three-way clown-car mismatch impossible by construction rather than
 * merely unlikely:
 *
 * - `original`: every zone its own reference colour (`factoryReferenceColours`
 *   - both halves of a two-tone car's scheme, dealt across zones).
 * - `resprayed`: one colour, picked uniformly from the 34 excluding the car's
 *   own factory colour(s), on every zone alike.
 * - `mismatchedPanel`: every zone its own reference colour except one
 *   (uniform across the five), which wears a family neighbour of the colour
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
 * `carPartId` still has real MONEY headroom to improve further (a panel
 * needing replacement, or a money field still above 0). The Law 2 softening
 * pass (`enforceMaxBillFraction`) uses this to EXCLUDE an already-exhausted
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
  if (carPartId === 'panels' && PANEL_ZONE_IDS.some((zoneId) => zoneNeedsPanel(zoneStates[zoneId])))
    return true
  const { field } = moneyFieldFor(carPartId)
  if (carPartId === 'underbody') return zoneStates.chassis.finish > 0
  return PANEL_ZONE_IDS.some((zoneId) => zoneStates[zoneId][field] > 0)
}

/**
 * Sets a body-derived carrier's zone state to reach AT LEAST `targetBand` on
 * `panelZoneId` - a symptom's damage (`auctions.ts`'s `applySymptoms`), the one
 * other writer of these three parts' apparent severity besides generation and
 * the pipeline itself. Unlike the money-only degrade/improve helpers above, a
 * symptom is a real, hidden DEFECT (not a money-optimisation move), so it
 * legitimately moves METAL too - a "rust patch" or "panel respray" cause is
 * about the panel's physical state, not what the cheapest fix costs.
 *
 * The zone is the CALLER'S choice, drawn from the car's damage pattern
 * (docs/design/systems/generation-damage.md, layer 3). It used to be a fixed
 * `PANEL_ZONE_IDS[0]` to avoid an RNG draw, which put every rust patch and
 * every respray in the game on the bonnet; worst-governs means one zone
 * carrying the damage is enough to drive the whole carrier's derived band, so
 * WHICH zone was free to be arbitrary and is now free to be the one the car's
 * own story implicates. `underbody` ignores the argument: it reads the chassis
 * zone alone, so there is no choice to make.
 *
 * A no-op if the carrier is already at or worse than `targetBand` on that zone
 * (mirrors the "worse of current or cause" rule every other symptom cause
 * already follows).
 *
 * A symptom never takes a panel past saving, however bad its cause reads: the
 * target severity is clamped to `MAX_REPAIRABLE_METAL`, so the worst a hidden
 * defect can leave is a panel that still beats and welds back. Past that is
 * generation's own grade-gated roll (`rollZoneStates`), which is where the
 * story of a car being hit belongs. The clamp is also what keeps the chassis
 * zone repairable at all: it has no panel to fit, so it must never be written
 * to a severity only a panel can clear.
 */
export function setZoneCarrierToAtLeastBand(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  targetBand: ConditionBand,
  panelZoneId: PanelZoneId,
): ZoneStates {
  const targetSeverity = Math.min(MAX_REPAIRABLE_METAL, severityThresholdForBand(targetBand))
  if (carPartId === 'underbody') {
    const chassis = zoneStates.chassis
    if (Math.max(chassis.metal, chassis.finish) >= targetSeverity) return zoneStates
    return {
      ...zoneStates,
      chassis: { ...chassis, finish: Math.max(chassis.finish, targetSeverity) },
    }
  }
  const zoneId = panelZoneId
  const zone = zoneStates[zoneId]
  if (carPartId === 'panels') {
    if (Math.max(zone.metal, zone.surface) >= targetSeverity) return zoneStates
    return { ...zoneStates, [zoneId]: { ...zone, metal: Math.max(zone.metal, targetSeverity) } }
  }
  if (zone.finish >= targetSeverity) return zoneStates
  return { ...zoneStates, [zoneId]: { ...zone, finish: targetSeverity } }
}

/**
 * Worsens one panel zone that still has headroom before hitting `carPartId`'s
 * money-relevant field cap (`underbody` reads the chassis zone alone) - the
 * generation damage budget's zone-aware degrade move (`spendDamageBudget`,
 * auctions.ts).
 *
 * WHICH zone is the caller's to choose, through `chooseZone`, because that is
 * the whole of how a collision becomes expressible: the budget hands it the
 * car's own damage pattern and a shunted car spends its bodywork on the bonnet
 * and the wings rather than evenly around the shell. Absent, it falls back to
 * the zone with the least headroom left, which deepens one zone before starting
 * another and is the right default for a caller with no story to tell.
 *
 * A no-op once every relevant zone is already capped: `panels` never reaches
 * `scrap` this way - that needs a panel gone or ruined past saving, two
 * separate and more drastic states this helper never touches, matching
 * `degradeBand`'s own never-forced-to-scrap contract.
 */
export function degradeZoneCarrierOneStep(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  chooseZone?: (candidates: readonly PanelZoneId[]) => PanelZoneId,
): ZoneStates {
  const { field, cap } = moneyFieldFor(carPartId)
  if (carPartId === 'underbody') {
    const chassis = zoneStates.chassis
    if (chassis.finish >= cap) return zoneStates
    return { ...zoneStates, chassis: { ...chassis, finish: chassis.finish + 1 } }
  }
  const withHeadroom = PANEL_ZONE_IDS.filter((zoneId) => zoneStates[zoneId][field] < cap)
  if (withHeadroom.length === 0) return zoneStates
  const targetId = chooseZone
    ? chooseZone(withHeadroom)
    : withHeadroom.reduce((worst, zoneId) =>
        zoneStates[zoneId][field] > zoneStates[worst][field] ? zoneId : worst,
      )
  const zone = zoneStates[targetId]
  return { ...zoneStates, [targetId]: { ...zone, [field]: zone[field] + 1 } }
}

/**
 * Improves whichever panel zone currently carries the MOST of `carPartId`'s
 * money-relevant field - the Law 2 generation-softening pass's zone-aware
 * move (`enforceMaxBillFraction`, auctions.ts). For `panels`, a zone needing a
 * panel is put back on the repairable ladder FIRST (the two scrap-forcing
 * states, and the only path a `panels` bill can carry a real panel-purchase
 * cost), before any field improves, mirroring the general pass improving the
 * single worst part one step at a time. Absent and ruined-past-saving clear
 * together in that one step because they are one fact to the bill: exactly one
 * panel price, charged once, gone once.
 */
export function improveZoneCarrierOneStep(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
): ZoneStates {
  if (carPartId === 'panels') {
    const needsPanelId = PANEL_ZONE_IDS.find((zoneId) => zoneNeedsPanel(zoneStates[zoneId]))
    if (needsPanelId) {
      const zone = zoneStates[needsPanelId]
      return {
        ...zoneStates,
        [needsPanelId]: {
          ...zone,
          metal: Math.min(zone.metal, MAX_REPAIRABLE_METAL),
          panelMissing: false,
        },
      }
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
const PAINT_METALLIC_COST_YEN = materialCostYen('paint-metallic')
const PAINT_PEARL_COST_YEN = materialCostYen('paint-pearl')
const UNDERSEAL_COST_YEN = materialCostYen('underseal')
const POLISH_COST_YEN = materialCostYen('polish')

/** The tin a panel paint job charges, by finish grade - stock and street both
 * lay a solid colour and share one tin; sport (metallic) and race (pearl)
 * each have their own. Irrelevant to the chassis zone, which always charges
 * underseal regardless of grade. */
const PAINT_TIN_COST_YEN_BY_GRADE: Readonly<Record<Grade, number>> = {
  stock: PAINT_COST_YEN,
  street: PAINT_COST_YEN,
  sport: PAINT_METALLIC_COST_YEN,
  race: PAINT_PEARL_COST_YEN,
}

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
  reason: 'prereq' | 'machine-line' | 'needs-panel' | 'wrong-colour'
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
 *
 * A zone with no panel on it refuses every stage: there is nothing there to
 * strip, beat, fill or polish. A zone whose metal is past saving refuses only
 * the two metal stages, since the paint on a ruined wing is still real paint
 * and still polishes; the filler and paint chain below is already shut by its
 * own `metal !== 0` prerequisite. Both refuse with `needs-panel`, which names
 * the remedy rather than the obstacle, because that is what the player has to
 * be told.
 */
export function planPipelineStage(
  stage: Exclude<PipelineStageId, 'swapPanel' | 'paint'>,
  zone: ZoneState,
  capability: BodyLineCapability,
): PipelineStageEffect | PipelineStageRefusal {
  if (zone.panelMissing) return { ok: false, reason: 'needs-panel' }
  switch (stage) {
    case 'stripPrep':
      return {
        ok: true,
        zone: { ...zone, finish: BARE_FINISH, primed: false },
        laborUnits: 1,
        materialsCostYen: 0,
      }
    case 'beat':
      if (zone.metal > MAX_REPAIRABLE_METAL) return { ok: false, reason: 'needs-panel' }
      if (zone.metal < 1 || zone.metal > 2) return { ok: false, reason: 'prereq' }
      return {
        ok: true,
        zone: { ...zone, metal: zone.metal - 1 },
        laborUnits: 1,
        materialsCostYen: 0,
      }
    case 'weld':
      if (zone.metal > MAX_REPAIRABLE_METAL) return { ok: false, reason: 'needs-panel' }
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
      if (zone.finish >= BARE_FINISH) return { ok: false, reason: 'prereq' } // bare - nothing to polish
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
 * paint chain again regardless of what it looked like before. This is the only
 * route out of a panel that is gone or past saving, and it clears both
 * outright. It reads the fitted panel honestly rather than clamping it: fitting
 * a `scrap` panel harvested off another shell leaves the zone exactly as
 * beyond saving as the panel is. Never chased (`panelZone: PanelZoneId`, so
 * chassis is excluded at the type level by every caller). Labour is the fitting
 * (bolt-on) class, priced by the caller, not a band-step unit - `laborUnits` is
 * 0 here by convention. */
export function planSwapPanel(zone: ZoneState, panelBand: ConditionBand): PipelineStageEffect {
  return {
    ok: true,
    zone: {
      metal: severityThresholdForBand(panelBand),
      surface: 0,
      finish: BARE_FINISH,
      panelMissing: false,
      primed: false,
    },
    laborUnits: 0,
    materialsCostYen: 0,
  }
}

/**
 * The zones each body value carrier's own physical parts occupy: the five
 * panel zones for `panels`, the chassis zone for `underbody`. `paint` names
 * none of its own - it is a finish the pipeline lays on rather than a part
 * that arrives - so changing what is fitted there moves no zone.
 */
const CARRIER_ZONE_IDS: Readonly<Record<DerivedBodyPartId, readonly ZoneId[]>> = {
  panels: PANEL_ZONE_IDS,
  paint: [],
  underbody: ['chassis'],
}

/**
 * Every zone `carPartId` covers, as `planSwapPanel` leaves it once a fresh
 * part at `band` is on the car: metal at the fitted part's own band, a sound
 * surface and a bare, unpainted finish. Fitting a body kit is the same
 * physical event as swapping one panel, so it takes the same route rather
 * than a second one of its own, and a re-panelled car owes its paint exactly
 * as a re-panelled zone does.
 *
 * Identity and condition stay orthogonal either side of this: the fitted SKU
 * says what the car IS, and the band `applyDerivedBodyBands` writes afterwards
 * still comes from the zones alone, so a dented widebody is a widebody that is
 * dented.
 */
export function refitCarrierZoneStates(
  zoneStates: ZoneStates,
  carPartId: DerivedBodyPartId,
  band: ConditionBand,
): ZoneStates {
  let next = zoneStates
  for (const zoneId of CARRIER_ZONE_IDS[carPartId]) {
    next = { ...next, [zoneId]: planSwapPanel(next[zoneId], band).zone }
  }
  return next
}

/** Paint's effect: needs the zone primed; the achieved finish is 1 with the
 * body line unlocked (owned tier 2, or hired today), else 2 - tier 1 hand
 * tools and rattle cans cap at tidy. Chassis colours as the underseal shade
 * rather than a chosen hue; the material differs (underseal, not paint tin)
 * but the effect shape is identical, and it charges underseal regardless of
 * `grade` - the finish ladder is a `paint` carrier concept, and the chassis
 * has none. A zone with no panel on it has nothing to paint and says so.
 *
 * `grade` sets which tin the job charges (`PAINT_TIN_COST_YEN_BY_GRADE`) and
 * is the one gate that makes "respray it back and it is original again"
 * work: a `stock`-grade job is refused everywhere but the car's own factory
 * colour (`factoryColourSet`, so a two-tone car may lay either of its two
 * factory halves) - `stagedWork.ts` reads that refusal to keep a player from
 * laying a stock-grade job in a colour the car never wore. Street, sport and
 * race lay any colour, since choosing to respray already spends the car's
 * authenticity. */
export function planPaintStage(
  zone: ZoneState,
  zoneId: ZoneId,
  colour: string,
  capability: BodyLineCapability,
  grade: Grade,
  factoryColour: string,
): PipelineStageEffect | PipelineStageRefusal {
  if (zone.panelMissing) return { ok: false, reason: 'needs-panel' }
  if (!zone.primed) return { ok: false, reason: 'prereq' }
  if (zoneId !== 'chassis' && grade === 'stock' && !factoryColourSet(factoryColour).has(colour)) {
    return { ok: false, reason: 'wrong-colour' }
  }
  const finish = capability.unlocked ? 1 : 2
  return {
    ok: true,
    zone: { ...zone, finish, primed: false, colour },
    laborUnits: 1,
    materialsCostYen:
      zoneId === 'chassis' ? UNDERSEAL_COST_YEN : PAINT_TIN_COST_YEN_BY_GRADE[grade],
  }
}

/** The capability a BILL prices at: the whole body line. A bill is the work a
 * car needs, never what today's shop can finish, which is the contract every
 * other whole-car bill function in the sim already keeps. */
const BILL_CAPABILITY: BodyLineCapability = { unlocked: true, fullCapability: true }

/**
 * One zone's route through the pipeline: the state the stages leave behind,
 * and their materials money split by the carrier that owns each stage. Filler
 * and a fresh panel are the `panels` carrier's; primer, the tin (paint on a
 * panel, underseal on the chassis) and polish belong to the finish carrier -
 * `paint` on a panel zone, `underbody` on the chassis, which owns its filler
 * too since no other carrier reads that zone.
 */
interface ZoneRepairRoute {
  zone: ZoneState
  /** True when the only way in was a fresh panel. Its price is the caller's
   * to add: a panel is bought from the catalogue rather than out of a stage's
   * materials, so `planSwapPanel` charges nothing for it. */
  panelFitted: boolean
  fillerYen: number
  finishYen: number
}

/** Metal down to what `targetSeverity` allows, through the stages that
 * actually do it: `beat` walks one rung at a time and `weld` clears the lot.
 * Both cost labour and never yen, so this moves the zone and never the money. */
function straightenMetal(zone: ZoneState, targetSeverity: number): ZoneState {
  let current = zone
  while (current.metal > targetSeverity) {
    const beat = planPipelineStage('beat', current, BILL_CAPABILITY)
    if (beat.ok) {
      current = beat.zone
      continue
    }
    const weld = planPipelineStage('weld', current, BILL_CAPABILITY)
    if (!weld.ok) break
    current = weld.zone
  }
  return current
}

/**
 * The stages the pipeline would run to bring one zone to `targetSeverity`, and
 * what their materials cost. It DRIVES `planSwapPanel`, `planPipelineStage`
 * and `planPaintStage` rather than restating their prices, so a quote and the
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
 * `surfaceIsTargeted` is true on a panel zone, whose band reads the surface
 * (`derivePanelsBand`), and false on the chassis, whose band reads metal and
 * finish alone (`deriveUnderbodyBand`) - there, filler is levelled only where
 * the primer stage forces it.
 */
function planZoneRepair(
  zone: ZoneState,
  zoneId: ZoneId,
  targetSeverity: number,
  surfaceIsTargeted: boolean,
): ZoneRepairRoute {
  let current = zone
  let panelFitted = false
  let fillerYen = 0
  let finishYen = 0
  // A `scrap` target is the worst any axis can express, so nothing is owed.
  if (targetSeverity >= BEYOND_REPAIR_METAL) {
    return { zone: current, panelFitted, fillerYen, finishYen }
  }

  if (zoneNeedsPanel(current)) {
    current = planSwapPanel(current, 'mint').zone
    panelFitted = true
  }

  const needsRepaint = current.finish > targetSeverity && current.finish >= BARE_FINISH
  const surfaceAboveTarget = surfaceIsTargeted && current.surface > targetSeverity
  if (current.surface > 0 && (needsRepaint || surfaceAboveTarget)) {
    current = straightenMetal(current, 0)
    const fill = planPipelineStage('fillAndSand', current, BILL_CAPABILITY)
    if (fill.ok) {
      current = fill.zone
      fillerYen += fill.materialsCostYen
    }
  }

  if (needsRepaint) {
    const prime = planPipelineStage('prime', current, BILL_CAPABILITY)
    if (prime.ok) {
      current = prime.zone
      finishYen += prime.materialsCostYen
    }
    // A bill prices the tin and never the shade, so the zone is put back in
    // whatever colour it already wore: a projected respray must not invent the
    // colour disagreement `derivePaintBand` penalises. The shade handed to the
    // stage never survives it. Grade `street` here is a plain solid tin, same
    // price as `stock` (`PAINT_TIN_COST_YEN_BY_GRADE`) and never refused on
    // colour, so a bill never has to know what grade is actually fitted.
    const paint = planPaintStage(
      current,
      zoneId,
      current.colour ?? '',
      BILL_CAPABILITY,
      'street',
      '',
    )
    if (paint.ok) {
      current = { ...paint.zone, colour: current.colour }
      finishYen += paint.materialsCostYen
    }
  }

  while (current.finish > targetSeverity) {
    const polish = planPipelineStage('polish', current, BILL_CAPABILITY)
    if (!polish.ok) break
    current = polish.zone
    finishYen += polish.materialsCostYen
  }

  return { zone: straightenMetal(current, targetSeverity), panelFitted, fillerYen, finishYen }
}

/** Whether `zoneId`'s surface is something a target band actually asks about:
 * `derivePanelsBand` reads it on the five panel zones, `deriveUnderbodyBand`
 * does not read it on the chassis. */
function surfaceIsTargetedOn(zoneId: ZoneId): boolean {
  return zoneId !== 'chassis'
}

/**
 * `panels`' money-only repair bill: the filler each panel zone's own route
 * calls for, plus a fresh zone panel for any zone that needs one
 * (`zoneNeedsPanel`). Repairable metal is always free to climb (beat and weld
 * are labour, never yen), so it costs money only where it has gone past
 * saving and a panel is the way out. Both panel-forcing states quote the same
 * one price and quote it once: a panel that is gone and a panel ruined past
 * welding cost the same to put right, and the fresh panel arrives with its own
 * sound surface, so neither also pays for filler.
 */
export function panelsRepairBillYen(
  zoneStates: ZoneStates,
  targetBand: ConditionBand,
  fitmentClass: PartFitmentClass,
  partsById: Readonly<Record<string, Part>>,
): number {
  const targetSeverity = severityThresholdForBand(targetBand)
  let total = 0
  for (const zoneId of PANEL_ZONE_IDS) {
    const route = planZoneRepair(zoneStates[zoneId], zoneId, targetSeverity, true)
    total += route.fillerYen
    if (route.panelFitted) total += zonePanelPart(partsById, zoneId, fitmentClass)?.priceYen ?? 0
  }
  return total
}

/** `paint`'s money-only repair bill: the primer, paint and polish each panel
 * zone's own route calls for. A zone getting a fresh panel is quoted the full
 * repaint the bare replacement needs, since that is the finish it arrives in. */
export function paintRepairBillYen(zoneStates: ZoneStates, targetBand: ConditionBand): number {
  const targetSeverity = severityThresholdForBand(targetBand)
  let total = 0
  for (const zoneId of PANEL_ZONE_IDS) {
    total += planZoneRepair(zoneStates[zoneId], zoneId, targetSeverity, true).finishYen
  }
  return total
}

/** `underbody`'s money-only repair bill: the chassis zone's own route, primer,
 * underseal and polish - plus its filler, which no other carrier reads that
 * zone to charge for, and which the primer stage forces whenever the chassis
 * needs resealing over a rough surface. */
export function underbodyRepairBillYen(zoneStates: ZoneStates, targetBand: ConditionBand): number {
  const route = planZoneRepair(
    zoneStates.chassis,
    'chassis',
    severityThresholdForBand(targetBand),
    surfaceIsTargetedOn('chassis'),
  )
  return route.fillerYen + route.finishYen
}

/**
 * Every zone as the repair route above leaves it at `band` - the state side of
 * the same walk the three bills price, so the money and the car always
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
    repaired[zoneId] = planZoneRepair(
      zoneStates[zoneId],
      zoneId,
      targetSeverity,
      surfaceIsTargetedOn(zoneId),
    ).zone
  }
  return repaired as ZoneStates
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
