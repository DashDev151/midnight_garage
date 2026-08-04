import { z } from 'zod'
import { BuyerArchetypeSchema } from './buyer'

/**
 * The hand-authored campaign's customers - a name, a one-line introduction,
 * and the scene they belong to, decoupled from the mission itself the same
 * way `serviceJobCustomerNames.json` decouples a generic customer name from a
 * service-job template. `archetype` is what lets a delivered mission credit a
 * real scene (`resolveDeliverMission`, sim/missions.ts) instead of a
 * hand-written tag - the crediting-bug class the old specialty system's
 * `specialtyGroups` field belonged to.
 */
export const PersonaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  intro: z.string().min(1),
  archetype: BuyerArchetypeSchema,
})

export const PersonasSchema = z.array(PersonaSchema).min(1)

export type Persona = z.infer<typeof PersonaSchema>
