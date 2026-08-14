import type { ZoneState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planPaintStage, type BodyLineCapability } from '../src/bodyPipeline'

/**
 * `planPaintStage`'s finish grade (docs/design/systems/paint-system-design.md,
 * "the finish ladder"): which tin a job charges, and the one gate that makes
 * "respray it back and it is original again" work - a `stock`-grade job is
 * refused everywhere but the car's own factory colour. Applies identically to
 * every one of the nine zones; the stage no longer takes a `zoneId` at all,
 * since there is nothing zone-specific left in its own logic.
 */

const UNLOCKED: BodyLineCapability = { unlocked: true, fullCapability: true }

function primedZone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { metal: 0, surface: 0, finish: 3, panelMissing: false, primed: true, ...overrides }
}

describe('planPaintStage: the stock-grade colour gate', () => {
  it('refuses a stock-grade job in any colour but the factory colour', () => {
    const plan = planPaintStage(primedZone(), 'kaido-blue', UNLOCKED, 'stock', 'white')
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('wrong-colour')
  })

  it('allows a stock-grade job in exactly the factory colour', () => {
    const plan = planPaintStage(primedZone(), 'white', UNLOCKED, 'stock', 'white')
    expect(plan.ok).toBe(true)
  })

  it('allows a stock-grade job in either half of a two-tone factory colour', () => {
    const white = planPaintStage(primedZone(), 'white', UNLOCKED, 'stock', 'white+black')
    const black = planPaintStage(primedZone(), 'black', UNLOCKED, 'stock', 'white+black')
    expect(white.ok).toBe(true)
    expect(black.ok).toBe(true)
  })

  it('refuses a stock-grade job in a colour outside a two-tone factory scheme', () => {
    const plan = planPaintStage(primedZone(), 'red', UNLOCKED, 'stock', 'white+black')
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('wrong-colour')
  })

  it('never gates street, sport or race on colour: any of the 34 is allowed', () => {
    for (const grade of ['street', 'sport', 'race'] as const) {
      const plan = planPaintStage(primedZone(), 'kaido-blue', UNLOCKED, grade, 'white')
      expect(plan.ok, grade).toBe(true)
    }
  })
})

describe('planPaintStage: each grade charges its own tin', () => {
  it('charges the solid tin (1,400) for stock and for street', () => {
    const stock = planPaintStage(primedZone(), 'white', UNLOCKED, 'stock', 'white')
    const street = planPaintStage(primedZone(), 'kaido-blue', UNLOCKED, 'street', 'white')
    expect(stock.ok && stock.materialsCostYen).toBe(1400)
    expect(street.ok && street.materialsCostYen).toBe(1400)
  })

  it('charges the metallic tin (2,750) for sport', () => {
    const sport = planPaintStage(primedZone(), 'kaido-blue', UNLOCKED, 'sport', 'white')
    expect(sport.ok && sport.materialsCostYen).toBe(2750)
  })

  it('charges the pearl tin (4,150) for race', () => {
    const race = planPaintStage(primedZone(), 'kaido-blue', UNLOCKED, 'race', 'white')
    expect(race.ok && race.materialsCostYen).toBe(4150)
  })

  it('never varies the zone effect by grade beyond the tin (labour is a flat content figure per stage, not part of the plan)', () => {
    for (const grade of ['stock', 'street', 'sport', 'race'] as const) {
      const colour = grade === 'stock' ? 'white' : 'kaido-blue'
      const plan = planPaintStage(primedZone(), colour, UNLOCKED, grade, 'white')
      expect(plan.ok, grade).toBe(true)
      expect(plan.ok && 'laborUnits' in plan, grade).toBe(false)
    }
  })
})
