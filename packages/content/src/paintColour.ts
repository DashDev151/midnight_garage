import { z } from 'zod'

/**
 * One colour the workshop's `paint` stage can lay down: an id, the name shown
 * on the tin, and the swatch the UI renders. Pure vocabulary, no price and no
 * stat effect - the paint stage's cost comes from its material SKU
 * (`materials.json`), so a colour is a choice of finish and nothing more.
 *
 * `hex` is pinned to lowercase six-digit form because a malformed colour
 * renders as a broken swatch rather than failing loudly: this schema is the
 * only place that can catch it.
 */
export const PaintColourSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  hex: z
    .string()
    .regex(/^#[0-9a-f]{6}$/, 'hex is a lowercase six-digit colour, for example #1f2b4d'),
})

export const PaintColoursSchema = z.array(PaintColourSchema).min(1)

export type PaintColour = z.infer<typeof PaintColourSchema>
