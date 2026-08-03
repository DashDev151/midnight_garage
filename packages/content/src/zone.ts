import { z } from 'zod'

/**
 * The six zones carrying sheet metal (docs/design/systems/workshop-rework.md's
 * model section) - the bonnet, the boot, and the four corners, and nothing
 * that is trim. These are the only zones the pipeline's metal-only stages
 * (`beat`, `weld`, `fillAndSand`) ever touch.
 */
export const MetalZoneIdSchema = z.enum([
  'bonnet',
  'boot',
  'left-front',
  'left-rear',
  'right-front',
  'right-rear',
])

export type MetalZoneId = z.infer<typeof MetalZoneIdSchema>

/**
 * The three trim zones - the two bumpers and the sideskirts - moulded rather
 * than pressed, so they carry no metal severity of their own and never see a
 * beat, a weld, or a fill: only strip/prep, prime, paint and polish apply.
 */
export const TrimZoneIdSchema = z.enum(['front-bumper', 'rear-bumper', 'skirts'])

export type TrimZoneId = z.infer<typeof TrimZoneIdSchema>

/**
 * Every zone a car's zone state is keyed by, metal and trim together - the
 * work model's own addressing granularity for metal/surface/finish, one
 * level below the derived `panels`/`paint` parts the value model still
 * reads. `chassis` is not a zone: it is a normal car part, grouped with the
 * rest of the body in `parts-taxonomy.json`, repaired like any other part
 * rather than through the zone pipeline.
 */
export const ZoneIdSchema = z.enum([
  'bonnet',
  'boot',
  'left-front',
  'left-rear',
  'right-front',
  'right-rear',
  'front-bumper',
  'rear-bumper',
  'skirts',
])

export type ZoneId = z.infer<typeof ZoneIdSchema>

/**
 * Every zone carries a swappable panel part, so this is `ZoneIdSchema` under
 * its own name for a caller that means "which zone is this panel for" -
 * kept distinct because it used to differ (`chassis` had no panel to fit);
 * now every zone does.
 */
export const PanelZoneIdSchema = ZoneIdSchema

export type PanelZoneId = z.infer<typeof PanelZoneIdSchema>
