import { ECONOMY, type MetalZoneState, type TrimZoneState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  PANEL_ZONE_IDS,
  isMetalZoneState,
  planMetalPipelineStage,
  planPipelineStage,
} from '../src/bodyPipeline'

/**
 * The two-shape model's own rules for the pipeline's metal-only stages
 * (docs/design/systems/workshop-rework.md): `beat`, `weld` and `fillAndSand`
 * only ever mean something on a metal zone, and `weld` further narrows to
 * rot rather than dents - the choice on a rotten panel becomes hire the
 * welder, or buy the panel.
 */

const UNLOCKED = { unlocked: true, fullCapability: true }

function metalZone(overrides: Partial<MetalZoneState> = {}): MetalZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

function trimZone(overrides: Partial<TrimZoneState> = {}): TrimZoneState {
  return { finish: 0, panelMissing: false, primed: false, ...overrides }
}

describe('weld refuses below rot, and only rot', () => {
  it('refuses at severity 1 and 2 - those are dents, beat handles them', () => {
    for (const metal of [1, 2]) {
      const plan = planMetalPipelineStage('weld', metalZone({ metal }))
      expect(plan.ok, `severity ${metal}`).toBe(false)
      if (!plan.ok) expect(plan.reason, `severity ${metal}`).toBe('prereq')
    }
  })

  it('accepts at exactly severity 3, the weldable maximum', () => {
    const plan = planMetalPipelineStage('weld', metalZone({ metal: 3 }))
    expect(plan.ok).toBe(true)
    expect(plan.ok && isMetalZoneState(plan.zone) && plan.zone.metal).toBe(0)
  })

  it('still refuses at severity 0 - nothing to weld', () => {
    const plan = planMetalPipelineStage('weld', metalZone({ metal: 0 }))
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('prereq')
  })

  it('beat still handles severities 1 and 2, and refuses at 3', () => {
    for (const metal of [1, 2]) {
      const plan = planMetalPipelineStage('beat', metalZone({ metal }))
      expect(plan.ok, `severity ${metal}`).toBe(true)
    }
    const atWeldable = planMetalPipelineStage('beat', metalZone({ metal: 3 }))
    expect(atWeldable.ok).toBe(false)
    if (!atWeldable.ok) expect(atWeldable.reason).toBe('prereq')
  })
})

describe('metalwork bares the finish it sits under', () => {
  const painted = { finish: 0, panelMissing: false, primed: false, colour: 'red' }

  it('beat leaves a painted zone bare and unprimed, colour field untouched', () => {
    const plan = planMetalPipelineStage('beat', metalZone({ ...painted, metal: 1, surface: 0 }))
    expect(plan.ok).toBe(true)
    if (plan.ok && isMetalZoneState(plan.zone)) {
      expect(plan.zone.finish).toBe(3)
      expect(plan.zone.primed).toBe(false)
      expect(plan.zone.colour).toBe('red')
    }
  })

  it('weld leaves a painted zone bare and unprimed', () => {
    const plan = planMetalPipelineStage('weld', metalZone({ ...painted, metal: 3, surface: 0 }))
    expect(plan.ok).toBe(true)
    if (plan.ok && isMetalZoneState(plan.zone)) {
      expect(plan.zone.finish).toBe(3)
      expect(plan.zone.primed).toBe(false)
    }
  })

  it('fillAndSand leaves a painted zone bare and unprimed', () => {
    const plan = planMetalPipelineStage(
      'fillAndSand',
      metalZone({ ...painted, metal: 0, surface: 1 }),
    )
    expect(plan.ok).toBe(true)
    if (plan.ok && isMetalZoneState(plan.zone)) {
      expect(plan.zone.finish).toBe(3)
      expect(plan.zone.primed).toBe(false)
    }
  })

  it('is idempotent: reapplying beat to an already-bare zone leaves it bare', () => {
    const bare = metalZone({ metal: 1, surface: 0, finish: 3, primed: false })
    const plan = planMetalPipelineStage('beat', bare)
    expect(plan.ok).toBe(true)
    if (plan.ok && isMetalZoneState(plan.zone)) {
      expect(plan.zone.finish).toBe(3)
      expect(plan.zone.primed).toBe(false)
    }
  })
})

