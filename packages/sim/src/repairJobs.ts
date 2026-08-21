import {
  WORKBENCH,
  type BenchId,
  type CarInstance,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ComponentId,
  type ConditionBand,
  type DayLogEntry,
  type EconomyConfig,
  type GameState,
  type Job,
  type Part,
  type PartInstance,
  type PartRecipes,
  type RecipeStep,
  type RepairJobKind,
  type SessionEventInput,
  type ToolLevels,
  type WorkbenchContent,
} from '@midnight-garage/content'
import { bandIndex, canRepair, costToBandYen } from './bands'
import { isBodyDerivedPart } from './bodyPipeline'
import { updateCarLedger } from './carLedger'
import type { SimContext } from './context'
import { crewEnergySaved, perfectionistCostMultiplier } from './crewSkills'
import { pruneCuredCauses, verifyAndResolve } from './diagnosis'
import { bookCashMovements } from './financeLedger'
import {
  chargeRepairWork,
  findWorkableCar,
  machineGateGroupFor,
  machineHiredToday,
  machineLaborMultiplier,
  refitLaborSlotsFor,
  removeLaborSlotsFor,
  writeCarBack,
} from './jobs'
import { isSlotVerified, knowledgeViewOf, priorBand } from './knowledge'
import { reputationAtLeast } from './reputation'
import { updateServiceJobLedger } from './serviceJobLedger'
import { ownsToolShopForGroup, toolLevelsFor } from './toolLines'

/**
 * The repair job engine: three job kinds (Service, Rebuild, Restore), each an
 * ordered recipe of tool-named steps a player ticks one at a time. A step is
 * the unit of work - it costs energy, it either runs or it does not, and the
 * part's band moves only when the last step of the recipe ticks.
 *
 * Everything economic here is borrowed rather than restated: `costToBandYen`
 * prices the parts bill, `chargeRepairWork` takes the money, `toolLevelsFor`
 * and `machineHiredToday` answer access, `crewEnergySaved` and
 * `perfectionistCostMultiplier` apply the crew, and `pruneCuredCauses` plus
 * `verifyAndResolve` run on a band write exactly as they do for on-car repair.
 * Step progress persists in `state.jobs` under the shared `JobSchema`, with
 * `laborSlotsRequired` holding the recipe's step count and `laborSlotsSpent`
 * the steps done.
 */

/** What a repair job addresses: a part fitted to a car, or a loose part in the
 * warehouse. Bench membership is a separate question (`benchHoldingPart`) - a
 * loose part is loose whether or not it is on a bench. */
export type RepairTarget =
  | { kind: 'installed'; carInstanceId: string; carPartId: CarPartId }
  | { kind: 'loose'; partInstanceId: string }

/** The three kinds in the order every card list and every ladder reads them. */
export const REPAIR_JOB_KINDS: readonly RepairJobKind[] = ['service', 'rebuild', 'restore']

/**
 * The group a bench answers to when a step BORROWS that bench's tool. A bench
 * is shared by two groups, so a borrowed tool needs one of them named: the
 * exhaust's Rebuild reaches across for the body corner's MIG welder, and that
 * step therefore asks the BODY line for its tier, not the engine line the
 * exhaust itself sits on. Only ever consulted for a step carrying an explicit
 * `bench` override; a step working its part's own bench uses the part's own
 * group.
 */
export const BENCH_PRIMARY_GROUP: Readonly<Record<BenchId, ComponentId>> = {
  'engine-bench': 'engine',
  'chassis-bench': 'drivetrain',
  'body-trim-bench': 'body',
}

/** Where a tool sits on a bench's shadow board: an always-owned tier 1 tool, a
 * tier 2 machine, or a tool that only arrives with the covering shop. */
export type ToolTierOnBench = 1 | 2 | 'shop'

/** Whether a step can be worked right now, and at what price: `owned` at base
 * energy, `hired` at base energy on today's hire, `slog` at the slog
 * multiplier by hand, `locked` not at all. */
export type StepAvailability = 'owned' | 'hired' | 'slog' | 'locked'

/** One tool found on a bench, with the tier of the zone shelf holding it. */
interface BenchToolLocation {
  tier: ToolTierOnBench
  displayName: string
}

/** Walks a bench's five zones for `tool`. Tool ids are unique within a bench
 * (the content test holds that), so the first hit is the only hit. */
function findBenchTool(
  workbench: WorkbenchContent,
  bench: BenchId,
  tool: string,
): BenchToolLocation | null {
  const found = workbench.benches.find((candidate) => candidate.id === bench)
  if (!found) return null
  for (const zone of Object.values(found.zones)) {
    if (!zone) continue
    const tier1 = zone.tier1.find((entry) => entry.id === tool)
    if (tier1) return { tier: 1, displayName: tier1.displayName }
    const tier2 = zone.tier2.find((entry) => entry.id === tool)
    if (tier2) return { tier: 2, displayName: tier2.displayName }
    const shop = zone.shop.find((entry) => entry.id === tool)
    if (shop) return { tier: 'shop', displayName: shop.displayName }
  }
  return null
}

/**
 * Which shelf `tool` sits on at `bench`. Throws for a tool the bench does not
 * carry: the content test asserts every recipe step's tool resolves on its own
 * resolved bench, so this is a content-integrity failure rather than a game
 * state the player can reach.
 */
export function toolTierOnBench(
  workbench: WorkbenchContent,
  bench: BenchId,
  tool: string,
): ToolTierOnBench {
  const location = findBenchTool(workbench, bench, tool)
  if (!location) throw new Error(`no tool "${tool}" on bench "${bench}"`)
  return location.tier
}

/** The bench a step is worked at: its own `bench` override, else the bench the
 * part's group resolves to. */
export function stepBenchFor(step: RecipeStep, partGroup: ComponentId): BenchId {
  return step.bench ?? WORKBENCH.benchByGroup[partGroup]
}

/** The tool LINE a step's tool asks for its tier - the borrowed bench's own
 * primary group for an override step, the part's group otherwise. */
