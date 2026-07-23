import { z } from 'zod'

/**
 * The six body zones a car's zone state is keyed by (docs/design/
 * workshop-rework.md's model section) - the work model's own addressing
 * granularity for metal/surface/finish, one level below the derived
 * `panels`/`paint`/`underbody` parts the value model still reads. `chassis`
 * absorbs everything else (underbody, structure).
 */
export const ZoneIdSchema = z.enum(['bonnet', 'boot', 'left', 'right', 'roof', 'chassis'])

export type ZoneId = z.infer<typeof ZoneIdSchema>

/**
 * The five zones that carry a swappable panel part - `chassis` has no panel
 * to remove or fit (the pipeline's "swap panel" stage is never available on
 * it), so it is excluded here.
 */
export const PanelZoneIdSchema = ZoneIdSchema.exclude(['chassis'])

export type PanelZoneId = z.infer<typeof PanelZoneIdSchema>
