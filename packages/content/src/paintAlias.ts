import { z } from 'zod'

/**
 * A manufacturer's name for a manufacturer's colour: the same palette ramp
 * carries different iconic names on different cars (`blue-deep` is Bayside
 * Blue on an R34 and Montego Blue on an FD3S), so the alias binds a real name
 * (behind the naming-layer flag), a parody name (in front of it), a palette
 * `colourId`, and the roster cars that carried it, rather than the palette
 * entry carrying a second name of its own.
 *
 * `realName` keeps any paint code or finish qualifier the source gives it
 * (for example "Bayside Blue (TV2)", "Passion Red (solid)") exactly as
 * written: that detail is a fact about the real colour and belongs behind the
 * flag with it. `id` is a kebab-case slug of the real name with that
 * parenthetical dropped.
 *
 * `colourId` is written in the same form a car's `spec.factoryColours` entry
 * takes: a palette id, or two ids joined by `+` for a factory two-tone. The
 * two forms are distinct names on the same car, which is why the match has to
 * be on the whole entry rather than on its first half. An AE86 was sold both
 * in plain white and in the white-over-black panda scheme, and only the
 * second of those is High-Tech Two-Tone.
 */
export const PaintAliasSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  realName: z.string().min(1),
  parodyName: z.string().min(1),
  colourId: z
    .string()
    .regex(/^[a-z0-9-]+(\+[a-z0-9-]+)?$/, 'a colour is a palette id, or two ids joined by +'),
  /**
   * The roster row uid(s) this colour was seen on, never a roster number: the
   * roster is ordered by price, so inserting one car renumbers every row
   * below it and would silently move an iconic name onto the wrong car,
   * while a uid is assigned once and never reused.
   */
  cars: z
    .array(z.string().regex(/^MG-\d{3}$/, 'a car is a roster uid, MG- followed by three digits'))
    .min(1),
})

export const PaintAliasesSchema = z.array(PaintAliasSchema).min(1)

export type PaintAlias = z.infer<typeof PaintAliasSchema>
