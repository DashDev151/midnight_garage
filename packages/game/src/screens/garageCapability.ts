import type { GameState } from '@midnight-garage/content'
import { bodyLineCapability, type SimContext } from '@midnight-garage/sim'

/**
 * Whether the body and paint shop renders derelict: a room is somebody else's
 * junk until the capability its work needs is actually owned, read off the
 * exact same state the real work already gates on rather than a second,
 * room-specific flag.
 *
 * That state is `bodyLineCapability`'s own `unlocked` flag (sim/stagedWork.ts) -
 * tier 2 of the body line owned outright, or hired for today, exactly what
 * unlocks welding and the better paint finish. Hiring the line for the day
 * genuinely opens the room for that day.
 *
 * The machine shop has no room gate of its own: it is always enterable, and
 * what it holds is equipment per tool line (`machineShopEquipment.ts`).
 */
export function bodyPaintShopOpen(gameState: GameState, context: SimContext): boolean {
  return bodyLineCapability(gameState, context).unlocked
}
