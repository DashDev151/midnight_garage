import type { DayLogEntry } from '@midnight-garage/content'
import { PARTS, PARTS_TAXONOMY, TOOL_LINES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { classifyDayReport, describeLogEntry } from './dayLogFormat'

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
  { type: 'contract-income', amountYen: 20_000 },
  { type: 'market-heat-shift', modelId: 'honda-city-e-aa', deltaPercent: -3 },
  { type: 'auction-catalog-refreshed', tier: 'local-yard', lotCount: 3 },
  {
    type: 'auction-hammer-won',
    lotId: 'lot-1',
    priceYen: 120_000,
    modelId: 'honda-city-e-aa',
    year: 1984,
  },
  {
    type: 'lot-bought-out',
    lotId: 'lot-1',
    priceYen: 240_000,
    modelId: 'honda-city-e-aa',
    year: 1984,
  },
  {
    type: 'offer-received',
    carInstanceId: 'car-1',
    modelId: 'honda-city-e-aa',
    buyerId: 'tuner',
    priceYen: 200_000,
  },
  {
    type: 'car-sold',
    carInstanceId: 'car-1',
    channel: 'walk-in-offer',
    priceYen: 180_000,
    profitYen: 25_000,
  },
  { type: 'part-bought', partId: 'khs-street-ecu', partInstanceId: 'part-7-0', priceYen: 60_000 },
  { type: 'part-scrapped', partInstanceId: 'part-7-0', priceYen: 4_000 },
  {
    type: 'part-removed',
    carInstanceId: 'car-1',
    carPartId: 'dampers',
    partInstanceId: 'part-8-0',
  },
  { type: 'service-job-accepted', jobId: 'svc-1', carInstanceId: 'car-1' },
  {
    type: 'service-job-completed',
    jobId: 'svc-1',
    payoutYen: 42_000,
    reputationGained: 4,
    repairCostYen: 8_000,
    partsCostYen: 0,
    netProfitYen: 34_000,
  },
  {
    type: 'service-job-failed',
    jobId: 'svc-2',
    repairCostYen: 5_000,
    partsCostYen: 0,
    netProfitYen: -5_000,
  },
  // `tire-machine` is a stale equipmentId, kept only so this covers old-log
  // decode; `equipment-purchased` is live again for the two-post lift (its
  // own case is below, under `describeLogEntry`).
  { type: 'equipment-purchased', equipmentId: 'tire-machine', priceYen: 250_000 },
  { type: 'tool-upgraded', componentId: 'wheels', toTier: 2, priceYen: 150_000 },
  { type: 'machine-hired', componentId: 'body', priceYen: 14_000 },
  { type: 'lift-hired', priceYen: 5_000 },
  { type: 'mission-accepted', missionId: 'test-mission-a' },
  {
    type: 'mission-delivered',
    missionId: 'test-mission-a',
    payoutYen: 200_000,
    tipYen: 0,
    reputationGained: 20,
  },
  { type: 'scene-commission-accepted', scene: 'tuner' },
  {
    type: 'scene-commission-delivered',
    scene: 'tuner',
    carInstanceId: 'car-1',
    payoutYen: 900_000,
  },
  { type: 'staff-ads-refreshed', count: 3 },
  {
    type: 'staff-hired',
    staffId: 's1',
    displayName: 'Mori Kenji',
    weeklyWageYen: 14_000,
    introFeeYen: 28_000,
  },
  {
    type: 'staff-hired',
    staffId: 's2',
    displayName: 'Sato Rei',
    weeklyWageYen: 12_000,
    introFeeYen: 0,
  },
  { type: 'staff-dismissed', staffId: 's1', displayName: 'Mori Kenji' },
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

  it('won/bought-out entries name the car (year + resolved model), never a raw lot id', () => {
    const resolveModelName = (id: string) => (id === 'm1' ? 'Test Car' : id)

    const won = describeLogEntry(
      {
        type: 'auction-hammer-won',
        lotId: 'lot-1',
        priceYen: 120_000,
        modelId: 'm1',
        year: 1984,
      },
      resolveModelName,
    )
    expect(won).toBe('Won the 1984 Test Car for ¥120,000')
    expect(won).not.toContain('lot-1')

    const boughtOut = describeLogEntry(
      { type: 'lot-bought-out', lotId: 'lot-1', priceYen: 240_000, modelId: 'm1', year: 1987 },
      resolveModelName,
    )
    expect(boughtOut).toBe('Bought the 1987 Test Car for ¥240,000')
    expect(boughtOut).not.toContain('lot-1')
  })

  it('accepting a service job reads as the customer, not a raw car id', () => {
    const line = describeLogEntry({
      type: 'service-job-accepted',
      jobId: 'svc-1',
      carInstanceId: 'car-1',
    })
    expect(line).toBe("Thanks - I'll drop it off first thing in the morning.")
    expect(line).not.toContain('car-1')
  })

  it('an offer reads as a person naming the car, resolving both buyer and model', () => {
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

  it('a sale with a known profit shows "profit +Y..." (or a loss with a minus sign)', () => {
    const gain = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
      profitYen: 40_000,
    })
    expect(gain).toContain('profit +¥40,000')

    const loss = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
      profitYen: -20_000,
    })
    expect(loss).toContain('profit -¥20,000')
  })

  it('Sprint 42: a sale with no profitYen (unknown purchase) omits the profit clause entirely', () => {
    const line = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
    })
    expect(line).not.toContain('profit')
  })

  it('Sprint 42: the profit clause appears alongside a reputation/quality clause, not replacing it', () => {
    const line = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
      profitYen: 40_000,
      reputationDelta: 15,
      saleQuality: 'satisfied',
    })
    expect(line).toContain('profit +¥40,000')
    expect(line).toContain('the buyer got what they came for, reputation +15')
  })

  it('the two outcomes read differently, and neither names a condition band', () => {
    const delighted = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
      reputationDelta: 30,
      saleQuality: 'delighted',
    })
    expect(delighted).toContain('the buyer got everything they came for, reputation +30')
  })

  it('a sale with a saleRevealLine appends it after the quality clause, one line, no popup', () => {
    const line = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
      reputationDelta: 15,
      saleQuality: 'satisfied',
      saleRevealLine: 'The buyer had it looked over: Valve seals. They did well out of you.',
    })
    expect(line).toContain('the buyer got what they came for, reputation +15')
    expect(line).toContain('The buyer had it looked over: Valve seals. They did well out of you.')
  })

  it('a sale with no saleRevealLine renders exactly as before (an honest or fully-resolved car)', () => {
    const line = describeLogEntry({
      type: 'car-sold',
      carInstanceId: 'car-1',
      channel: 'walk-in-offer',
      priceYen: 900_000,
    })
    expect(line).not.toContain('had it looked over')
  })

  it('a tool upgrade reads as the line label and the named tier, never a raw id', () => {
    const line = describeLogEntry({
      type: 'tool-upgraded',
      componentId: 'wheels',
      toTier: 2,
      priceYen: 150_000,
    })
    // The wheels group label is "Wheels and Tyres".
    expect(line).toBe('Upgraded Wheels and Tyres to Tyre machine & balancer for ¥150,000')
    expect(line).not.toContain('wheels')
  })

  it('buying the two-post lift reads as its own name, not a raw equipment id', () => {
    const line = describeLogEntry({
      type: 'equipment-purchased',
      equipmentId: 'lift',
      priceYen: 400_000,
    })
    expect(line).toBe('Bought the two-post lift (¥400,000)')
  })

  it('hiring the two-post lift for the day reads as the exact authored copy', () => {
    const line = describeLogEntry({ type: 'lift-hired', priceYen: 5_000 })
    expect(line).toBe('Hired the two-post lift for the day (¥5,000)')
  })

  it('any other equipment id still reads through the generic phrasing', () => {
    const line = describeLogEntry({
      type: 'equipment-purchased',
      equipmentId: 'tire-machine',
      priceYen: 250_000,
    })
    expect(line).toBe('Bought equipment tire-machine for ¥250,000')
  })

  it('a machine hire reads as the real machinery name and its daily price - the exact authored copy', () => {
    const line = describeLogEntry({ type: 'machine-hired', componentId: 'body', priceYen: 14_000 })
    expect(line).toBe(`Hired the ${TOOL_LINES.body.tiers[1]!.displayName} for the day (¥14,000)`)
  })

  it('a mission delivered with a tip shows the tip alongside the payout', () => {
    const line = describeLogEntry({
      type: 'mission-delivered',
      missionId: 'test-mission-a',
      payoutYen: 500_000,
      tipYen: 100_000,
      reputationGained: 30,
    })
    expect(line).toBe('Mission delivered: ¥500,000 + ¥100,000 tip, +30 rep')
  })

  it('Sprint 76: a mission delivered with no tip omits the tip clause entirely', () => {
    const line = describeLogEntry({
      type: 'mission-delivered',
      missionId: 'test-mission-a',
      payoutYen: 200_000,
      tipYen: 0,
      reputationGained: 20,
    })
    expect(line).toBe('Mission delivered: ¥200,000, +20 rep')
    expect(line).not.toContain('tip')
  })

  it('part lines carry the player-facing brand and name, never the raw catalogue id', () => {
    const part = PARTS[0]!
    const delivered = describeLogEntry({ type: 'part-delivered', partId: part.id } as DayLogEntry)
    expect(delivered).toContain(part.name)
    expect(delivered).not.toContain(part.id)

    const bought = describeLogEntry({
      type: 'part-bought',
      partId: part.id,
      partInstanceId: 'part-1-0',
      priceYen: 10_000,
    } as DayLogEntry)
    expect(bought).toContain(part.brand)
    expect(bought).not.toContain(part.id)
  })

  it('the three repair-job-completed lines read as the locked copy, car appended only for an installed target', () => {
    const intakeLabel = PARTS_TAXONOMY.find((entry) => entry.id === 'intake')!.displayName
    const dampersLabel = PARTS_TAXONOMY.find((entry) => entry.id === 'dampers')!.displayName
    const gearboxLabel = PARTS_TAXONOMY.find((entry) => entry.id === 'gearbox')!.displayName

    const serviced = describeLogEntry({
      type: 'repair-job-completed',
      carInstanceId: 'car-1',
      carPartId: 'intake',
      jobKind: 'service',
      targetBand: 'worn',
    })
    expect(serviced).toBe(`Serviced the ${intakeLabel} to worn, car-1`)

    const rebuilt = describeLogEntry({
      type: 'repair-job-completed',
      carInstanceId: 'car-1',
      carPartId: 'dampers',
      jobKind: 'rebuild',
      targetBand: 'fine',
    })
    expect(rebuilt).toBe(`Rebuilt the ${dampersLabel} to fine, car-1`)

    // A loose target has no car - the part label alone, no trailing comma.
    const restored = describeLogEntry({
      type: 'repair-job-completed',
      partInstanceId: 'part-9-0',
      carPartId: 'gearbox',
      jobKind: 'restore',
      targetBand: 'mint',
    })
    expect(restored).toBe(`Restored the ${gearboxLabel} to mint`)
    expect(restored).not.toContain('part-9-0')
  })
})

