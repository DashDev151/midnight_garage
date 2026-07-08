import { describe, expect, it } from 'vitest'
import { DayActionsSchema } from '../src/actions'

describe('DayActionsSchema', () => {
  it('defaults to empty createJobs/laborAssignments', () => {
    const parsed = DayActionsSchema.parse({})
    expect(parsed).toEqual({ createJobs: [], laborAssignments: [] })
  })

  it('accepts a full day of actions', () => {
    const input = {
      createJobs: [
        { carInstanceId: 'car-0001', kind: 'repair-zone', zone: 'body', laborSlotsRequired: 3 },
      ],
      laborAssignments: [{ jobId: 'job-1', laborSlots: 2 }],
    }
    expect(DayActionsSchema.parse(input)).toEqual(input)
  })

  it('rejects a negative labor slot count', () => {
    const input = { laborAssignments: [{ jobId: 'job-1', laborSlots: -1 }] }
    expect(DayActionsSchema.safeParse(input).success).toBe(false)
  })
})
