import type {
  ComponentId,
  EconomyConfig,
  GameState,
  StaffMember,
  TraitId,
} from '@midnight-garage/content'

/**
 * The crew-skill reads that turn benched members' `engine`/`chassis`/`body`
 * stats and traits into live effects. Every function here is a pure
 * derived read of the crew - no persisted state. The single activity gate
 * throughout is bench assignment: a contracted member contributes nothing
 * here, exactly as they contribute no bench labour (`energyMax`).
 */

/** The three crew skills - the keys of a member's `stats`. */
export type CrewSkillKey = keyof StaffMember['stats']

const CREW_SKILL_KEYS: readonly CrewSkillKey[] = ['engine', 'chassis', 'body']

/** The crew skill that leads work in component group `group`, per the content
 * `skillGroupMap` (engine leads ENGINE; chassis leads DRIVETRAIN/SUSPENSION/
 * WHEELS; body leads BODY/INTERIOR). The map partitions every group, so this
 * always resolves; the `null` return is a defensive guard only. */
export function skillKeyForGroup(group: ComponentId, economy: EconomyConfig): CrewSkillKey | null {
  const map = economy.staff.skillGroupMap
  for (const key of CREW_SKILL_KEYS) {
    if (map[key].includes(group)) return key
  }
  return null
}

/** The first benched member carrying `trait` (array order), or `undefined`
 * when none is - the trait's own live actor, not just whether one exists.
 * The one activity gate: a contracted member's trait is dormant, like their
 * hands. */
export function benchedMemberWithTrait(
  staff: readonly StaffMember[],
  trait: TraitId,
): StaffMember | undefined {
  return staff.find((m) => m.assignment === 'bench' && m.trait === trait)
}

/** True while any benched member carries `trait`. */
export function benchHasTrait(staff: readonly StaffMember[], trait: TraitId): boolean {
  return benchedMemberWithTrait(staff, trait) !== undefined
}

/** True while any perfectionist is at the bench. */
export function benchHasPerfectionist(staff: readonly StaffMember[]): boolean {
  return benchHasTrait(staff, 'perfectionist')
}

/**
 * The highest mapped skill for `group` among benched members - the best
 * pair of hands leads the job. 0 when no benched member covers the group
 * (no crew, or everyone is on contract), which yields no speed effect.
 */
export function crewSkillFor(
  group: ComponentId,
  staff: readonly StaffMember[],
  economy: EconomyConfig,
): number {
  const key = skillKeyForGroup(group, economy)
  if (!key) return 0
  let best = 0
  for (const member of staff) {
    if (member.assignment !== 'bench') continue
    if (member.stats[key] > best) best = member.stats[key]
  }
  return best
}

/**
 * The labour ENERGY a group-G repair plan of `baseEnergy` points saves,
 * given the benched crew. The `crewSpeedDiscount` curve is authored in
 * SLOTS (its natural unit for the hire-coherence bound D); read at
 * `crewSkillFor(group)`, a benched perfectionist spends one of those saved
 * slots on careful work, and the surviving slot saving is scaled to energy
 * by `pointsPerLabour`. The saving is clamped so the plan keeps at least
 * half its base energy and at least one labour's worth of work - it can
 * never fall to zero.
 */
export function crewEnergySaved(
  baseEnergy: number,
  group: ComponentId,
  staff: readonly StaffMember[],
  economy: EconomyConfig,
): number {
  if (baseEnergy <= 0) return 0
  const curve = economy.staff.crewSpeedDiscount
  const skill = crewSkillFor(group, staff, economy)
  let savedSlots = curve[Math.min(skill, curve.length - 1)] ?? 0
  if (benchHasPerfectionist(staff)) savedSlots = Math.max(0, savedSlots - 1)
  const pointsPerLabour = economy.energy.pointsPerLabour
  // Never below half the base cost, and never below one labour's worth of work.
  const saved = Math.min(
    savedSlots * pointsPerLabour,
    Math.floor(baseEnergy / 2),
    baseEnergy - pointsPerLabour,
  )
  return Math.max(0, saved)
}

/** `baseEnergy` less the benched crew's speed saving - what a group repair
 * plan actually takes with the crew on the bench right now, in energy
 * points. */
export function crewAdjustedGroupEnergy(
  baseEnergy: number,
  group: ComponentId,
  staff: readonly StaffMember[],
  economy: EconomyConfig,
): number {
  return baseEnergy - crewEnergySaved(baseEnergy, group, staff, economy)
}

/** The multiplier a benched perfectionist puts on repair cash cost (1 when
 * none is benched). Applied to the whole repair economy so bench and
 * on-car work stay one economy. */
export function perfectionistCostMultiplier(
  staff: readonly StaffMember[],
  economy: EconomyConfig,
): number {
  return benchHasPerfectionist(staff) ? 1 - economy.staff.perfectionistPartsDiscount : 1
}

/** The crew context a repair planner needs to apply the speed and cost
 * effects - the current staff roster plus the economy knobs. */
export interface CrewSkillContext {
  staff: readonly StaffMember[]
  economy: EconomyConfig
}

/** Convenience: build the crew context straight off game state. */
export function crewContextFor(state: GameState, economy: EconomyConfig): CrewSkillContext {
  return { staff: state.staff, economy }
}