describe('classifyDayReport', () => {
  it('a machine hire is both a notable line and part of the Bills figure - a running cost, like rent, but never silent', () => {
    const view = classifyDayReport([
      { type: 'machine-hired', componentId: 'suspension', priceYen: 5_000 },
      { type: 'rent-paid', amountYen: -90_000 },
    ])
    expect(view.notable).toContain(
      `Hired the ${TOOL_LINES.suspension.tiers[1]!.displayName} for the day (¥5,000)`,
    )
    // Both the hire and the rent land in the same Bills figure.
    expect(view.money.billsYen).toBe(5_000 + 90_000)
  })

  it('aggregates every body-materials-used entry for a car into one line, zoned and zoneless alike', () => {
    const view = classifyDayReport([
      {
        type: 'body-materials-used',
        carInstanceId: 'car-1',
        zoneId: 'bonnet',
        stage: 'prime',
        costYen: 3_200,
      },
      {
        type: 'body-materials-used',
        carInstanceId: 'car-1',
        zoneId: 'boot',
        stage: 'paint',
        costYen: 3_200,
      },
      // The whole-car respray's own entry carries no zoneId - it folds into
      // the same per-car total rather than reading as a fourth kind of line.
      { type: 'body-materials-used', carInstanceId: 'car-1', stage: 'paint', costYen: 12_000 },
    ])
    const bodyLines = view.notable.filter((line) => line.startsWith('Body shop materials'))
    expect(bodyLines).toHaveLength(1)
    expect(bodyLines[0]).toBe('Body shop materials, car-1: ¥18,400 (3 jobs)')
  })

  it('aggregates every repair-step entry per car+part+kind into one line, loose parts by the label alone', () => {
    const intakeLabel = PARTS_TAXONOMY.find((entry) => entry.id === 'intake')!.displayName
    const gearboxLabel = PARTS_TAXONOMY.find((entry) => entry.id === 'gearbox')!.displayName

    const view = classifyDayReport([
      { type: 'repair-step', carInstanceId: 'car-1', carPartId: 'intake', jobKind: 'service' },
      { type: 'repair-step', carInstanceId: 'car-1', carPartId: 'intake', jobKind: 'service' },
      { type: 'repair-step', carInstanceId: 'car-1', carPartId: 'intake', jobKind: 'service' },
      // A different job kind on the same car+part is its own line.
      { type: 'repair-step', carInstanceId: 'car-1', carPartId: 'intake', jobKind: 'rebuild' },
      // A loose part (no car) reads with the label alone - no car in the line.
      { type: 'repair-step', partInstanceId: 'part-9-0', carPartId: 'gearbox', jobKind: 'restore' },
      { type: 'repair-step', partInstanceId: 'part-9-0', carPartId: 'gearbox', jobKind: 'restore' },
    ])
    expect(view.notable).toContain(`${intakeLabel}, car-1: 3 steps of the service`)
    expect(view.notable).toContain(`${intakeLabel}, car-1: 1 step of the rebuild`)
    expect(view.notable).toContain(`${gearboxLabel}: 2 steps of the restore`)
  })

  it('a worked bench day: the aggregated step line and the job-completed line both appear', () => {
    const intakeLabel = PARTS_TAXONOMY.find((entry) => entry.id === 'intake')!.displayName

    const view = classifyDayReport([
      { type: 'repair-step', carInstanceId: 'car-1', carPartId: 'intake', jobKind: 'service' },
      { type: 'repair-step', carInstanceId: 'car-1', carPartId: 'intake', jobKind: 'service' },
      {
        type: 'repair-job-completed',
        carInstanceId: 'car-1',
        carPartId: 'intake',
        jobKind: 'service',
        targetBand: 'worn',
      },
    ])
    expect(view.notable).toContain(`${intakeLabel}, car-1: 2 steps of the service`)
    expect(view.notable).toContain(`Serviced the ${intakeLabel} to worn, car-1`)
  })
})

