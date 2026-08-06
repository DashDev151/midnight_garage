import type { WorkStation } from '@midnight-garage/sim'

/**
 * Where a part is, in the words the shop uses for it: the bench on the
 * workshop floor, the machine in the machine shop. One phrase drives every
 * sentence about a station - the room's own empty line, its carry-it-over
 * control, and the whereabouts marker the warehouse list shows - so the two
 * rooms can never end up naming the same place two ways.
 */
export const WORK_STATION_WHERE: Readonly<Record<WorkStation, string>> = {
  workbench: 'on the bench',
  machine: 'on the machine',
}
