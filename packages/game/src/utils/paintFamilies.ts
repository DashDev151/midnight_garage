import { PAINT_COLOURS, type PaintColour } from '@midnight-garage/content'

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
