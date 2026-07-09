import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'

const EMPTY_ACTIONS = {
  createJobs: [],
  laborAssignments: [],
  bidsOnLots: [],
  buyoutLots: [],
  inspectLots: [],
  sellViaWalkIn: [],
  listForSale: [],
  buyParts: [],
  acceptServiceJobs: [],
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
        { carInstanceId: 'car-0001', kind: 'repair-zone', zone: 'body', laborSlotsRequired: 3 },
      ],
      laborAssignments: [{ jobId: 'job-1', laborSlots: 2 }],
      bidsOnLots: [{ lotId: 'lot-1', maxBidYen: 500_000 }],
      inspectLots: [{ lotId: 'lot-2' }],
      sellViaWalkIn: [{ carInstanceId: 'car-0002' }],
      listForSale: [{ carInstanceId: 'car-0003', waitDays: 5 }],
    }
    expect(DayActionsSchema.parse(input)).toEqual(input)
  })

  it('rejects a negative labor slot count', () => {
    const input = { laborAssignments: [{ jobId: 'job-1', laborSlots: -1 }] }
    expect(DayActionsSchema.safeParse(input).success).toBe(false)
  })
})
