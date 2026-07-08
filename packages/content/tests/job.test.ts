import { describe, expect, it } from 'vitest'
import { JobSchema } from '../src'

describe('JobSchema', () => {
  it('accepts a valid repair-zone job', () => {
    const job = {
      id: 'job-0001',
      carInstanceId: 'car-0001',
      kind: 'repair-zone',
      zone: 'body',
      laborSlotsRequired: 3,
      laborSlotsSpent: 1,
    }
    expect(JobSchema.parse(job)).toEqual(job)
  })

  it('accepts a valid install-part job', () => {
    const job = {
      id: 'job-0002',
      carInstanceId: 'car-0001',
      kind: 'install-part',
      slot: 'suspension',
      partInstanceId: 'pi-0002',
      laborSlotsRequired: 1,
      laborSlotsSpent: 0,
    }
    expect(JobSchema.parse(job)).toEqual(job)
  })

  it('rejects a repair-zone job with no zone', () => {
    const job = {
      id: 'job-0003',
      carInstanceId: 'car-0001',
      kind: 'repair-zone',
      laborSlotsRequired: 3,
    }
    expect(JobSchema.safeParse(job).success).toBe(false)
  })

  it('rejects an install-part job missing slot or partInstanceId', () => {
    const job = {
      id: 'job-0004',
      carInstanceId: 'car-0001',
      kind: 'install-part',
      slot: 'suspension',
      laborSlotsRequired: 1,
    }
    expect(JobSchema.safeParse(job).success).toBe(false)
  })

  it('rejects laborSlotsSpent greater than laborSlotsRequired', () => {
    const job = {
      id: 'job-0005',
      carInstanceId: 'car-0001',
      kind: 'repair-zone',
      zone: 'engine',
      laborSlotsRequired: 2,
      laborSlotsSpent: 3,
    }
    expect(JobSchema.safeParse(job).success).toBe(false)
  })
})