describe('a trim zone cannot be beaten, welded or filled', () => {
  it('refuses all three metal-only stages, naming the reason', () => {
    const zone = trimZone({ finish: 2 })
    for (const stage of ['beat', 'weld', 'fillAndSand'] as const) {
      const plan = planPipelineStage(stage, zone, UNLOCKED)
      expect(plan.ok, stage).toBe(false)
      if (!plan.ok) expect(plan.reason, stage).toBe('metal-only')
    }
  })

  it('still runs the three shared stages: strip/prep, prime and polish', () => {
    const bare = planPipelineStage('stripPrep', trimZone({ finish: 1 }), UNLOCKED)
    expect(bare.ok).toBe(true)
    const primed = planPipelineStage('prime', trimZone({ finish: 3, primed: false }), UNLOCKED)
    expect(primed.ok).toBe(true)
    const polished = planPipelineStage('polish', trimZone({ finish: 2, primed: false }), UNLOCKED)
    expect(polished.ok).toBe(true)
  })
})

/**
 * The polish gate (docs/sprints/sprint222.md, "the polish stage gate"):
 * rattle-can shops do honest but never pretty work, so polish now needs the
 * body line `unlocked` (tier 2 owned, or hired today) before it runs at all.
 * `BILL_CAPABILITY` (bodyPipeline.ts) always reads `unlocked: true`, so this
 * never touches what a bill quotes.
 */
describe('polish requires the body line unlocked', () => {
  const LOCKED = { unlocked: false, fullCapability: false }

  it('refuses at tier 1 capability, naming the gate', () => {
    const plan = planPipelineStage('polish', trimZone({ finish: 2, primed: false }), LOCKED)
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('tool-tier')
  })

  it('refuses on a metal zone too, at the same gate', () => {
    const plan = planPipelineStage('polish', metalZone({ finish: 2, primed: false }), LOCKED)
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('tool-tier')
  })

  it('a bare zone still refuses with prereq, even locked - nothing to polish outranks the gate', () => {
    const plan = planPipelineStage('polish', trimZone({ finish: 3, primed: false }), LOCKED)
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('prereq')
  })

  it('passes once unlocked, landing at the tier-2 floor', () => {
    const plan = planPipelineStage('polish', trimZone({ finish: 2, primed: false }), {
      unlocked: true,
      fullCapability: false,
    })
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.zone.finish).toBe(1)
  })
})

/**
 * The body-stage labour felt statement, pinned against the live content table
 * (`economy.energy.bodyStagePoints`) rather than restated as a magic number:
 * a full respray of a kei is 36 labour points under half the 80-point pool
 * (was ~135 under the old tool-tier-multiplied formula), a single panel's
 * beat-fill-prime-paint chain is 8 points, and weld stays the heaviest single
 * hand op at 6 - before the machine-less multiplier, which this table never
 * carries.
 */
describe('body-stage labour: the recorded felt statement', () => {
  const points = ECONOMY.energy.bodyStagePoints

  it('a full nine-zone respray (strip, prime, paint) costs 36 points', () => {
    const perZone = points.stripPrep + points.prime + points.paint
    expect(perZone * PANEL_ZONE_IDS.length).toBe(36)
  })

  it("one panel's beat-fill-prime-paint chain costs 8 points", () => {
    expect(points.beat + points.fillAndSand + points.prime + points.paint).toBe(8)
  })

  it('weld is the heaviest single stage, at 6 points', () => {
    expect(points.weld).toBe(6)
    expect(Math.max(...Object.values(points))).toBe(points.weld)
  })
})
