import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema } from './tags'

/**
 * Sprint 87 (the assembly model): the three sub-assemblies that come off and
 * go back on a car as one unit, defined in content (`parts-taxonomy.json`'s
 * `assemblies` block). An assembly is NOT a second labour model - it is a
 * batched operation over the existing per-slot `CarInstance`/`vacatedBaseline`
 * machinery (see `packages/sim/src/assemblies.ts`): removing one pulls every
 * `member` slot at once, refitting it charges each member by the Sprint 79
 * equivalence rule, and its external blockers/machine gate are DERIVED from
 * its members, never stored here.
 */
export const AssemblyIdSchema = z.enum(['wheelAssembly', 'engineAssembly', 'gearboxAssembly'])

export type AssemblyId = z.infer<typeof AssemblyIdSchema>

export const AssemblyDefSchema = z.object({
  id: AssemblyIdSchema,
  /** Player-facing name (Sprint 87, swept final). */
  displayName: z.string().min(1),
  /** The component group this assembly belongs to - all its members share it. */
  group: ComponentIdSchema,
  /** The `CarPartId` slots that move together as this assembly. Every member
   * belongs to `group`. Order is display order. */
  members: z.array(CarPartIdSchema).min(1),
  /** The tool line (station) the assembly is worked at - the crane/stand for
   * the engine, the bench for the gearbox, the tyre machine for the wheels.
   * Identical to `group` for the three shipped assemblies, kept a separate
   * field because the two answer different questions (which discipline earns
   * from it vs. which machine works it). */
  station: ComponentIdSchema,
})

export const AssemblyDefsSchema = z.array(AssemblyDefSchema).min(1)

export type AssemblyDef = z.infer<typeof AssemblyDefSchema>
