import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'

const EMPTY_ACTIONS = {
  createJobs: [],
  laborAssignments: [],
  buyoutLots: [],
  acceptOffers: [],
  setForSale: [],
  buyParts: [],
  scrapParts: [],
  removeParts: [],
  acceptServiceJobs: [],
  moveCars: [],
  buyBays: [],
  upgradeToolLines: [],
}

describe('DayActionsSchema', () => {
  it('defaults every action list to empty', () => {
    const parsed = DayActionsSchema.parse({})
    expect(parsed).toEqual(EMPTY_ACTIONS)
  })

  it('accepts a full day of actions', () => {
    const input = {
      ...EMPTY_ACTIONS,
      createJobs: [
        {
          carInstanceId: 'car-0001',
          kind: 'repair-zone',
          componentId: 'body',
          targetBand: 'mint',
          laborSlotsRequired: 3,
        },
      ],
      laborAssignments: [{ jobId: 'job-1', laborSlots: 2 }],
      buyoutLots: [{ lotId: 'lot-1' }],
      scrapParts: [{ partInstanceId: 'pi-0004' }],
      removeParts: [{ carInstanceId: 'car-0001', carPartId: 'dampers' }],
      acceptOffers: [{ carInstanceId: 'car-0002' }],
      setForSale: [{ carInstanceId: 'car-0003', forSale: true }],
    }
    expect(DayActionsSchema.parse(input)).toEqual(input)
  })

  it('rejects a negative labor slot count', () => {
    const input = { laborAssignments: [{ jobId: 'job-1', laborSlots: -1 }] }
    expect(DayActionsSchema.safeParse(input).success).toBe(false)
  })
})
