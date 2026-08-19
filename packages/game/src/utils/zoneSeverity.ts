import type { PipelineStageId, ZoneState, ZoneStates } from '@midnight-garage/content'
import { PAINT_COLOURS } from '@midnight-garage/content'
import {
  BEYOND_REPAIR_METAL,
  MAX_REPAIRABLE_METAL,
  factoryColourSet,
  isMetalZoneState,
  unpaintedPanelZoneIds,
  zoneNeedsPanel,
  zoneNextStep,
} from '@midnight-garage/sim'
import { colourTokenDisplayName } from './paintFamilies'

/** The short chip a zone carries when hand work is not the answer, or `null`
 * when it is. An absent panel and one ruined past welding look nothing alike on
 * the car, however identically they price, so they keep separate words. */
export function zoneNeedsPanelTag(zone: ZoneState): string | null {
  if (zone.panelMissing) return 'panel off'
  if (zoneNeedsPanel(zone)) return 'past saving'
  return null
}

/** The finish axis's own maximum (`zone.ts`'s `finish` field runs 0-3) - a
 * zone reading it is fully bare, with nothing on it at all. */
const FINISH_BARE = 3

/**
 * One "why" fact a zone carries, as an icon plus at most two words - the
 * vocabulary the zone panel renders instead of a sentence: `dent`,
 * `rot`, `bare metal`, `primed`, or a colour swatch. `hex` is set only on the
 * colour chip, which paints its own icon rather than using the glyph.
 */
export interface ZoneWhyChip {
  icon: string
  label: string
  hex?: string
}

const DENT_ICON = '◢'
const ROT_ICON = '≈'
const BARE_ICON = '▭'
const PRIMED_ICON = '▤'
const OFF_ICON = '×'
const COLOUR_ICON = '■'

/**
 * Every "why" fact behind a zone's condition, in icon-plus-short-word form -
 * what A2's band colour and A4's next action leave unsaid. A missing panel
 * is the whole story on its own (there is nothing else to read on an empty
 * frame); otherwise a metal zone can carry a dent chip and a rot chip
 * together, and every zone carries exactly one of bare metal / primed /
 * colour, the three mutually exclusive states of its own finish.
 */
export function zoneWhyChips(zone: ZoneState, carUid?: string): ZoneWhyChip[] {
  if (zone.panelMissing) return [{ icon: OFF_ICON, label: 'panel off' }]
  const chips: ZoneWhyChip[] = []
  if (isMetalZoneState(zone) && zone.metal > 0) chips.push({ icon: DENT_ICON, label: 'dent' })
  if (isMetalZoneState(zone) && zone.surface > 0) chips.push({ icon: ROT_ICON, label: 'rot' })
  if (zone.colour) {
    chips.push({
      icon: COLOUR_ICON,
      label: colourTokenDisplayName(zone.colour, carUid),
      hex: PAINT_COLOURS.find((c) => c.id === zone.colour)?.hex,
    })
  } else if (zone.primed) {
    chips.push({ icon: PRIMED_ICON, label: 'primed' })
  } else if (zone.finish >= FINISH_BARE) {
    chips.push({ icon: BARE_ICON, label: 'bare metal' })
  }
  return chips
}

/** The panel count spelled out, so the line below reads as prose rather than
 * as a figure. A body carries nine panel zones and no more. */
const PANEL_COUNT_WORDS: readonly string[] = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
]

/**
 * Where a zone's FINISH sits, as its own axis separate from the
 * structure/metal band (`zoneConditionBand`, sim): bare metal (never coated,
 * or a fresh panel), prepped (stripped back on purpose - the colour field is
 * stale from before the strip, which is exactly what tells this state apart
 * from bare metal), primed, painted (coated, not yet polished down), or
 * polished (finish at its floor). Checked in this order because the fields
 * are not mutually exclusive in the raw state: `primed` can coexist with a
 * stale `colour` (stripped, then re-primed without a fresh coat yet), and a
 * bare zone can carry a stale `colour` too (stripped, not yet re-primed) -
 * `primed` wins over a lingering colour reading either way, since it is the
 * more recent, more physically true fact.
 */
