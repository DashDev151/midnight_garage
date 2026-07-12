import type { DayLogEntry } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { describeLogEntry } from './dayLogFormat'

// One representative of every DayLogEntry variant - guards the exhaustive
// switch so a new/renamed entry type surfaces here rather than as a blank line.
const SAMPLES: DayLogEntry[] = [
  { type: 'rent-paid', amountYen: -90_000 },
  { type: 'wage-paid', staffId: 'staff-1', amountYen: -45_000 },
  { type: 'job-created', jobId: 'job-1', carInstanceId: 'car-1', kind: 'repair-zone' },
  { type: 'job-progress', jobId: 'job-1', laborSlotsSpent: 2 },
  { type: 'job-completed', jobId: 'job-1', carInstanceId: 'car-1', kind: 'repair-zone' },
  { type: 'job-blocked', jobId: 'job-1', reason: 'slot-occupied' },
  { type: 'labor-overbooked', requestedSlots: 4, availableSlots: 2 },
  { type: 'service-bay-income', amountYen: 20_000 },
  { type: 'market-heat-shift', modelId: 'honda-city-e-aa', deltaPercent: -3 },
  { type: 'auction-catalog-refreshed', tier: 'local-yard', lotCount: 3 },
  { type: 'auction-bid-placed', lotId: 'lot-1', maxBidYen: 110_000 },
  { type: 'auction-outbid', lotId: 'lot-1', newBidYen: 140_000 },
  { type: 'auction-bid-won', lotId: 'lot-1', finalPriceYen: 120_000 },
  { type: 'auction-bid-lost', lotId: 'lot-1', winningPriceYen: 130_000 },
  { type: 'lot-bought-out', lotId: 'lot-1', priceYen: 240_000 },
  {
    type: 'offer-received',
    carInstanceId: 'car-1',
    modelId: 'honda-city-e-aa',
    buyerId: 'tuner',
    priceYen: 200_000,
  },
  { type: 'car-sold', carInstanceId: 'car-1', channel: 'walk-in-offer', priceYen: 180_000 },
  { type: 'part-bought', partId: 'khs-street-ecu', partInstanceId: 'part-7-0', priceYen: 60_000 },
  { type: 'part-scrapped', partInstanceId: 'part-7-0', priceYen: 4_000 },
  {
    type: 'part-removed',
    carInstanceId: 'car-1',
    carPartId: 'dampers',
    partInstanceId: 'part-8-0',
  },
  { type: 'service-job-accepted', jobId: 'svc-1', carInstanceId: 'car-1' },
  { type: 'service-job-completed', jobId: 'svc-1', payoutYen: 42_000, reputationGained: 4 },
]

describe('describeLogEntry', () => {
  it('renders every entry type as a non-empty string', () => {
    for (const entry of SAMPLES) {
      const line = describeLogEntry(entry)
      expect(line.length).toBeGreaterThan(0)
    }
  })

  it('formats yen amounts and resolves model names via the supplied resolver', () => {
    const rent = describeLogEntry({ type: 'rent-paid', amountYen: -90_000 })
    expect(rent).toContain('¥90,000')

    const heat = describeLogEntry(
      { type: 'market-heat-shift', modelId: 'm1', deltaPercent: 5 },
      (id) => (id === 'm1' ? 'Test Car' : id),
    )
    expect(heat).toContain('Test Car')
    expect(heat).toContain('+5%')
  })

  it('renders the Sprint 20 overnight-outbid beat with the new board price', () => {
    const line = describeLogEntry({ type: 'auction-outbid', lotId: 'lot-1', newBidYen: 1_240_000 })
    expect(line).toContain('Outbid')
    expect(line).toContain('¥1,240,000')
  })

  it('Sprint 25 task 2: accepting a service job reads as the customer, not a raw car id', () => {
    const line = describeLogEntry({
      type: 'service-job-accepted',
      jobId: 'svc-1',
      carInstanceId: 'car-1',
    })
    expect(line).toBe("Thanks - I'll drop it off first thing in the morning.")
    expect(line).not.toContain('car-1')
  })

  it('Sprint 31 decision 5: an offer reads as a person naming the car, resolving both buyer and model', () => {
    const line = describeLogEntry(
      {
        type: 'offer-received',
        carInstanceId: 'car-1',
        modelId: 'm1',
        buyerId: 'tuner',
        priceYen: 1_240_000,
      },
      (id) => (id === 'm1' ? 'FC' : id),
      (id) => (id === 'tuner' ? 'Tuner' : id),
    )
    expect(line).toBe('A tuner is offering ¥1,240,000 for the FC. Today only.')
  })
})