export function stepGroupFor(step: RecipeStep, partGroup: ComponentId): ComponentId {
  return step.bench ? BENCH_PRIMARY_GROUP[step.bench] : partGroup
}

function availabilityFor(
  levels: ToolLevels,
  state: GameState,
  step: RecipeStep,
  group: ComponentId,
  tier: ToolTierOnBench,
): StepAvailability {
  if (tier === 1) return 'owned'
  if (tier === 'shop') return levels[group] >= 3 ? 'owned' : 'locked'
  if (levels[group] >= 2) return 'owned'
  // A day's hire grants the whole of that group's tier 2 kit, not one machine.
  if (machineHiredToday(group, state)) return 'hired'
  return step.requiresMachine ? 'locked' : 'slog'
}

/**
 * The one access rule, shared by the cards and by execution. A tier 1 tool is
 * always to hand. A tier 2 tool is owned outright at line level 2, otherwise
 * covered by today's hire on its group, otherwise slogged by hand - unless the
 * step is welding or machining (`requiresMachine`), which can never be slogged.
 * A shop tool needs the covering shop, which is line level 3.
 */
export function stepAvailability(
  state: GameState,
  context: SimContext,
  step: RecipeStep,
  partGroup: ComponentId,
): StepAvailability {
  const group = stepGroupFor(step, partGroup)
  const tier = toolTierOnBench(WORKBENCH, stepBenchFor(step, partGroup), step.tool)
  return availabilityFor(toolLevelsFor(state, context), state, step, group, tier)
}

/** One recipe step with everything the cards and the resolver ask of it. */
interface ResolvedStep {
  index: number
  step: RecipeStep
  bench: BenchId
  group: ComponentId
  tier: ToolTierOnBench
  availability: StepAvailability
  toolLabel: string
}

function resolveSteps(
  state: GameState,
  context: SimContext,
  steps: readonly RecipeStep[],
  partGroup: ComponentId,
): ResolvedStep[] {
  const levels = toolLevelsFor(state, context)
  return steps.map((step, index) => {
    const bench = stepBenchFor(step, partGroup)
    const group = stepGroupFor(step, partGroup)
    const location = findBenchTool(WORKBENCH, bench, step.tool)
    if (!location) throw new Error(`no tool "${step.tool}" on bench "${bench}"`)
    return {
      index,
      step,
      bench,
      group,
      tier: location.tier,
      availability: availabilityFor(levels, state, step, group, location.tier),
      toolLabel: location.displayName,
    }
  })
}

// --- target resolution ----------------------------------------------------

/** Everything a repair job needs to know about what it is working on, resolved
 * once from the target and shared by every read and the resolver. */
interface RepairSubject {
  carPartId: CarPartId
  entry: CarPartTaxonomyEntry
  group: ComponentId
  band: ConditionBand
  catalogPart: Part
  recipes: PartRecipes
  /** The car the part is fitted to - absent for a loose target. */
  car?: CarInstance
  /** The loose instance in `partInventory` - absent for an installed target. */
  instance?: PartInstance
}

/** The subject behind `target`, or null when there is nothing to work on: no
 * car, an empty slot, a part that is not in the warehouse, an unresolvable
 * catalogue entry, or a part with no recipe ladder at all. */
function resolveSubject(
  state: GameState,
  target: RepairTarget,
  context: SimContext,
): RepairSubject | null {
  if (target.kind === 'installed') {
    const car = findWorkableCar(state, target.carInstanceId)
    const installed = car?.parts[target.carPartId]?.installed
    if (!car || !installed) return null
    const catalogPart = context.partsById[installed.partId]
    const entry = context.partsTaxonomyById[target.carPartId]
    const recipes = WORKBENCH.recipes[target.carPartId]
    if (!catalogPart || !entry || !recipes) return null
    return {
      carPartId: target.carPartId,
      entry,
      group: entry.group,
      band: installed.band,
      catalogPart,
      recipes,
      car,
    }
  }
  // A benched part never leaves `partInventory` - the bench is a location, not
  // a second inventory - so one lookup answers both.
  const instance = state.partInventory.find((part) => part.id === target.partInstanceId)
  const catalogPart = instance ? context.partsById[instance.partId] : undefined
  if (!instance || !catalogPart) return null
  const entry = context.partsTaxonomyById[catalogPart.carPartId]
  const recipes = WORKBENCH.recipes[catalogPart.carPartId]
  if (!entry || !recipes) return null
  return {
    carPartId: catalogPart.carPartId,
    entry,
    group: entry.group,
    band: instance.band,
    catalogPart,
    recipes,
    instance,
  }
}

/**
 * An open repair job's stable id. The KIND is inside the id, so a Service and a
 * Rebuild on the same part are two separate jobs that each keep their own
 * ticked steps, and resuming one can never deliver the band the other's button
 * promised.
 */
export function repairJobIdFor(
  target: RepairTarget,
  kind: RepairJobKind,
  context: SimContext,
): string {
  if (target.kind === 'loose') return `job-part-${target.partInstanceId}-${kind}`
  const group = context.partsTaxonomyById[target.carPartId]?.group
  return `job-${target.carInstanceId}-${kind}-${group}-${target.carPartId}`
}

// --- benches --------------------------------------------------------------

/** The bench a group's parts are worked on. */
export function benchForGroup(group: ComponentId): BenchId {
  return WORKBENCH.benchByGroup[group]
}

/** The part instance ids currently laid out on `bench`. */
export function benchPartIds(state: GameState, bench: BenchId): readonly string[] {
  return state.benchParts[bench] ?? []
}

/** Which bench holds `partInstanceId`, or null when it is not on one. */
export function benchHoldingPart(state: GameState, partInstanceId: string): BenchId | null {
  for (const bench of Object.keys(BENCH_PRIMARY_GROUP) as BenchId[]) {
    if (benchPartIds(state, bench).includes(partInstanceId)) return bench
  }
  return null
}