export type ZoneFinishPosition = 'bare-metal' | 'prepped' | 'primed' | 'painted' | 'polished'

export const ZONE_FINISH_LABELS: Record<ZoneFinishPosition, string> = {
  'bare-metal': 'bare metal',
  prepped: 'prepped',
  primed: 'primed',
  painted: 'painted',
  polished: 'polished',
}

export function zoneFinishPosition(zone: ZoneState): ZoneFinishPosition {
  if (zone.primed) return 'primed'
  if (zone.finish >= FINISH_BARE) return zone.colour ? 'prepped' : 'bare-metal'
  if (zone.finish === 0) return 'polished'
  return 'painted'
}

/**
 * Whether a zone's structure and finish are BOTH fully done - the one
 * condition allowed to read as a plain "Mint" chip with nothing beside it.
 * Everywhere else the structure/metal band and the finish-position tag show
 * together, so a beaten-straight bare panel never reads as though the whole
 * zone were finished.
 */
export function zoneBothDone(band: string, finishPosition: ZoneFinishPosition): boolean {
  return band === 'mint' && finishPosition === 'polished'
}

/**
 * The zone's own remaining-steps checklist, in pipeline order - what
 * `zoneNextStep` (sim) already picks the FIRST of, unrolled into the whole
 * ladder instead of just the next verb. Read straight off the zone's own
 * fields (metal, surface, finish, primed), the same facts `zoneNextStep`
 * itself reads, so the checklist and the single active control can never
 * disagree about what is left.
 */
export function zoneRemainingSteps(zone: ZoneState): string[] {
  if (zone.panelMissing) return ['Fit a panel']
  const steps: string[] = []
  if (isMetalZoneState(zone)) {
    if (zone.metal > 0) steps.push(zone.metal >= MAX_REPAIRABLE_METAL ? 'Weld' : 'Beat')
    if (zone.surface > 0) steps.push('Fill and sand')
  }
  if (zone.finish >= FINISH_BARE) {
    if (!zone.primed) steps.push('Prime')
    steps.push('Paint')
    steps.push('Polish')
  } else if (zone.finish > 0) {
    steps.push('Polish')
  }
  return steps
}

/**
 * The line a car with unpainted panels carries, or `null` when it has none.
 * Fitting a body kit leaves every panel it covers bare, so the paint band
 * drops and takes style and authenticity down with it. Both numbers are
 * right, and both return when the car is painted; without this line the
 * player only sees them fall.
 */
export function unpaintedPanelsText(zoneStates: ZoneStates): string | null {
  const count = unpaintedPanelZoneIds(zoneStates).length
  if (count === 0) return null
  const word = PANEL_COUNT_WORDS[count] || String(count)
  const subject = count === 1 ? `${word} panel is` : `${word} panels are`
  return `${subject} still unpainted. Style and authenticity read low while the car sits like that, and both come back once the paint is on.`
}

/**
 * One of the body shop's five rigid pipeline buttons (sprint220.md's step
 * state machine). `stage` is the sim stage `zonePipelineSteps` would dispatch
 * were this the enabled step - always present so a caller never has to derive
 * it separately, even for a state the button cannot currently fire from.
 */
export type PipelineStepId = 'beatWeld' | 'fillAndSand' | 'prime' | 'paint' | 'polish'
export type PipelineStepState = 'done' | 'next' | 'locked' | 'not-needed'

export interface ZonePipelineStep {
  id: PipelineStepId
  label: string
  state: PipelineStepState
  doneLabel?: string
  lockedCaption?: string
  stage: PipelineStageId
}

/** Why the whole pipeline row is locked - a gone panel and one ruined past
 * welding read as different facts (`zoneNeedsPanelTag` above draws the same
 * line), so the caption names which one applies. */
export type PanelBlockedReason = 'missing' | 'beyond-repair' | null

export interface ZonePipelineSteps {
  steps: ZonePipelineStep[]
  panelBlocked: boolean
  panelBlockedReason: PanelBlockedReason
  stripBack: { enabled: boolean }
}

const PANEL_BLOCKED_CAPTION: Readonly<Record<'missing' | 'beyond-repair', string>> = {
  missing: 'No panel fitted',
  'beyond-repair': 'Beyond repair: needs a replacement panel',
}

