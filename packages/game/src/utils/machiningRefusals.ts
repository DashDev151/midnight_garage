import type { FittedMachiningGateReason, MachiningGateReason } from '@midnight-garage/sim'

/**
 * Why an operation is refused, in the words the shop uses.
 *
 * Two rooms ask, because an operation is either done to a loose part at the
 * machine or to the assembled car, and each has refusals the other cannot
 * have. The checks they share are worded once below, so the machine shop and
 * the car can never explain the same gate two different ways.
 */

const TOOL_TIER = 'Needs the shop that covers the tool line this job uses.'
const ALREADY_APPLIED = 'Already done, and it does not un-do.'

/** The machine shop's own refusals, about the part sitting on the machine. */
export const MACHINE_SHOP_REFUSALS: Readonly<Record<MachiningGateReason, string>> = {
  'not-found': 'Nothing on the machine.',
  'not-on-machine': 'Not on the machine. Carry it over from the warehouse first.',
  'tool-tier': TOOL_TIER,
  'unknown-operation': 'Not a job this shop does.',
  'wrong-slot': 'That cut is meant for a different part.',
  'not-mint': 'The machine wants a healthy part. Recondition it on the workbench first.',
  'already-applied': ALREADY_APPLIED,
}

/**
 * Setup work is done to the whole car, so its refusals are about the car and
 * the slot rather than about what is on the machine. `no-car` carries no
 * words: a car that cannot be resolved never renders a row to explain itself
 * on, exactly as the dyno's own `not-found` does not.
 */
export const SETUP_REFUSALS: Readonly<Record<FittedMachiningGateReason, string | null>> = {
  'no-car': null,
  'not-in-service-bay': 'Roll it into a service bay first - this is done to the whole car.',
  'slot-empty': 'Nothing fitted there to set up.',
  'unknown-operation': 'Not a job done on the car.',
  'tool-tier': TOOL_TIER,
  'not-mint': 'Get the part to mint first. There is no point setting up worn hardware.',
  'already-applied': ALREADY_APPLIED,
}
