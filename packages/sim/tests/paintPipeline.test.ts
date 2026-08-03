import type { ZoneState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planPaintStage, type BodyLineCapability } from '../src/bodyPipeline'

/**
 * `planPaintStage`'s finish grade (docs/design/systems/paint-system-design.md,
 * "the finish ladder"): which tin a job charges, and the one gate that makes
 * "respray it back and it is original again" work - a `stock`-grade job is
 * refused everywhere but the car's own factory colour.
 */

const UNLOCKED: BodyLineCapability = { unlocked: true, fullCapability: true }

function primedZone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { metal: 0, surface: 0, finish: 3, panelMissing: false, primed: true, ...overrides }
}

describe('planPaintStage: the stock-grade colour gate', () => {
  it('refuses a stock-grade job in any colour but the factory colour', () => {
    const plan = planPaintStage(primedZone(), 'bonnet', 'kaido-blue', UNLOCKED, 'stock', 'white')
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('wrong-colour')
  })

  it('allows a stock-grade job in exactly the factory colour', () => {
    const plan = planPaintStage(primedZone(), 'bonnet', 'white', UNLOCKED, 'stock', 'white')
    expect(plan.ok).toBe(true)
  })

  it('allows a stock-grade job in either half of a two-tone factory colour', () => {
    const white = planPaintStage(primedZone(), 'bonnet', 'white', UNLOCKED, 'stock', 'white+black')
    const black = planPaintStage(primedZone(), 'bonnet', 'black', UNLOCKED, 'stock', 'white+black')
    expect(white.ok).toBe(true)
    expect(black.ok).toBe(true)
  })

  it('refuses a stock-grade job in a colour outside a two-tone factory scheme', () => {
    const plan = planPaintStage(primedZone(), 'bonnet', 'red', UNLOCKED, 'stock', 'white+black')
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('wrong-colour')
  })

  it('never gates street, sport or race on colour: any of the 34 is allowed', () => {
    for (const grade of ['street', 'sport', 'race'] as const) {
      const plan = planPaintStage(primedZone(), 'bonnet', 'kaido-blue', UNLOCKED, grade, 'white')
      expect(plan.ok, grade).toBe(true)
    }
  })

  it('never gates the chassis on colour, at any grade - it has no factory shade to keep', () => {
    for (const grade of ['stock', 'street', 'sport', 'race'] as const) {
      const plan = planPaintStage(
        primedZone(),
        'chassis',
        'underseal-black',
        UNLOCKED,
        grade,
        'white',
      )
      expect(plan.ok, grade).toBe(true)
    }
  })
})

describe('planPaintStage: each grade charges its own tin', () => {
  it('charges the solid tin (2,500) for stock and for street', () => {
    const stock = planPaintStage(primedZone(), 'bonnet', 'white', UNLOCKED, 'stock', 'white')
    const street = planPaintStage(primedZone(), 'bonnet', 'kaido-blue', UNLOCKED, 'street', 'white')
    expect(stock.ok && stock.materialsCostYen).toBe(2500)
    expect(street.ok && street.materialsCostYen).toBe(2500)
  })

  it('charges the metallic tin (5,000) for sport', () => {
    const sport = planPaintStage(primedZone(), 'bonnet', 'kaido-blue', UNLOCKED, 'sport', 'white')
    expect(sport.ok && sport.materialsCostYen).toBe(5000)
  })

  it('charges the pearl tin (7,500) for race', () => {
    const race = planPaintStage(primedZone(), 'bonnet', 'kaido-blue', UNLOCKED, 'race', 'white')
    expect(race.ok && race.materialsCostYen).toBe(7500)
  })

  it('charges underseal on the chassis regardless of grade', () => {
    for (const grade of ['stock', 'street', 'sport', 'race'] as const) {
      const plan = planPaintStage(
        primedZone(),
        'chassis',
        'underseal-black',
        UNLOCKED,
        grade,
        'white',
      )
      expect(plan.ok && plan.materialsCostYen, grade).toBe(2000)
    }
  })

  it('leaves labour at one unit regardless of grade', () => {
    for (const grade of ['stock', 'street', 'sport', 'race'] as const) {
      const colour = grade === 'stock' ? 'white' : 'kaido-blue'
      const plan = planPaintStage(primedZone(), 'bonnet', colour, UNLOCKED, grade, 'white')
      expect(plan.ok && plan.laborUnits, grade).toBe(1)
    }
  })
})