/** `zoneNextStep`'s (sim) answer, unrolled onto the five-button vocabulary -
 * `beat`/`weld` fold into the one `beatWeld` button, `stripPrep` never comes
 * back from `zoneNextStep` at all (it is a discretionary control, not an
 * objective next step), and `replace-panel`/`null` both mean no button of the
 * five is next. */
function pipelineStepIdFor(stage: PipelineStageId | 'replace-panel' | null): PipelineStepId | null {
  switch (stage) {
    case null:
    case 'replace-panel':
    case 'stripPrep':
      return null
    case 'beat':
    case 'weld':
      return 'beatWeld'
    default:
      return stage
  }
}

function blockedStep(
  id: PipelineStepId,
  label: string,
  stage: PipelineStageId,
  reason: 'missing' | 'beyond-repair',
): ZonePipelineStep {
  return { id, label, state: 'locked', lockedCaption: PANEL_BLOCKED_CAPTION[reason], stage }
}

function beatWeldStep(
  zone: ZoneState,
  isMetal: boolean,
  panelBlocked: boolean,
  panelBlockedReason: PanelBlockedReason,
  nextStepId: PipelineStepId | null,
): ZonePipelineStep {
  const metal = isMetalZoneState(zone) ? zone.metal : 0
  const label = metal === MAX_REPAIRABLE_METAL ? 'Weld' : 'Beat'
  const stage: PipelineStageId = metal === MAX_REPAIRABLE_METAL ? 'weld' : 'beat'
  if (panelBlocked) return blockedStep('beatWeld', label, stage, panelBlockedReason!)
  if (!isMetal)
    return { id: 'beatWeld', label, state: 'not-needed', doneLabel: 'Trim panel', stage }
  if (metal === 0) return { id: 'beatWeld', label, state: 'done', doneLabel: 'Straight', stage }
  // Never locked: `zoneNextStep` checks metal before anything else, so a
  // metal zone with metal > 0 is always the next step, never blocked behind
  // a prior one. `nextStepId` is asserted rather than branched on, so a
  // caller ever passing a state where that stopped holding fails loudly
  // instead of silently mislabelling the button.
  if (nextStepId !== 'beatWeld') {
    throw new Error('zonePipelineSteps: metal > 0 must always be the next step')
  }
  return { id: 'beatWeld', label, state: 'next', stage }
}

function fillAndSandStep(
  zone: ZoneState,
  isMetal: boolean,
  panelBlocked: boolean,
  panelBlockedReason: PanelBlockedReason,
  nextStepId: PipelineStepId | null,
): ZonePipelineStep {
  const label = 'Fill and Sand'
  const stage: PipelineStageId = 'fillAndSand'
  if (panelBlocked) return blockedStep('fillAndSand', label, stage, panelBlockedReason!)
  if (!isMetal)
    return { id: 'fillAndSand', label, state: 'not-needed', doneLabel: 'Trim panel', stage }
  const surface = isMetalZoneState(zone) ? zone.surface : 0
  if (surface === 0) return { id: 'fillAndSand', label, state: 'done', stage }
  if (nextStepId === 'fillAndSand') return { id: 'fillAndSand', label, state: 'next', stage }
  return { id: 'fillAndSand', label, state: 'locked', lockedCaption: 'After the metalwork', stage }
}

function primeStep(
  zone: ZoneState,
  panelBlocked: boolean,
  panelBlockedReason: PanelBlockedReason,
  nextStepId: PipelineStepId | null,
): ZonePipelineStep {
  const label = 'Prime'
  const stage: PipelineStageId = 'prime'
  if (panelBlocked) return blockedStep('prime', label, stage, panelBlockedReason!)
  if (zone.primed || zone.finish < FINISH_BARE) {
    const doneLabel = zone.finish < FINISH_BARE ? 'Sealed under paint' : 'Primed'
    return { id: 'prime', label, state: 'done', doneLabel, stage }
  }
  if (nextStepId === 'prime') return { id: 'prime', label, state: 'next', stage }
  return { id: 'prime', label, state: 'locked', lockedCaption: 'After fill and sand', stage }
}

