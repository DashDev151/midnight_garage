import { BUYERS, CARS, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const { marketPressure, selling } = CONTEXT.economy

/**
 * Runs `updateMarketHeat`'s own smoothing recurrence in isolation - target
 * heat is just the sinusoidal fashion wave (`WAVE_AMPLITUDE x sin(...)`)
 * around a base of 100, with the supply-glut, sales-flood and scarcity terms
 * all held at zero, matching a model with no supply or sales pressure. Real
 * heat closes `SMOOTHING` of the gap to that target each week, exactly as
 * `marketHeat.ts` does. A model's wave phase only shifts WHEN the cycle
 * peaks, never how far it swings, so phase 0 stands in for every model.
 */
function simulateWaveOnlyHeat(amplitude: number, periodWeeks: number, weeks: number): number[] {
  const heatMin = marketPressure.HEAT_MIN
  const heatMax = marketPressure.HEAT_MAX
  let heat = 100
  const series: number[] = []
  for (let week = 0; week < weeks; week++) {
    const wave = amplitude * Math.sin((2 * Math.PI * week) / periodWeeks)
    const target = Math.max(heatMin, Math.min(heatMax, 100 + wave))
    heat = Math.round(heat + marketPressure.SMOOTHING * (target - heat))
    series.push(heat)
  }
  return series
}

function steadyStateRange(amplitude: number, periodWeeks: number): { min: number; max: number } {
  // Ten full periods of burn-in is well past the recurrence's geometric
  // transient (each week closes 25% of the remaining gap, so under 30 weeks
  // is indistinguishable from steady state); sample the last three periods
  // so the whole sampled window is periodic, not transient tail.
  const series = simulateWaveOnlyHeat(amplitude, periodWeeks, periodWeeks * 10)
  const steady = series.slice(-periodWeeks * 3)
  return { min: Math.min(...steady), max: Math.max(...steady) }
}

describe('the fashion wave clears both offer-frequency bands', () => {
  it('at the shipped WAVE_AMPLITUDE/WAVE_PERIOD_WEEKS, a model with no supply or sales pressure swings through cold and hot', () => {
    const { min, max } = steadyStateRange(
      marketPressure.WAVE_AMPLITUDE,
      marketPressure.WAVE_PERIOD_WEEKS,
    )
    expect(min).toBe(88)
    expect(max).toBe(112)
    expect(min).toBeLessThan(selling.heatBandColdBelowPercent)
    expect(max).toBeGreaterThanOrEqual(selling.heatBandHotAtOrAbovePercent)
  })

  it('reproduces the previous shipped values (amplitude 12, period 24) never crossing either band - the damping defect this probe exists to catch', () => {
    const { min, max } = steadyStateRange(12, 24)
    expect(min).toBe(91)
    expect(max).toBe(109)
    expect(min).toBeGreaterThanOrEqual(selling.heatBandColdBelowPercent)
    expect(max).toBeLessThan(selling.heatBandHotAtOrAbovePercent)
  })

  it('reproduces the halfway-fix values (amplitude unchanged at 12, period shortened to 14) still never crossing either band - shortening the period alone is not enough', () => {
    const { min, max } = steadyStateRange(12, 14)
    expect(min).toBe(93)
    expect(max).toBe(107)
    expect(min).toBeGreaterThanOrEqual(selling.heatBandColdBelowPercent)
    expect(max).toBeLessThan(selling.heatBandHotAtOrAbovePercent)
  })
})
