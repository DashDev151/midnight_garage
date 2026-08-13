import type { RouteLocationRaw } from 'vue-router'

/**
 * Where a screen's own back control returns to, when that screen is reached
 * two ways: a map click on one hand, the persistent tab bar on the other.
 * `overworldNav.ts`'s `destinationFor` attaches a `from: 'overworld'` query
 * flag to a map-originated navigation, and this is the one place that flag is
 * read back. A navigation carrying no such flag falls through to `fallback`:
 * whatever the screen returned to before this feature existed. Any other
 * `from` value is a dead flag from a door that no longer exists (the garage
 * interior's rooms), read as no flag at all.
 */
export function mapBackTarget(fromQuery: unknown, fallback: RouteLocationRaw): RouteLocationRaw {
  if (fromQuery === 'overworld') return { name: 'overworld' }
  return fallback
}