function paintStep(
  zone: ZoneState,
  panelBlocked: boolean,
  panelBlockedReason: PanelBlockedReason,
  nextStepId: PipelineStepId | null,
): ZonePipelineStep {
  const label = 'Paint'
  const stage: PipelineStageId = 'paint'
  if (panelBlocked) return blockedStep('paint', label, stage, panelBlockedReason!)
  if (zone.finish < FINISH_BARE) return { id: 'paint', label, state: 'done', stage }
  if (nextStepId === 'paint') return { id: 'paint', label, state: 'next', stage }
  return { id: 'paint', label, state: 'locked', lockedCaption: 'After primer', stage }
}

function polishStep(
  zone: ZoneState,
  panelBlocked: boolean,
  panelBlockedReason: PanelBlockedReason,
  nextStepId: PipelineStepId | null,
): ZonePipelineStep {
  const label = 'Polish'
  const stage: PipelineStageId = 'polish'
  if (panelBlocked) return blockedStep('polish', label, stage, panelBlockedReason!)
  if (zone.finish === 0) return { id: 'polish', label, state: 'done', doneLabel: 'Showroom', stage }
  if (nextStepId === 'polish') return { id: 'polish', label, state: 'next', stage }
  return { id: 'polish', label, state: 'locked', lockedCaption: 'After paint', stage }
}

/**
 * The body shop's five fixed pipeline buttons (sprint220.md's step state
 * machine), in fixed order, for one zone - always all five, whatever the
 * zone's state, so a caller renders a rigid grid rather than a list that
 * grows and shrinks. `isMetal` decides whether Beat/Weld and Fill and Sand
 * are real steps or read "not needed: trim panel" - a trim zone has nothing
 * to beat or fill.
 *
 * A missing panel or metal ruined past welding locks the whole row
 * (`panelBlocked`/`panelBlockedReason`): every step comes back `locked`
 * naming the same blocker, and the only way forward is the panel row's Fit
 * control. `stripBack` is the standing "start a respray" control next to the
 * row, enabled whenever there is finish or primer to strip and the row
 * itself is not blocked.
 *
 * The single `next` step, when there is one, is read straight off
 * `zoneNextStep` (sim) - the same function the repair-bill quoting and every
 * other pipeline caller already trust - so this can never name a different
 * "next" than the one the sim would actually act on.
 */
export function zonePipelineSteps(zone: ZoneState, isMetal: boolean): ZonePipelineSteps {
  const panelBlockedReason: PanelBlockedReason = zone.panelMissing
    ? 'missing'
    : isMetal && isMetalZoneState(zone) && zone.metal === BEYOND_REPAIR_METAL
      ? 'beyond-repair'
      : null
  const panelBlocked = panelBlockedReason !== null
  const nextStepId = panelBlocked ? null : pipelineStepIdFor(zoneNextStep(zone))

  return {
    steps: [
      beatWeldStep(zone, isMetal, panelBlocked, panelBlockedReason, nextStepId),
      fillAndSandStep(zone, isMetal, panelBlocked, panelBlockedReason, nextStepId),
      primeStep(zone, panelBlocked, panelBlockedReason, nextStepId),
      paintStep(zone, panelBlocked, panelBlockedReason, nextStepId),
      polishStep(zone, panelBlocked, panelBlockedReason, nextStepId),
    ],
    panelBlocked,
    panelBlockedReason,
    stripBack: { enabled: !panelBlocked && (zone.primed || zone.finish < FINISH_BARE) },
  }
}

/** The three-row status summary a selected zone shows (sprint220.md's status
 * rows): METAL, PREP and PAINT read straight off the zone's own fields, never
 * behind a single structure-only band. */
export interface ZoneStatusRows {
  metal: string
  prep: string
  paint: string
}

function metalStatusText(zone: ZoneState, isMetal: boolean): string {
  if (!isMetal || !isMetalZoneState(zone)) return 'Trim panel: no metalwork'
  if (zone.metal === MAX_REPAIRABLE_METAL) return 'crumpled'
  if (zone.metal >= 1) return 'dented'
  return 'straight'
}

