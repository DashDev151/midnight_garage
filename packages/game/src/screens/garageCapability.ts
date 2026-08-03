import type { EconomyConfig, GameState } from '@midnight-garage/content'
import { bodyLineCapability } from '@midnight-garage/sim'

/**
 * Which garage rooms render derelict: a room is somebody else's junk until
 * the capability its work needs is actually owned, read off the exact same
 * state the real work already gates on rather than a second,
 * room-specific flag.
 *
 * The machine shop's gate is the machining tool-tier check itself
 * (`machiningGateReason`, sim/machiningJobs.ts): the engine line's top rung
 * is what buys the means of production, and hiring the line for a day does
 * NOT open it - only owning it does, which is why this reads `toolTiers`
 * directly rather than `hasMachineLineFor` (that also counts a same-day
 * hire, which is correct for the body line below but wrong here).
 */
export function machineShopOpen(gameState: GameState, economy: EconomyConfig): boolean {
  return gameState.toolTiers.engine >= economy.machining.minEngineToolTier
}

/**
 * The body and paint shop's gate is `bodyLineCapability`'s own `unlocked`
 * flag (sim/stagedWork.ts) - tier 2 of the body line owned outright, or
 * hired for today, exactly what actually unlocks welding and the better
 * paint finish. Hiring the line for the day genuinely opens the room for
 * that day, unlike the machine shop above.
 */
export function bodyPaintShopOpen(gameState: GameState): boolean {
  return bodyLineCapability(gameState).unlocked
}
