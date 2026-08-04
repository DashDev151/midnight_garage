import type { RouteLocationRaw } from 'vue-router'

/**
 * Where a screen's own back control returns to, when that screen is reached
 * two ways: a map click (or a garage-room action) on one hand, the
 * persistent tab bar on the other. `overworldNav.ts`'s `destinationFor`
 * attaches a `from` query flag to a map-originated navigation - `overworld`
 * for a direct map click, or a garage room id for an action launched from
 * `GarageInteriorScreen.vue` - and this is the one place that flag is read
 * back. A tab-originated navigation carries no such flag, so it falls
 * through to `fallback`: whatever the screen returned to before this
 * feature existed.
 */
export function mapBackTarget(fromQuery: unknown, fallback: RouteLocationRaw): RouteLocationRaw {
  if (fromQuery === 'overworld') return { name: 'overworld' }
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return { name: 'garage-interior', query: { room: fromQuery } }
  }
  return fallback
}