/**
 * Lay a loose part out on its group's bench. Refuses as a silent no-op - the
 * same shape `resolveRemovePart` uses - when the part is not in the warehouse,
 * is already on a bench, or is currently occupying the workbench or the machine
 * station. The part stays in `partInventory` either way: a bench is where a
 * part is, never a place it is kept instead.
 */
export function resolvePlaceOnBench(
  state: GameState,
  partInstanceId: string,
  context: SimContext,
): GameState {
  const instance = state.partInventory.find((part) => part.id === partInstanceId)
  if (!instance) return state
  if (benchHoldingPart(state, partInstanceId)) return state
  if (state.workbenchPartId === partInstanceId || state.machinePartId === partInstanceId) {
    return state
  }
  const catalogPart = context.partsById[instance.partId]
  const group = catalogPart ? context.partsTaxonomyById[catalogPart.carPartId]?.group : undefined
  if (!group) return state
  const bench = benchForGroup(group)
  return {
    ...state,
    benchParts: { ...state.benchParts, [bench]: [...benchPartIds(state, bench), partInstanceId] },
  }
}

/**
 * Take a part off whichever bench holds it. An unfinished job on that part
 * stays open in `state.jobs` with its ticked steps intact, so the part can come
 * back to the bench later and carry on where it left off.
 */
export function resolveTakeOffBench(state: GameState, partInstanceId: string): GameState {
  const bench = benchHoldingPart(state, partInstanceId)
  if (!bench) return state
  return {
    ...state,
    benchParts: {
      ...state.benchParts,
      [bench]: benchPartIds(state, bench).filter((id) => id !== partInstanceId),
    },
  }
}

/** Whether the two-post lift is usable today - owned outright, or hired for the
 * day, on the same day-stamp shape the dyno and the tool lines use. */
export function liftAvailable(state: GameState): boolean {
  return state.lift.owned || state.lift.hirePaidDay === state.day
}

// --- buying and hiring the lift --------------------------------------------

/** Why buying the lift is refused right now, or `null` when nothing refuses
 * it - the same three gates a dyno purchase has, checked in the same order:
 * already owned, reputation, cash. */
export type BuyLiftGateReason = 'already-owned' | 'reputation' | 'no-cash'

export function buyLiftGateReason(state: GameState, context: SimContext): BuyLiftGateReason | null {
  if (state.lift.owned) return 'already-owned'
  const { purchasePriceYen, minReputationTier } = context.economy.lift
  if (!reputationAtLeast(state.reputationTier, minReputationTier)) return 'reputation'
  return state.cashYen < purchasePriceYen ? 'no-cash' : null
}

export interface BuyLiftResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * Buys the shop its own two-post lift outright - shop investment, exactly as
 * `resolveBuyDyno`'s purchase is, and every gate refuses as the same silent
 * no-op. The lift carries no `ComponentId` of its own, so the purchase books
 * through the day log's general `equipment-purchased` entry (named `'lift'`)
 * rather than a per-group entry. Owning it ends the hire fee for good: every
 * later under-car job reads the discount without a day's rent behind it.
 */
export function resolveBuyLift(state: GameState, context: SimContext): BuyLiftResult {
  if (buyLiftGateReason(state, context) !== null) return { state, log: [], applied: false }
  const priceYen = context.economy.lift.purchasePriceYen
  const log: DayLogEntry[] = [{ type: 'equipment-purchased', equipmentId: 'lift', priceYen }]
  const bought: GameState = {
    ...state,
    cashYen: state.cashYen - priceYen,
    lift: { ...state.lift, owned: true },
  }
  return { state: bookCashMovements(bought, log, context.economy), log, applied: true }
}

/** Why hiring the lift in for today is blocked right now. Owning it, or a day
 * already paid for, is never blocked; the only real reason is short cash. */
export type HireLiftGateReason = 'no-cash'

export function hireLiftGateReason(
  state: GameState,
  context: SimContext,
): HireLiftGateReason | null {
  if (liftAvailable(state)) return null
  return state.cashYen < context.economy.lift.hireFeeYen ? 'no-cash' : null
}

export interface HireLiftResult {
  state: GameState
  log: DayLogEntry[]
  outcome: 'hired' | HireLiftGateReason
}

/**
 * Charges the day's hire the first time the lift is needed: owning it, or a
 * day already paid for, is a silent no-op success, mirroring
 * `resolveHireDyno`. Unlike a tool line's hire this never touches
 * `toolHire.maxHiredLinesPerDay` - the lift is bay equipment, not a line on
 * the shadow board, so it never competes with a hired tool line for the
 * day's one hire slot. The fee is a running cost, posted to the day report
 * and booked to the week the way rent, a machine line's hire and a dyno's
 * hire are, and never to the ledger of a car that happened to go up on it.
 */
export function resolveHireLift(state: GameState, context: SimContext): HireLiftResult {
  if (liftAvailable(state)) return { state, log: [], outcome: 'hired' }
  const gateReason = hireLiftGateReason(state, context)
  if (gateReason) return { state, log: [], outcome: gateReason }
  const priceYen = context.economy.lift.hireFeeYen
  const log: DayLogEntry[] = [{ type: 'lift-hired', priceYen }]
  const hired: GameState = {
    ...state,
    cashYen: state.cashYen - priceYen,
    lift: { ...state.lift, hirePaidDay: state.day },
  }
  return { state: bookCashMovements(hired, log, context.economy), log, outcome: 'hired' }
}

// --- offer rules ----------------------------------------------------------

/** Why a job kind is not on offer for this target right now. */
export type RepairJobCardRefusal =
  'at-or-above-target' | 'needs-bench' | 'needs-shop' | 'not-repairable'

/** The band a completed job of `kind` leaves the part at. */
export function targetBandFor(kind: RepairJobKind, context: SimContext): ConditionBand {
  return context.economy.repairJobs[kind].target
}

