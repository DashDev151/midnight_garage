/**
 * What an operation costs, in the words both rooms use.
 *
 * The machine shop quotes a loose part and the car's own panel quotes a fitted
 * one, so the same two figures are read in two places. They are worded once
 * here, so a quote at the bench and a quote on the car can never state the
 * same cost differently.
 */

/**
 * What an operation costs in originality, on the authenticity stat's own
 * 0 to 100 scale.
 *
 * The content values are fractions of a point, so the figure is shown to the
 * precision it actually carries rather than padded out: 0.25 reads as 0.25 and
 * 0.7 as 0.7. Exactly nothing is not a penalty and does not render as one -
 * that is what an operation on an aftermarket part costs (the slot's
 * originality is already spent), and what an operation authored to take
 * nothing costs on any part.
 */
export function formatAuthenticityCost(points: number): string {
  return points > 0 ? `-${Number(points.toFixed(2))}` : 'nothing'
}

/** The share of a car's own reliability base an operation takes, as a
 * percentage. One decimal, because the content values are fractions of a per
 * cent and a whole number would round every one of them to zero. */
export function formatReliabilityCost(fraction: number): string {
  return `-${(fraction * 100).toFixed(1)} per cent`
}
