import { z } from 'zod'

/**
 * The named groupings the 34-colour palette falls into: which whites read as
 * the same white, which silvers as the same silver, and so on. A generated
 * car's mismatched or primed panel picks its wrong shade from within the
 * car's own family, so a badly repaired panel reads as the wrong white
 * rather than a random colour. An enum rather than a bare string, so a
 * typo cannot silently create a family of one with no near neighbour to
 * offer.
 */
export const PaintColourFamilySchema = z.enum([
  'Whites and silvers',
  'Greys and blacks',
  'Earths',
  'Reds',
  'Warm brights',
  'Greens',
  'Blue-greens',
  'Blues',
  'Purples',
])

export type PaintColourFamily = z.infer<typeof PaintColourFamilySchema>

/**
 * One of the 34 factory-consolidated tones the workshop's `paint` stage can
 * lay down: an id, the name shown on the tin, the art brief (`shade`) that
 * tone was derived from, the swatch hex the UI renders, and the family it
 * groups with. A colour is the base tone a four-tone sprite ramp is derived
 * from, not just a choice of finish - finish (solid, metallic, pearl) is
 * carried per pool entry, not per palette entry, because the same tone ships
 * as different finishes on different cars. Pure vocabulary either way: no
 * price and no stat effect, since the paint stage's cost comes from its
 * material SKU (`materials.json`).
 *
 * `hex` is pinned to lowercase six-digit form because a malformed colour
 * renders as a broken swatch rather than failing loudly: this schema is the
 * only place that can catch it.
 */
export const PaintColourSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  shade: z.string().min(1),
  hex: z
    .string()
    .regex(/^#[0-9a-f]{6}$/, 'hex is a lowercase six-digit colour, for example #1f2b4d'),
  family: PaintColourFamilySchema,
})

export const PaintColoursSchema = z.array(PaintColourSchema).min(1)

export type PaintColour = z.infer<typeof PaintColourSchema>