/**
 * Whether a Rebuild or Restore can be worked where the part currently sits. A
 * removable part comes off and goes to its group's bench; a fixed-surface part
 * (`removable: false`) has no bench and is always worked on the car. Service is
 * looser: it runs in situ on the car, or on the bench for a part already off.
 */
function locationRefused(
  state: GameState,
  target: RepairTarget,
  kind: RepairJobKind,
  subject: RepairSubject,
): boolean {
  const onOwnBench =
    target.kind === 'loose' &&
    benchPartIds(state, benchForGroup(subject.group)).includes(target.partInstanceId)
  if (kind === 'service') return target.kind === 'loose' && !onOwnBench
  if (!subject.entry.removable) return target.kind !== 'installed'
  return target.kind !== 'loose' || !onOwnBench
}

/** Why `kind` is refused for this subject, or null when it is on offer. */
function cardRefusalFor(
  state: GameState,
  context: SimContext,
  target: RepairTarget,
  kind: RepairJobKind,
  subject: RepairSubject,
): RepairJobCardRefusal | null {
  // Scrap is terminal and a consumable is replaced rather than repaired
  // (`canRepair`); the two body value carriers derive their band from zone
  // state and carry no recipe ladder at all.
  if (!canRepair(subject.band, subject.entry)) return 'not-repairable'
  if (isBodyDerivedPart(subject.carPartId)) return 'not-repairable'
  if (bandIndex(subject.band) >= bandIndex(targetBandFor(kind, context))) {
    return 'at-or-above-target'
  }
  if (locationRefused(state, target, kind, subject)) return 'needs-bench'
  // Restore is shop work whatever its recipe happens to name: without the shop
  // covering the part's own line there is no Restore, at any tool tier.
  if (kind === 'restore' && !ownsToolShopForGroup(state, subject.group, context)) {
    return 'needs-shop'
  }
  return null
}

// --- energy ---------------------------------------------------------------

/**
 * What each step of this job costs in energy points right now, in step order.
 * Computed live from current state on every call, never stored: hiring a line,
 * benching a crew member or buying the lift changes what the rest of the job
 * costs from that moment on.
 *
 * The five effects apply in this order, and the order is load-bearing:
 * 1. every step starts at `energy.energyPerStepPoints`;
 * 2. a slogged step is multiplied by `toolHire.slogMultiplier`;
 * 3. a Service worked in situ on a buried slot pays `energy.energyByClass.
 *    buried` once, on the first step, for the digging;
 * 4. the benched crew's saving is worked out once over the whole job, exactly
 *    as it is for an on-car repair, then taken off the steps in order, each
 *    step floored at one point;
 * 5. the lift takes `lift.underCarStepDiscountPoints` off every step of an
 *    under-car job worked ON THE CAR, floored at one point. Bench work is
 *    never lift work.
 *
 * Empty for a target with nothing to work on.
 */
export function energyPlanFor(
  state: GameState,
  context: SimContext,
  target: RepairTarget,
  kind: RepairJobKind,
): number[] {
  const subject = resolveSubject(state, target, context)
  if (!subject) return []
  const resolved = resolveSteps(state, context, subject.recipes[kind], subject.group)
  const { energyPerStepPoints, energyByClass } = context.economy.energy
  const plan = resolved.map((step) =>
    step.availability === 'slog'
      ? energyPerStepPoints * context.economy.toolHire.slogMultiplier
      : energyPerStepPoints,
  )
  if (plan.length === 0) return plan
  if (
    kind === 'service' &&
    target.kind === 'installed' &&
    subject.entry.depthClass === 'buried' &&
    plan[0] !== undefined
  ) {
    plan[0] += energyByClass.buried
  }
  let saved = crewEnergySaved(
    plan.reduce((sum, points) => sum + points, 0),
    subject.group,
    state.staff,
    context.economy,
  )
  for (let i = 0; i < plan.length && saved > 0; i++) {
    const take = Math.min(saved, (plan[i] ?? 1) - 1)
    if (take <= 0) continue
    plan[i] = (plan[i] ?? 1) - take
    saved -= take
  }
  if (subject.entry.underCar && target.kind === 'installed' && liftAvailable(state)) {
    const discount = context.economy.lift.underCarStepDiscountPoints
    for (let i = 0; i < plan.length; i++) {
      plan[i] = Math.max(1, (plan[i] ?? 1) - discount)
    }
  }
  return plan
}

// --- money ----------------------------------------------------------------

/** The parts bill for taking this subject to `targetBand` - the same banded
 * repair maths every other repair path prices through, with a benched
 * perfectionist's discount applied exactly as `planGroupRepair` applies it. */
function partsBillYen(
  state: GameState,
  context: SimContext,
  subject: RepairSubject,
  targetBand: ConditionBand,
): number {
  return Math.round(
    costToBandYen(
      subject.band,
      targetBand,
      subject.entry,
      subject.catalogPart.priceYen,
      context.economy.restoration.repairStepFraction,
      subject.catalogPart.fitmentClass,
    ) * perfectionistCostMultiplier(state.staff, context.economy),
  )
}

// --- the shared fix price -------------------------------------------------

/**
 * Everything a fix price reads from the world. Deliberately narrower than
 * `SimContext`, which satisfies it as it stands: the band maths in `bands.ts`
 * carries an `EconomyConfig` and no context at all, so this lets every caller
 * pass what it already holds.
 */
export interface FixCostContext {
  economy: EconomyConfig
}

/** What putting one part right costs, and which job buys it. `'replace'` is
 * not a job: it is the answer for a part no job can save. */
export interface PartFixCost {
  jobKind: RepairJobKind | 'replace'
  /** The banded parts bill, or a replacement part's own price. */
  partsYen: number
  /** One day's hire on the line whose machine the job cannot be worked
   * without, counted once. Zero wherever the work can be done by hand: a
   * replacement, a Restore, an all-tier-1 recipe, and every tier 2 recipe whose
   * steps can all be slogged, which is nearly all of them. */
  hireFeeYen: number
  /** The tool LINE that day is bought on, or null when the work needs no day.
   * A hire is sold per line rather than per part, so the line is what
   * identifies a day when several parts' fixes are summed (`sumFixCosts`). */
  hireLine: ComponentId | null
}

