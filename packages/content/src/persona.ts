import { z } from 'zod'

/**
 * Sprint 76 (story missions I): the hand-authored campaign's customers - a
 * name and a one-line introduction, decoupled from the mission itself the
 * same way `serviceJobCustomerNames.json` decouples a generic customer name
 * from a service-job template. Real personas are authored in Sprint 78
 * alongside the real campaign copy; this sprint ships two placeholder
 * entries so the mission machine has someone to reference end to end.
 */
export const PersonaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  intro: z.string().min(1),
})

export const PersonasSchema = z.array(PersonaSchema).min(1)

export type Persona = z.infer<typeof PersonaSchema>
