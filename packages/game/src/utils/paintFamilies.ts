import {
  PAINT_ALIASES,
  PAINT_COLOURS,
  resolvePaintColourName,
  type PaintColour,
} from '@midnight-garage/content'

export interface PaintColourFamilyGroup {
  label: string
  colours: PaintColour[]
}

/**
 * The 34-colour palette grouped by its own `family` field, both the grouping
 * and each group's member order following `PAINT_COLOURS`'s own order - so a
 * family list reads identically to the palette itself. Shared by every screen
 * that lists the palette (the paint dev screen, the car detail screen's
 * respray picker), computed once rather than per screen.
 */
export const PAINT_COLOUR_FAMILIES: readonly PaintColourFamilyGroup[] = (() => {
  const byFamily = new Map<string, PaintColour[]>()
  for (const colour of PAINT_COLOURS) {
    const members = byFamily.get(colour.family) ?? []
    members.push(colour)
    byFamily.set(colour.family, members)
  }
  return [...byFamily.entries()].map(([label, colours]) => ({ label, colours }))
})()

/**
 * A stored colour token - a single palette id, or two joined with `+` for a
 * factory two-tone - as the name a player reads. Prefers a car's own iconic
 * manufacturer name (`PAINT_ALIASES`, matched on the whole token and the
 * model's `uid`) and falls back to the palette's plain name(s), joined for a
 * two-tone, so an unresearched or unknown id still reads as something rather
 * than vanishing. Shared by every screen that names a colour off a token
 * (the car detail screen's zone paint, an auction lot's factory colour line).
 */
export function colourTokenDisplayName(token: string, uid?: string): string {
  const alias = uid
    ? PAINT_ALIASES.find((a) => a.colourId === token && a.cars.includes(uid))
    : undefined
  if (alias) return resolvePaintColourName(alias)
  return token
    .split('+')
    .map((id) => PAINT_COLOURS.find((c) => c.id === id)?.name ?? id)
    .join(' and ')
}