/** Several parts' fixes taken as one bill: what the parts cost, what the days
 * cost, and the two together. */
export interface FixBill {
  /** Every fix's own `partsYen`, summed. */
  partsYen: number
  /** The day-hire the whole bill genuinely cannot avoid, one day per LINE. */
  hireYen: number
  /** `partsYen + hireYen`. */
  totalYen: number
}

/**
 * Several parts' fixes priced as one bill. Parts add up; DAYS DO NOT.
 *
 * A day's hire buys a line's entire tier 2 kit for that day, so a bill that
 * welds two slots on the same line buys that line ONCE, not twice, and a bill
 * spanning six lines buys six days at most. Every walk that sums fixes across
 * several parts totals them here rather than adding `partsYen + hireFeeYen`
 * slot by slot, so no walker can charge the same day twice.
 *
 * Few bills name a day at all. A bench job names one only where the work cannot
 * be done by hand (`forcedHireDayFor`, the ONE predicate for that question);
 * everything else is worked by hand at `toolHire.slogMultiplier` energy, which
 * costs a player time rather than money and so never reaches this bill. A
 * caller folding in a day of its own de-duplicates against the bench days on
 * the same line, which is the whole reason a fee names its line.
 *
 * `partFixCostYen` stays a per-part price and keeps returning a per-part fee:
 * a single-part quote really does buy that part's day. The de-duplication is
 * the walk's job, and this is where the walk does it.
 */
export function sumFixCosts(fixes: Iterable<PartFixCost>): FixBill {
  let partsYen = 0
  const dayByLine = new Map<ComponentId, number>()
  for (const fix of fixes) {
    partsYen += fix.partsYen
    if (fix.hireLine !== null && fix.hireFeeYen > 0) dayByLine.set(fix.hireLine, fix.hireFeeYen)
  }
  let hireYen = 0
  for (const feeYen of dayByLine.values()) hireYen += feeYen
  return { partsYen, hireYen, totalYen: partsYen + hireYen }
}

/** The smallest job whose finished band reaches `targetBand`: Service to worn,
 * Rebuild to fine, Restore to mint. `REPAIR_JOB_KINDS` is in target order, so
 * the first job that reaches it is the cheapest one that does. */
function smallestJobReaching(targetBand: ConditionBand, context: FixCostContext): RepairJobKind {
  const wanted = bandIndex(targetBand)
  return (
    REPAIR_JOB_KINDS.find((kind) => bandIndex(context.economy.repairJobs[kind].target) >= wanted) ??
    'restore'
  )
}

/**
 * The day's hire this job genuinely cannot be worked without, and the line it
 * is bought on, or null when the work can be done by hand instead. THE ONE
 * ANSWER to what forces a hire day: every reader that needs the question
 * settled asks this, so no second opinion about it can grow anywhere.
 *
 * A tier 2 tool is a RATE, not a wall. Without the machine a tier 2 step is
 * slogged at `toolHire.slogMultiplier` energy and no yen at all
 * (`availabilityFor`), so owning the line buys speed rather than access and no
 * day has to be bought for it. The one exception is a welding or machining step
 * (`requiresMachine`), which can never be slogged: that day is the only one
 * anyone is forced to buy.
 *
 * It is `availabilityFor`'s own `locked` case asked without a shop to read: the
 * same criterion the bench applies to a step in front of it, from the side that
 * has no state and has to price the work anyway. Nothing else in the economy
 * names a day. Depth does not: reaching a buried slot with no rig is worked by
 * hand for energy and no yen (`accessRoute`, jobs.ts), so no walk, quote or
 * valuation charges for access.
 *
 * Counted once however many such steps the recipe holds, and charged on the
 * STEP's own line, which is the line a hire has to cover: the exhaust's Rebuild
 * borrows the body corner's MIG, so it wants the body line hired rather than
 * the engine line the exhaust itself sits on.
 *
 * A Restore has no hire route of any kind, and a part with no recipe ladder at
 * all (the two zone-derived body carriers) names no day either: the body
 * pipeline prices its work, not the bench.
 */
export function forcedHireDayFor(
  entry: CarPartTaxonomyEntry,
  kind: RepairJobKind,
  context: FixCostContext,
): { feeYen: number; line: ComponentId } | null {
  // No line hires out a shop, so a Restore assumes the covering shop rather
  // than pricing a day that cannot be bought.
  if (kind === 'restore') return null
  const recipe = WORKBENCH.recipes[entry.id]?.[kind]
  if (!recipe) return null
  const forced = recipe.find(
    (step) =>
      step.requiresMachine &&
      toolTierOnBench(WORKBENCH, stepBenchFor(step, entry.group), step.tool) === 2,
  )
  if (!forced) return null
  const line = stepGroupFor(forced, entry.group)
  return { feeYen: context.economy.toolHire.feeYenByGroup[line], line }
}

/**
 * What it costs to put ONE part right, priced for the whole economy at a single
 * fixed assumption: a garage that hires whatever it does not own. The player's
 * own tool lines, hires and shops are never read here, so what a fix is worth
 * to the market never depends on what is bolted to this shop's wall.
 *
 * A part past saving - scrap, or a consumable that is replaced rather than
 * repaired - answers `'replace'` at a stock replacement price and no fee.
 * Anything else answers with the smallest job that reaches `targetBand`, priced
 * as the banded parts bill (`costToBandYen`, the one repair-money formula) plus
 * a single day's hire ONLY where the job cannot be worked by hand at all.
 *
 * That last part is the whole of what a fee means here. A tier 2 tool is a rate
 * rather than a wall: a garage without it slogs the step at
 * `toolHire.slogMultiplier` energy and pays nothing, so it buys speed rather
 * than access. The only day a bench job is forced to buy is one a welding or
 * machining step demands (`requiresMachine`, `forcedHireDayFor`), and every
 * other recipe therefore prices at its parts alone. By-hand work costs energy,
 * not money, and energy is not a thing a bill can carry.
 *
 * A part already at or above `targetBand` costs nothing at all, fee included:
 * there is no work, so there is no day to hire.
 *
 * Callers keep their own labour accounting. Only the decision and the two price
 * atoms live here, which is why this returns the fee separately rather than
 * folded in: a quote charges it, a player who owns the line keeps it. A caller
 * pricing SEVERAL parts sums them through `sumFixCosts`, which charges each
 * line's day once however many of these parts want it.
 */
