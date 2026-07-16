/**
 * "valve-seals" -> "Valve seals" - the plain, honest fallback label for
 * content that has no player-facing name of its own yet (Sprint 73's
 * symptom causes: an id, never a dedicated display string). Shared by the
 * lot card's cause checklist (`gameStore.ts`) and the day-log reveal line
 * (`dayLogFormat.ts`) so both read the identical label for the same cause.
 */
export function titleCaseFromSlug(slug: string): string {
  const [first, ...rest] = slug.split('-')
  if (!first) return slug
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ')
}
