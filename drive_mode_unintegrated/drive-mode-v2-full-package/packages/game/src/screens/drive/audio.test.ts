import { describe, expect, it } from 'vitest'
import { computeMixTargets } from './audio'

describe('drive sound stage mix', () => {
  it('engine pitch follows rpm and load opens the filter', () => {
    const idle = computeMixTargets({ rpm: 900, load: 0, speedMs: 0, slide: 0, lampDistM: 999, zoneKind: 0 })
    const wot = computeMixTargets({ rpm: 7200, load: 1, speedMs: 40, slide: 0, lampDistM: 999, zoneKind: 0 })
    expect(wot.engineHz).toBeGreaterThan(idle.engineHz * 5)
    expect(wot.engineFilterHz).toBeGreaterThan(idle.engineFilterHz + 3000)
    expect(wot.engineGain).toBeGreaterThan(idle.engineGain)
    expect(wot.exhaustLpHz).toBeGreaterThan(idle.exhaustLpHz)
    expect(wot.exhaustGain).toBeGreaterThan(idle.exhaustGain)
  })

  it('tyre screech scales with slide and pitches up with speed', () => {
    const a = computeMixTargets({ rpm: 4000, load: 0.5, speedMs: 10, slide: 0.2, lampDistM: 999, zoneKind: 0 })
    const b = computeMixTargets({ rpm: 4000, load: 0.5, speedMs: 35, slide: 0.9, lampDistM: 999, zoneKind: 0 })
    expect(b.screechGain).toBeGreaterThan(a.screechGain * 3)
    expect(b.screechHz).toBeGreaterThan(a.screechHz)
  })

  it('wind rises with speed squared and is stronger on the summit', () => {
    const slow = computeMixTargets({ rpm: 3000, load: 0.3, speedMs: 12, slide: 0, lampDistM: 999, zoneKind: 0 })
    const fast = computeMixTargets({ rpm: 3000, load: 0.3, speedMs: 50, slide: 0, lampDistM: 999, zoneKind: 0 })
    const summit = computeMixTargets({ rpm: 3000, load: 0.3, speedMs: 50, slide: 0, lampDistM: 999, zoneKind: 4 })
    expect(fast.windGain).toBeGreaterThan(slow.windGain * 5)
    expect(summit.windGain).toBeCloseTo(fast.windGain * 1.5, 5)
  })

  it('crickets duck at speed and vary by zone; waves only on the coast', () => {
    const still = computeMixTargets({ rpm: 900, load: 0, speedMs: 0, slide: 0, lampDistM: 999, zoneKind: 1 })
    const moving = computeMixTargets({ rpm: 4000, load: 0.5, speedMs: 45, slide: 0, lampDistM: 999, zoneKind: 1 })
    expect(moving.cricketGain).toBeLessThan(still.cricketGain)
    expect(computeMixTargets({ rpm: 900, load: 0, speedMs: 0, slide: 0, lampDistM: 999, zoneKind: 3 }).waveGain).toBeGreaterThan(0)
    expect(still.waveGain).toBe(0)
    expect(still.waveLfoDepth).toBe(0)
  })

  it('sodium hum fades in under a lamp and is silent away from one', () => {
    const under = computeMixTargets({ rpm: 900, load: 0, speedMs: 0, slide: 0, lampDistM: 4, zoneKind: 2 })
    const away = computeMixTargets({ rpm: 900, load: 0, speedMs: 0, slide: 0, lampDistM: 60, zoneKind: 2 })
    expect(under.humGain).toBeGreaterThan(0.02)
    expect(away.humGain).toBe(0)
  })
})
