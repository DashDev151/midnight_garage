import type { StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeServiceBayIncomeYen } from '../src/serviceBay'

const staffMember = (hustle: number): StaffMember => ({
  id: `staff-${hustle}`,
  displayName: 'Test Mechanic',
  stats: { engine: 1, chassis: 1, body: 1, hustle },
  weeklyWageYen: 40_000,
  trait: 'perfectionist',
})

describe('computeServiceBayIncomeYen', () => {
  it('is 0 with no staff', () => {
    expect(computeServiceBayIncomeYen([], 'unknown')).toBe(0)
  })

  it('scales with staff Hustle', () => {
    const oneHustle = computeServiceBayIncomeYen([staffMember(1)], 'unknown')
    const fiveHustle = computeServiceBayIncomeYen([staffMember(5)], 'unknown')
    expect(fiveHustle).toBeGreaterThan(oneHustle)
  })

  it('scales with reputation tier', () => {
    const unknown = computeServiceBayIncomeYen([staffMember(3)], 'unknown')
    const legend = computeServiceBayIncomeYen([staffMember(3)], 'legend')
    expect(legend).toBeGreaterThan(unknown)
  })
})