export function partFixCostYen(
  entry: CarPartTaxonomyEntry,
  part: Part,
  band: ConditionBand,
  targetBand: ConditionBand,
  context: FixCostContext,
): PartFixCost {
  const partsYen = costToBandYen(
    band,
    targetBand,
    entry,
    part.priceYen,
    context.economy.restoration.repairStepFraction,
    part.fitmentClass,
  )
  if (!canRepair(band, entry)) {
    return { jobKind: 'replace', partsYen, hireFeeYen: 0, hireLine: null }
  }
  const jobKind = smallestJobReaching(targetBand, context)
  if (partsYen === 0) return { jobKind, partsYen, hireFeeYen: 0, hireLine: null }
  const day = forcedHireDayFor(entry, jobKind, context)
  return { jobKind, partsYen, hireFeeYen: day?.feeYen ?? 0, hireLine: day?.line ?? null }
}

// --- job cards ------------------------------------------------------------

/** How a job's remaining steps will actually be worked, taken as a whole. */
export type RepairJobRoute = 'own' | 'hired-today' | 'hire' | 'slog' | 'locked'

/** One step of a job, as the card shows it. */
export interface RepairJobStepCard {
  tool: string
  toolLabel: string
  copy: string
  slogged: boolean
}

/** One job kind, priced and explained for a target, without touching state. */
export interface RepairJobCard {
  kind: RepairJobKind
  targetBand: ConditionBand
  offered: boolean
  refusal?: RepairJobCardRefusal
  route: RepairJobRoute
  lockedReason?: 'needs-shop' | 'needs-machine'
  /** The day-hire fee for the line the job is short of, when hiring is what
   * unblocks it. Null on every other route. */
  hireFeeYen: number | null
  stepsDone: number
  /** The steps still to work, in order - a job halfway through shows only what
   * is left. */
  steps: RepairJobStepCard[]
  /** Energy for the remaining steps, summed off the live plan. */
  energyPoints: number
  /** The remove-and-refit energy around a job that needs the part off the car
   * and finds it still fitted. Display only; the actions themselves are
   * resolved by the existing removal and install paths. */
  removalEnergyPoints: number
  /**
   * The parts bill as the card QUOTES it, or zero once the job has started
   * and been charged. On a slot the player has not verified this prices the
   * knowledge model's own guess rather than the truth (`quotedSubjectFor`),
   * so a card can never tell them a condition they have not found out. What
   * the work actually costs when it runs is the true bill either way, taken
   * by `resolveRepairStep` off the real part.
   */
  partsYen: number
}

/** A card for a target nothing can be done to - no car, an empty slot, a part
 * that is not in the warehouse, or a part with no recipe ladder. */
function unresolvableCard(kind: RepairJobKind, context: SimContext): RepairJobCard {
  return {
    kind,
    targetBand: targetBandFor(kind, context),
    offered: false,
    refusal: 'not-repairable',
    route: 'locked',
    hireFeeYen: null,
    stepsDone: 0,
    steps: [],
    energyPoints: 0,
    removalEnergyPoints: 0,
    partsYen: 0,
  }
}

/**
 * How the remaining steps will be worked, taken together, and what to say about
 * it. A shop tool nobody owns locks the job outright. A welding or machining
 * step without the machine is not locked in the same sense: the line can be
 * hired for the day, so the job routes to `hire` and names the fee. Otherwise
 * the job is owned outright, riding today's hire, or slogged by hand.
 */
function routeFor(
  context: SimContext,
  remaining: readonly ResolvedStep[],
): Pick<RepairJobCard, 'route' | 'lockedReason' | 'hireFeeYen'> {
  const shopLocked = remaining.find(
    (step) => step.availability === 'locked' && step.tier === 'shop',
  )
  if (shopLocked) return { route: 'locked', lockedReason: 'needs-shop', hireFeeYen: null }
  const machineLocked = remaining.find((step) => step.availability === 'locked')
  if (machineLocked) {
    return {
      route: 'hire',
      hireFeeYen: context.economy.toolHire.feeYenByGroup[machineLocked.group],
    }
  }
  if (remaining.every((step) => step.availability === 'owned')) {
    return { route: 'own', hireFeeYen: null }
  }
  if (remaining.some((step) => step.availability === 'hired')) {
    return { route: 'hired-today', hireFeeYen: null }
  }
  return { route: 'slog', hireFeeYen: null }
}

/** The remove-and-refit energy a job needs spent around it before it can start,
 * priced through the existing removal and refit figures at the multipliers the
 * old path uses. Zero unless the job wants the part on a bench and the part is
 * still bolted to the car. */
function removalEnergyPointsFor(
  state: GameState,
  context: SimContext,
  target: RepairTarget,
  kind: RepairJobKind,
  subject: RepairSubject,
): number {
  if (kind === 'service' || target.kind !== 'installed' || !subject.entry.removable) return 0
  const car = subject.car
  const installed = car?.parts[subject.carPartId]?.installed
  if (!car || !installed) return 0
  const removeGroup = machineGateGroupFor(subject.carPartId, 'remove', context)
  const installGroup = machineGateGroupFor(subject.carPartId, 'install', context)
  return (
    removeLaborSlotsFor(subject.carPartId, context) *
      machineLaborMultiplier(removeGroup, state, context) +
    refitLaborSlotsFor(car, subject.carPartId, installed, context) *
      machineLaborMultiplier(installGroup, state, context)
  )
}

