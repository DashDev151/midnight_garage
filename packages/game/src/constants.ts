/**
 * Game-layer display/UX constants. The labor-cost heuristics are sim
 * mechanics (used by both the game store and the balance bots), so they live
 * in @midnight-garage/sim and are re-exported here for the game layer's
 * existing import sites.
 */
export { INSTALL_LABOR_SLOTS } from '@midnight-garage/sim'

/**
 * Power is raw PS (unbounded); the radar maps it onto a 0-1 spoke against
 * this reference ceiling so all five axes are comparable. Display-only.
 */
export const RADAR_POWER_REFERENCE_PS = 500
