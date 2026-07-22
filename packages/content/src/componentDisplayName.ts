import { z } from 'zod'
import type { ComponentId } from './tags'

/**
 * Player-facing display name per component id. The raw ComponentId must never
 * reach player copy directly - this is the one place that maps it to real
 * words, so every screen and every store label goes through it instead of
 * interpolating the id.
 */
export const ComponentDisplayNamesSchema = z.object({
  engine: z.string().min(1),
  drivetrain: z.string().min(1),
  suspension: z.string().min(1),
  wheels: z.string().min(1),
  body: z.string().min(1),
  interior: z.string().min(1),
})

export type ComponentDisplayNames = z.infer<typeof ComponentDisplayNamesSchema>

export function componentDisplayName(id: ComponentId, displayNames: ComponentDisplayNames): string {
  return displayNames[id]
}
