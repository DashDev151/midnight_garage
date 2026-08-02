import type { EngineCharacter, Subsystem } from '@midnight-garage/content'

/**
 * The dyno's copy - the one place the rolling road's words live. The sim
 * emits subsystem ids, an engine character and exact numbers; the screen
 * renders them through this file and never derives a figure of its own.
 */

/** The workshop's own name for the rolling road, used everywhere it is
 * bought, hired or run so the player meets one object with one name. */
export const DYNO_NAME = 'Rolling road'

/** What each subsystem is, in the words a mechanic would use for it. */
export const SUBSYSTEM_LABELS: Record<Subsystem, string> = {
  cylinderPressure: 'Bottom end',
  fuelling: 'Fuelling',
  heat: 'Cooling',
  revs: 'Head and revs',
  torqueTransmission: 'Drivetrain',
}

/** How each subsystem's ratio should be read - what the number is measuring,
 * so a player meets a reason rather than five bare decimals. */
export const SUBSYSTEM_MEANINGS: Record<Subsystem, string> = {
  cylinderPressure: 'what the block and internals will hold',
  fuelling: 'what the fuel system will feed',
  heat: 'what the cooling will shed',
  revs: 'what the head will take',
  torqueTransmission: 'what the clutch and driveline will carry',
}

/** An engine's response character in two or three words. */
export const ENGINE_CHARACTER_LABELS: Record<EngineCharacter, string> = {
  forced: 'Forced induction',
  'high-strung-na': 'High-strung, naturally aspirated',
  'lazy-na': 'Lazy, naturally aspirated',
}

/**
 * What that character means for tuning it - the sentence a dyno operator
 * would actually say, and the reason the reading is worth a labour slot.
 */
export const ENGINE_CHARACTER_NOTES: Record<EngineCharacter, string> = {
  forced: 'Boost answers to hardware. Ask it for more and the rest of the engine has to keep up.',
  'high-strung-na':
    'It already works hard for what it makes. There is less left on the table than the badge suggests.',
  'lazy-na':
    'Long-legged and under-stressed. There is room here, and it takes the work reasonably well.',
}

/** What the support headline's band means, said plainly. */
export const SUPPORT_BAND_LABELS: Record<'adequate' | 'strained' | 'dangerous', string> = {
  adequate: 'Holds together',
  strained: 'Strained',
  dangerous: 'Asking for trouble',
}