describe('the cash movements that used to leave no trace', () => {
  it('names the auction admission, the listing fee, the materials drawn and the bench recondition', () => {
    expect(describeLogEntry({ type: 'auction-attended', tier: 'regional', feeYen: 3_000 })).toBe(
      'Paid in at the regional rooms: ¥3,000',
    )
    expect(
      describeLogEntry({
        type: 'car-listed',
        carInstanceId: 'car-1',
        channelId: 'freeAdsPaper',
        feeYen: 1_500,
      }),
    ).toBe('Advertising for car-1 (Free ads paper): ¥1,500')
    expect(
      describeLogEntry({
        type: 'body-materials-used',
        carInstanceId: 'car-1',
        zoneId: 'bonnet',
        stage: 'prime',
        costYen: 3_200,
      }),
    ).toBe('Materials drawn, prime on the bonnet: ¥3,200')
    expect(
      describeLogEntry({
        type: 'body-materials-used',
        carInstanceId: 'car-1',
        stage: 'paint',
        costYen: 12_000,
      }),
    ).toBe('Materials drawn, whole-car respray: ¥12,000')
    expect(
      describeLogEntry({
        type: 'job-created',
        jobId: 'job-1',
        carInstanceId: 'part-1-0',
        kind: 'recondition-part',
        costYen: 12_400,
      }),
    ).toBe('Bench recondition started for ¥12,400')
  })

  it('names a bought consumable tin, plain and paint alike', () => {
    expect(
      describeLogEntry({
        type: 'consumable-bought',
        consumableKey: 'primer',
        usesAdded: 9,
        priceYen: 5_850,
      }),
    ).toBe('Bought Primer tin for ¥5,850')
    expect(
      describeLogEntry({
        type: 'consumable-bought',
        consumableKey: 'paint:solid:white',
        usesAdded: 9,
        priceYen: 11_350,
      }),
    ).toBe('Bought solid paint (Plain White) for ¥11,350')
  })

  it('shows what a repair cost the moment the job opens', () => {
    expect(
      describeLogEntry({
        type: 'job-created',
        jobId: 'job-1',
        carInstanceId: 'car-1',
        kind: 'repair-zone',
        costYen: 8_000,
      }),
    ).toBe('Job started (repair-zone) on car-1 for ¥8,000')
  })

  it('counts every one of them into the day report, none into prose alone', () => {
    const view = classifyDayReport([
      { type: 'auction-attended', tier: 'regional', feeYen: 3_000 },
      { type: 'car-listed', carInstanceId: 'car-1', channelId: 'freeAdsPaper', feeYen: 1_500 },
      // Moneyless now that the tin is paid for at purchase, not at the
      // stage - still a notable line, but no longer a money line.
      {
        type: 'body-materials-used',
        carInstanceId: 'car-1',
        zoneId: 'bonnet',
        stage: 'paint',
        costYen: 3_200,
      },
      { type: 'consumable-bought', consumableKey: 'primer', usesAdded: 9, priceYen: 5_850 },
      { type: 'bay-purchased', kind: 'parking', priceYen: 400_000 },
      { type: 'part-bought', partId: 'x', partInstanceId: 'p1', priceYen: 20_000 },
    ])
    // Admission and the bay are the shop's own costs; the listing fee, the
    // bought tin and the part are all spent towards cars and stock alike
    // (the report's own three-line split folds stock into onCars).
    expect(view.money.billsYen).toBe(3_000 + 400_000)
    expect(view.money.onCarsYen).toBe(1_500 + 5_850 + 20_000)
    expect(view.money.earnedYen).toBe(0)
  })
})
