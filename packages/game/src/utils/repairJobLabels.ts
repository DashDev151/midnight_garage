import type { RepairJobKind } from '@midnight-garage/content'
import type { RepairJobCard, RepairStepRefusal } from '@midnight-garage/sim'
import { formatYen } from './formatYen'

/**
 * The words every repair-job surface uses: the three jobs by name, what a tab
 * says when it will not open, what the step a job is on costs, and why a step
 * would not run.
 *
 * One home for all of it, so the bench and the car say the same things about
 * the same job. Every figure here is read off a `RepairJobCard` or an energy
 * plan the sim built; nothing is decided.
 */

export const REPAIR_JOB_LABELS: Readonly<Record<RepairJobKind, string>> = {
  service: 'Service',
  rebuild: 'Rebuild',
  restore: 'Restore',
}

/** What a step being worked without its proper tool adds to the energy line. */
const SLOG_SUFFIX = 'x3, no proper tool'

/** The machine a card is short of, named by the step that wants it. */
function machineLabelFor(card: RepairJobCard): string {
  return card.steps[0]?.toolLabel ?? ''
}

/** One job tab, as a screen renders it. The band the job would leave the part
 * at is the job card's to show, not the tab's: the tab is a selector. */
export interface RepairJobTabView {
  kind: RepairJobKind
  label: string
  disabled: boolean
  tooltip: string
  selected: boolean
}

/** Why this tab will not open, or `''` when it will. */
function tabTooltip(card: RepairJobCard, shopName: string): string {
  if (!card.offered) {
    if (card.refusal === 'needs-shop') return `needs the ${shopName}`
    if (card.refusal === 'at-or-above-target') return 'already there'
    return ''
  }
  if (card.route === 'locked') {
    if (card.lockedReason === 'needs-shop') return `needs the ${shopName}`
    if (card.lockedReason === 'needs-machine') return `needs the ${machineLabelFor(card)}`
  }
  return ''
}

/** The three tabs for one target's cards, in ladder order. A job that is not
 * on offer, or whose tools cannot be come by at all, is greyed rather than
 * hidden: the player is owed the reason. */
export function repairJobTabViews(
  cards: readonly RepairJobCard[],
  selectedKind: RepairJobKind | null,
  shopName: string,
): RepairJobTabView[] {
  return cards.map((card) => ({
    kind: card.kind,
    label: REPAIR_JOB_LABELS[card.kind],
    disabled: !card.offered || card.route === 'locked',
    tooltip: tabTooltip(card, shopName),
    selected: card.kind === selectedKind,
  }))
}

/** The job already part-way through, else the first one on offer, in ladder
 * order - the tab that is selected until the player picks another. */
export function defaultRepairJobKind(cards: readonly RepairJobCard[]): RepairJobKind | null {
  const started = cards.find((card) => card.stepsDone > 0)
  if (started) return started.kind
  return cards.find((card) => card.offered)?.kind ?? null
}

/** The energy line for the step a job is on - the sim's own figure for that
 * one step, and what it means when the proper tool is not to hand. */
export function repairStepEnergyText(points: number | undefined, slogged: boolean): string {
  if (points === undefined) return ''
  return slogged ? `${points} energy ${SLOG_SUFFIX}` : `${points} energy`
}

/** Why the step just clicked did not run. `''` for a step that ran, and for
 * the refusals no click can reach. */
export function repairStepRefusalText(
  reason: RepairStepRefusal | null,
  card: RepairJobCard | null,
  shopName: string,
): string {
  if (!reason || !card) return ''
  if (reason === 'no-energy') return 'Not enough left in the day.'
  if (reason === 'no-cash')
    return `The parts bill wants ${formatYen(card.partsYen)} you don't have.`
  if (reason === 'needs-machine') return `Needs the ${machineLabelFor(card)}. No way round a weld.`
  if (reason === 'needs-shop') return `That grade of work needs the ${shopName}.`
  return ''
}
