import { z } from 'zod'

export const TraitIdSchema = z.enum([
  'ex-pro-driver',
  'auction-rat',
  'perfectionist',
  'night-owl',
  'gaisha-fluent',
])

export const TraitDefinitionSchema = z.object({
  id: TraitIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
})

export const TraitDefinitionsSchema = z.array(TraitDefinitionSchema).min(1)

/**
 * Sprint 80 (staff I), reworked into the crew model (maintainer redesign
 * 2026-07-17): an individual hired staff member - rolled state, not catalog
 * data. Hustle is gone entirely (R1): the three remaining stats are the
 * quality layer that lands in Staff II, and every member now contributes plain
 * labour instead of a hustle-gated bonus.
 *
 * `laborSlotsPerDay` (R2) is a flat 1 or 2, rolled at generation
 * (`economy.staff.laborSlotsPerDayWeights`) and priced into the wage - a pair
 * of hands is a pair of hands, no thresholds. `assignment` (R3) decides where
 * those hands go: `bench` (their slots add to the daily pool, `laborSlots.ts`)
 * or `contract` (a steady fleet retainer, `serviceBay.ts`; their labour is
 * unavailable). `pendingAssignment` is a reassignment scheduled from the Staff
 * Office that takes effect on the next day boundary (`advanceDay` commits it),
 * `null` when nothing is scheduled - a bench day cannot also collect the
 * retainer, and a switch never changes the labour pool mid-day.
 */
export const StaffMemberSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  stats: z.object({
    engine: z.number().int().min(1).max(5),
    chassis: z.number().int().min(1).max(5),
    body: z.number().int().min(1).max(5),
  }),
  /** A flat pair of hands: 1 or 2 labour slots a day (R2), rolled at
   * generation and priced into the wage. */
  laborSlotsPerDay: z.number().int().min(1).max(2),
  /** Where this member's labour goes (R3) - `bench` (default) adds their slots
   * to the daily pool; `contract` trades them for the fleet retainer. */
  assignment: z.enum(['bench', 'contract']).default('bench'),
  /** A reassignment scheduled to take effect on the next day boundary, or
   * `null` when none is pending (R3: reassignment is effective next day). */
  pendingAssignment: z.enum(['bench', 'contract']).nullable().default(null),
  weeklyWageYen: z.number().int().positive(),
  trait: TraitIdSchema,
})

export const StaffAssignmentSchema = StaffMemberSchema.shape.assignment.removeDefault()
export type StaffAssignment = z.infer<typeof StaffAssignmentSchema>

/**
 * Sprint 80 (staff I): the job-ad candidate flavour pools. `names` are
 * romanised, surname-first (matching the persona convention); `bios` are
 * one-line world-building details attachable to any rolled candidate (a
 * candidate's stats and trait are rolled, its display name and bio are drawn
 * from these pools). Not tied to any candidate at authoring time - the roller
 * (`sim/staff.ts`) pairs a fresh name and bio per ad.
 */
export const StaffCandidatePoolSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
  bios: z.array(z.string().min(1)).min(1),
})

export type TraitId = z.infer<typeof TraitIdSchema>
export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>
export type StaffMember = z.infer<typeof StaffMemberSchema>
export type StaffCandidatePool = z.infer<typeof StaffCandidatePoolSchema>
