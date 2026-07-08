/**
 * The one place currency is formatted for display. Era-authentic yen: the
 * yen sign, thousands separators, no decimal places (1995 Japan didn't
 * price used cars to the sen). A leading minus sits outside the sign
 * (-Y90,000, not Y-90,000) so money-loss deltas read naturally.
 */
export function formatYen(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  return `${sign}¥${Math.abs(rounded).toLocaleString('en-US')}`
}

/** Same, but always shows an explicit +/- for a change (day-over-day cash deltas). */
export function formatYenDelta(value: number): string {
  const rounded = Math.round(value)
  if (rounded === 0) return `¥0`
  const sign = rounded < 0 ? '-' : '+'
  return `${sign}¥${Math.abs(rounded).toLocaleString('en-US')}`
}
