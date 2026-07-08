/**
 * Game-layer display/UX constants. Provisional (like Sprint 04's design
 * tokens) — the labor-cost heuristics below are a fast PoC stand-in for a
 * real per-job cost that belongs in content JSON once the job taxonomy
 * firms up (tracked in TODO.md). They do not change any sim number; the
 * sim's completeJob applies a finished job regardless of its slot cost.
 */

/**
 * Labor-slots a zone repair costs, scaled by how damaged the zone is so a
 * badly hurt zone can span multiple days against the daily slot budget
 * (making the labor-scarcity tension visible). A stock 2-slot day clears a
 * lightly damaged zone same-day; a wrecked one takes two.
 */
export function repairLaborSlotsFor(conditionPercent: number): number {
  return Math.max(1, Math.ceil((100 - conditionPercent) / 30))
}

/** A bolt-on install is a single-slot job for now. */
export const INSTALL_LABOR_SLOTS = 1

/**
 * Power is raw PS (unbounded); the radar maps it onto a 0-1 spoke against
 * this reference ceiling so all five axes are comparable. Display-only.
 */
export const RADAR_POWER_REFERENCE_PS = 500
