/**
 * "valve-seals" -> "Valve seals" - the plain, honest fallback label for
 * content that has no player-facing name of its own yet (Sprint 73's symptom
 * causes: an id, never a dedicated display string). Lives in content (moved
 * from `packages/game` in Sprint 75) since `packages/sim`'s own sale-reveal
 * copy (`resolveSellViaWalkIn`, decision 2) needs the identical label the lot
 * card's cause checklist and the day-log reveal line already use - one
 * shared, dependency-free utility rather than a second implementation on
 * either side of the sim/game boundary.
 */
export function titleCaseFromSlug(slug: string): string {
  const [first, ...rest] = slug.split('-')
  if (!first) return slug
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ')
}