function prepStatusText(zone: ZoneState): string {
  const surface = isMetalZoneState(zone) ? zone.surface : 0
  if (surface > 0) return 'rough (needs fill and sand)'
  if (zone.finish >= FINISH_BARE && !zone.primed) return 'bare metal (needs primer)'
  if (zone.primed) return 'primed'
  return 'sealed under paint'
}

/** The PAINT row never trusts a stale `colour` field once the zone reads
 * bare: `stripPrep` (sim) leaves `finish` at its bare maximum but leaves
 * `colour` sitting exactly where it was, since the field is only ever
 * cleared by a fresh coat, not by the strip itself. Checking `finish` first,
 * before ever reading `colour`, is what keeps a freshly stripped panel
 * reading "unpainted" instead of the colour it wore before the strip. */
function paintStatusText(zone: ZoneState, factoryColour: string): string {
  if (zone.finish >= FINISH_BARE) return 'unpainted'
  const colourName = zone.colour ? colourTokenDisplayName(zone.colour) : 'unknown colour'
  const offFactory = zone.colour != null && !factoryColourSet(factoryColour).has(zone.colour)
  const suffix = offFactory ? ` (not the factory ${colourTokenDisplayName(factoryColour)})` : ''
  if (zone.finish === 2) return `painted ${colourName}, dull${suffix}`
  if (zone.finish === 1) return `painted ${colourName}${suffix}`
  return `polished ${colourName}, showroom${suffix}`
}

/**
 * The three status-row strings a selected zone shows. A missing panel or
 * metal ruined past welding (sprint220.md's global gate) reads the same word
 * on all three rows rather than three different half-true facts about a
 * panel that is not there to have a prep or paint state at all.
 */
export function zoneStatusRows(
  zone: ZoneState,
  isMetal: boolean,
  factoryColour: string,
): ZoneStatusRows {
  if (zone.panelMissing) return { metal: 'missing', prep: 'missing', paint: 'missing' }
  if (isMetal && isMetalZoneState(zone) && zone.metal === BEYOND_REPAIR_METAL) {
    return { metal: 'beyond repair', prep: 'beyond repair', paint: 'beyond repair' }
  }
  return {
    metal: metalStatusText(zone, isMetal),
    prep: prepStatusText(zone),
    paint: paintStatusText(zone, factoryColour),
  }
}

/**
 * The workshop diagram's three-segment metal/prep/paint indicator
 * (sprint220.md task C) - what replaces a zone region's lone condition band
 * plus finish tag, which read a straight-but-unpainted panel as plain Mint.
 * Read straight off `zonePipelineSteps`, never off the zone's raw fields:
 * the indicator can then never show a coat as done while the pipeline still
 * gates Paint as the next step.
 */
export type ZoneSegmentState = 'done' | 'pending' | 'trim' | 'blocked'

export interface ZoneSegments {
  metal: ZoneSegmentState
  prep: ZoneSegmentState
  paint: ZoneSegmentState
}

/** A step reads as satisfied for segment purposes whether it is genuinely
 * `done` or the zone never had that step to do (`not-needed`, trim panels). */
const SEGMENT_DONE_LIKE: ReadonlySet<PipelineStepState> = new Set(['done', 'not-needed'])

function metalSegmentState(beatWeld: ZonePipelineStep): ZoneSegmentState {
  if (beatWeld.state === 'not-needed') return 'trim'
  return beatWeld.state === 'done' ? 'done' : 'pending'
}

export function zoneSegments(zone: ZoneState, isMetal: boolean): ZoneSegments {
  const plan = zonePipelineSteps(zone, isMetal)
  if (plan.panelBlocked) return { metal: 'blocked', prep: 'blocked', paint: 'blocked' }
  const byId = Object.fromEntries(plan.steps.map((step) => [step.id, step])) as Record<
    PipelineStepId,
    ZonePipelineStep
  >
  const prepDone =
    SEGMENT_DONE_LIKE.has(byId.fillAndSand.state) && SEGMENT_DONE_LIKE.has(byId.prime.state)
  const paintDone = byId.paint.state === 'done' && byId.polish.state === 'done'
  return {
    metal: metalSegmentState(byId.beatWeld),
    prep: prepDone ? 'done' : 'pending',
    paint: paintDone ? 'done' : 'pending',
  }
}