/**
 * The subject a card is allowed to QUOTE against. A quote is a thing the
 * player is told, so it may only ever be built out of what they know: on a
 * slot they have not verified, both the band and the fitted part come from
 * `knowledgeViewOf` (knowledge.ts) - the same masked view the band chip, the
 * player's own value estimate and every other player-facing figure already
 * read - so a card can never name a condition, a part or a price the player
 * has not found out. `isSlotVerified` is the one predicate for that question
 * and nothing here answers it a second way.
 *
 * Only the quote moves. What the work costs when it runs is settled off the
 * real subject in `resolveRepairStep`, so an under-quoted slot is charged its
 * true bill exactly as it always was.
 *
 * The rest of the card needs no masking. A job's step list comes from the
 * recipe, and its energy from tools, crew, the lift and the slot's own depth
 * class (`energyPlanFor`, `removalEnergyPointsFor`) - none of which reads a
 * band - so the energy figures carry no condition to leak.
 *
 * A loose part is always verified (it is in hand), so a bench target quotes
 * itself unchanged, as does a car the knowledge model was never seeded onto
 * (`isSlotVerified`'s own defensive default).
 */
function quotedSubjectFor(
  context: SimContext,
  target: RepairTarget,
  subject: RepairSubject,
): RepairSubject {
  const car = subject.car
  if (target.kind !== 'installed' || !car || isSlotVerified(car, subject.carPartId)) return subject
  const model = context.modelsById[car.modelId]
  // Without a resolvable model there is no stock SKU to mask the part's
  // identity back to, but the guess itself needs no model, so the band never
  // leaks either way.
  if (!model) return { ...subject, band: priorBand(car, subject.carPartId, context) }
  const guessed = knowledgeViewOf(car, model, context).parts[subject.carPartId].installed
  if (!guessed) return subject
  return {
    ...subject,
    band: guessed.band,
    catalogPart: context.partsById[guessed.partId] ?? subject.catalogPart,
  }
}

/**
 * The three job cards for a target, in ladder order, priced and routed off
 * current state and nothing stored. A refused card still carries its steps,
 * energy and parts bill: the player is owed the price of the work they cannot
 * do yet, alongside the reason.
 *
 * Everything except `partsYen` reads the real subject; `partsYen` reads the
 * quoted one (`quotedSubjectFor`), which is the same subject on every slot
 * the player has verified.
 */
export function repairJobCards(
  state: GameState,
  context: SimContext,
  target: RepairTarget,
): RepairJobCard[] {
  const subject = resolveSubject(state, target, context)
  const quoted = subject ? quotedSubjectFor(context, target, subject) : null
  return REPAIR_JOB_KINDS.map((kind) => {
    if (!subject || !quoted) return unresolvableCard(kind, context)
    const targetBand = targetBandFor(kind, context)
    const refusal = cardRefusalFor(state, context, target, kind, subject)
    const job = state.jobs.find((open) => open.id === repairJobIdFor(target, kind, context))
    const stepsDone = job?.laborSlotsSpent ?? 0
    const resolved = resolveSteps(state, context, subject.recipes[kind], subject.group)
    const remaining = resolved.slice(stepsDone)
    const plan = energyPlanFor(state, context, target, kind)
    return {
      kind,
      targetBand,
      offered: refusal === null,
      ...(refusal ? { refusal } : {}),
      ...routeFor(context, remaining),
      stepsDone,
      steps: remaining.map((step) => ({
        tool: step.step.tool,
        toolLabel: step.toolLabel,
        copy: step.step.copy,
        slogged: step.availability === 'slog',
      })),
      energyPoints: plan.slice(stepsDone).reduce((sum, points) => sum + points, 0),
      removalEnergyPoints: removalEnergyPointsFor(state, context, target, kind, subject),
      partsYen: stepsDone > 0 ? 0 : partsBillYen(state, context, quoted, targetBand),
    }
  })
}

// --- execution ------------------------------------------------------------

/** Why a step would not run. */
export type RepairStepRefusal =
  | 'not-offered'
  | 'needs-bench'
  | 'needs-shop'
  | 'needs-machine'
  | 'needs-hire'
  | 'no-energy'
  | 'no-cash'

/** A step ran, a step ran and finished the job, or nothing happened and here is
 * why. */
export type RepairStepOutcome = 'stepped' | 'completed' | { refused: RepairStepRefusal }

export interface ResolveRepairStepResult {
  state: GameState
  outcome: RepairStepOutcome
  /**
   * The session events this call produced: one `repair-step` per step worked,
   * plus `repair-job-completed` on the last one. Session events rather than day
   * log entries, because that is where the two new event shapes live; the day
   * log lines are formatted when the screens land.
   */
  log: SessionEventInput[]
}

function refused(state: GameState, reason: RepairStepRefusal): ResolveRepairStepResult {
  return { state, outcome: { refused: reason }, log: [] }
}

/** The `carInstanceId`/`partInstanceId` half of both event payloads - exactly
 * one of the two, mirroring the target's own split. */
function eventAddressFor(
  target: RepairTarget,
): { carInstanceId: string } | { partInstanceId: string } {
  return target.kind === 'installed'
    ? { carInstanceId: target.carInstanceId }
    : { partInstanceId: target.partInstanceId }
}

/**
 * Takes the parts bill for a job that is starting, and posts it where the work
 * is being done: an owned car's own ledger, a customer car's service job
 * ledger, or - for bench work on a loose part - onto the part's own
 * `pricePaidYen`, which is what a reconditioned part has always cost. Refuses
 * as a whole when the cash is not there; nothing is charged and nothing is
 * posted.
 */
function chargePartsBill(
  state: GameState,
  target: RepairTarget,
  billYen: number,
): GameState | null {
  const charged = chargeRepairWork(state, billYen)
  if (!charged.ok) return null
  if (target.kind === 'loose') {
    return {
      ...charged.state,
      partInventory: charged.state.partInventory.map((part) =>
        part.id === target.partInstanceId
          ? { ...part, pricePaidYen: (part.pricePaidYen ?? 0) + charged.totalCostYen }
          : part,
      ),
    }
  }
  if (charged.state.ownedCars.some((car) => car.id === target.carInstanceId)) {
    return updateCarLedger(charged.state, target.carInstanceId, (ledger) => ({
      ...ledger,
      repairYen: ledger.repairYen + charged.totalCostYen,
    }))
  }
  const serviceJob = charged.state.activeServiceJobs.find(
    (job) => job.car.id === target.carInstanceId,
  )
  if (!serviceJob) return charged.state
  return updateServiceJobLedger(charged.state, serviceJob.id, (ledger) => ({
    ...ledger,
    repairYen: ledger.repairYen + charged.totalCostYen,
  }))
}

/** Writes the finished band onto the target and settles what that reveals: a
 * band that climbs cures what it disproves, and a slot worked on is a slot now
 * known. A loose part has no symptoms to settle, only its own band. */
function applyFinishedBand(
  state: GameState,
  target: RepairTarget,
  context: SimContext,
  targetBand: ConditionBand,
): GameState {
  if (target.kind === 'loose') {
    return {
      ...state,
      partInventory: state.partInventory.map((part) =>
        part.id === target.partInstanceId ? { ...part, band: targetBand } : part,
      ),
    }
  }
  const car = findWorkableCar(state, target.carInstanceId)
  const installed = car?.parts[target.carPartId]?.installed
  if (!car || !installed) return state
  const climbed: CarInstance = {
    ...car,
    parts: { ...car.parts, [target.carPartId]: { installed: { ...installed, band: targetBand } } },
  }
  const { car: verified } = verifyAndResolve(
    pruneCuredCauses(climbed, context),
    target.carPartId,
    context,
  )
  return writeCarBack(state, target.carInstanceId, verified)
}

/**
 * Work one step of one repair job. Finds the job or opens it, checks that the
 * work is on offer and that the next step's tool is to hand, checks the energy
 * for that one step, charges the whole parts bill on the first step only, then
 * ticks. Steps are atomic: a step either runs in full or nothing moves at all.
 *
 * The charge is priced off the REAL subject, never off the card's quote: on a
 * slot the player has not verified the card quotes the knowledge model's guess
 * (`quotedSubjectFor`), and the money that moves is still the true bill. The
 * work is honest even when the estimate was not.
 *
 * The band moves once, on the last step. Everything before that is a job
 * sitting in `state.jobs` with its steps counted, which survives the end of the
 * day, a lapsed hire, and the part coming off the bench and going back on.
 */
export function resolveRepairStep(
  state: GameState,
  target: RepairTarget,
  kind: RepairJobKind,
  context: SimContext,
  energyRemaining: number,
): ResolveRepairStepResult {
  const subject = resolveSubject(state, target, context)
  if (!subject) return refused(state, 'not-offered')

  const cardRefusal = cardRefusalFor(state, context, target, kind, subject)
  if (cardRefusal === 'needs-bench') return refused(state, 'needs-bench')
  if (cardRefusal === 'needs-shop') return refused(state, 'needs-shop')
  if (cardRefusal !== null) return refused(state, 'not-offered')

  const jobId = repairJobIdFor(target, kind, context)
  const existing = state.jobs.find((job) => job.id === jobId)
  const steps = subject.recipes[kind]
  const stepIndex = existing?.laborSlotsSpent ?? 0
  const resolved = resolveSteps(state, context, steps, subject.group)
  const step = resolved[stepIndex]
  if (!step) return refused(state, 'not-offered')
  if (step.availability === 'locked') {
    return refused(state, step.tier === 'shop' ? 'needs-shop' : 'needs-machine')
  }

  const plan = energyPlanFor(state, context, target, kind)
  const stepEnergy = plan[stepIndex]
  if (stepEnergy === undefined) return refused(state, 'not-offered')
  if (energyRemaining < stepEnergy) return refused(state, 'no-energy')

  const targetBand = targetBandFor(kind, context)
  let next = state
  if (stepIndex === 0) {
    const charged = chargePartsBill(next, target, partsBillYen(state, context, subject, targetBand))
    if (!charged) return refused(state, 'no-cash')
    next = charged
  }

  const ticked: Job = existing
    ? { ...existing, laborSlotsSpent: existing.laborSlotsSpent + 1 }
    : {
        id: jobId,
        // A loose part has no car, so its own id stands in for identity - the
        // same convention a loose-part machining job uses.
        carInstanceId: target.kind === 'installed' ? target.carInstanceId : target.partInstanceId,
        kind,
        componentId: subject.group,
        carPartId: subject.carPartId,
        ...(target.kind === 'loose' ? { partInstanceId: target.partInstanceId } : {}),
        targetBand,
        laborSlotsRequired: steps.length,
        laborSlotsSpent: 1,
      }
  next = {
    ...next,
    jobs: existing
      ? next.jobs.map((job) => (job.id === jobId ? ticked : job))
      : [...next.jobs, ticked],
    energySpentToday: next.energySpentToday + stepEnergy,
  }

  const log: SessionEventInput[] = [
    {
      type: 'repair-step',
      payload: {
        ...eventAddressFor(target),
        carPartId: subject.carPartId,
        jobKind: kind,
        stepIndex,
        copy: step.step.copy,
        slogged: step.availability === 'slog',
        energyPoints: stepEnergy,
      },
    },
  ]

  if (ticked.laborSlotsSpent < ticked.laborSlotsRequired) {
    return { state: next, outcome: 'stepped', log }
  }

  next = applyFinishedBand(next, target, context, targetBand)
  next = { ...next, jobs: next.jobs.filter((job) => job.id !== jobId) }
  log.push({
    type: 'repair-job-completed',
    payload: {
      ...eventAddressFor(target),
      carPartId: subject.carPartId,
      jobKind: kind,
      targetBand,
    },
  })
  return { state: next, outcome: 'completed', log }
}
