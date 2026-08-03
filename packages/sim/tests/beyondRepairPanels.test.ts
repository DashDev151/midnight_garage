import {
  BUYERS,
  CARS,
  DAMAGE_GRADES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarModel,
  type DamageGrade,
  type EconomyConfig,
  type MetalZoneState,
  type PartFitmentClass,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { bandIndex } from '../src/bands'
import {
  BEYOND_REPAIR_METAL,
  MAX_REPAIRABLE_METAL,
  METAL_ZONE_IDS,
  PANEL_ZONE_IDS,
  TRIM_ZONE_IDS,
  bandForSeverity,
  derivePanelsBand,
  hasZoneImproveHeadroom,
  improveZoneCarrierOneStep,
  panelsRepairBillYen,
  planInstallPanel,
  planPipelineStage,
  rollZoneStates,
  setZoneCarrierToAtLeastBand,
  zoneNeedsPanel,
  zonePanelPart,
} from '../src/bodyPipeline'
import { buildSimContext, type SimContext } from '../src/context'
import { createRng, hashStringToSeed } from '../src/rng'

/**
 * A panel that is beyond saving. The `metal` axis grew one rung above
 * weldable, which is what lets `derivePanelsBand` reach `scrap` from
 * severity alone; a panel that is absent outright forces the same band for a
 * different reason. Beat and weld refuse both, a fresh panel clears both,
 * and the repair bill quotes exactly one panel for either.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const GAME_YEAR = 1995
const FULL_CAPABILITY = { unlocked: true, fullCapability: true }

function zone(overrides: Partial<MetalZoneState> = {}): MetalZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

function trimZone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { finish: 0, panelMissing: false, primed: false, ...overrides }
}

function zonesWith(overrides: Partial<Record<string, ZoneState>> = {}): ZoneStates {
  const states = {} as Record<string, ZoneState>
  for (const zoneId of METAL_ZONE_IDS) states[zoneId] = zone()
  for (const zoneId of TRIM_ZONE_IDS) states[zoneId] = trimZone()
  return { ...states, ...overrides } as ZoneStates
}

/** Every care profile forced onto one grade, so a probe car's history is
 * `grade` whatever its culture and tier would otherwise have rolled. */
function contextForcingGrade(grade: DamageGrade): SimContext {
  const forced = { tidy: 0, used: 0, rough: 0, project: 0, [grade]: 1 }
  const economy: EconomyConfig = {
    ...ECONOMY,
    partsGeneration: {
      ...ECONOMY.partsGeneration,
      damageGrades: {
        ...ECONOMY.partsGeneration.damageGrades,
        careProfiles: Object.fromEntries(
          ['cherished', 'enthusiast', 'mixed', 'hammered', 'worked'].map((profile) => [
            profile,
            forced,
          ]),
        ) as EconomyConfig['partsGeneration']['damageGrades']['careProfiles'],
      },
    },
  }
  return buildSimContext(
    CARS,
    PARTS,
    BUYERS,
    PARTS_TAXONOMY,
    undefined,
    undefined,
    undefined,
    undefined,
    economy,
  )
}

describe('the metal axis reaches one rung above weldable', () => {
  it('maps that rung to scrap, so the panels band needs no forcing condition of its own', () => {
    expect(bandForSeverity(MAX_REPAIRABLE_METAL)).toBe('poor')
    expect(bandForSeverity(BEYOND_REPAIR_METAL)).toBe('scrap')
    expect(derivePanelsBand(zonesWith({ bonnet: zone({ metal: MAX_REPAIRABLE_METAL }) }))).toBe(
      'poor',
    )
    expect(derivePanelsBand(zonesWith({ bonnet: zone({ metal: BEYOND_REPAIR_METAL }) }))).toBe(
      'scrap',
    )
  })

  it('still forces scrap for an absent panel, which is a different fact from a ruined one', () => {
    const missing = zonesWith({ boot: zone({ metal: 0, panelMissing: true }) })
    expect(derivePanelsBand(missing)).toBe('scrap')
    expect(zoneNeedsPanel(missing.boot)).toBe(true)
    expect(zoneNeedsPanel(missing.bonnet)).toBe(false)
  })

  it('clamps a symptom aimed at scrap to what hand work can still clear', () => {
    // A symptom is the only writer that could aim a body carrier at `scrap`,
    // and its target severity is clamped to what hand work can still clear.
    const panels = setZoneCarrierToAtLeastBand(zonesWith(), 'panels', 'scrap', 'bonnet')
    expect(panels.bonnet.metal).toBe(MAX_REPAIRABLE_METAL)
  })
})

describe('the repair route is shut, and a panel is the only way out', () => {
  it('refuses beat and weld on a panel past saving, naming the remedy', () => {
    const ruined = zone({ metal: BEYOND_REPAIR_METAL })
    for (const stage of ['beat', 'weld'] as const) {
      const plan = planPipelineStage(stage, ruined, FULL_CAPABILITY)
      expect(plan.ok, stage).toBe(false)
      if (!plan.ok) expect(plan.reason, stage).toBe('needs-panel')
    }
    // The weldable rung below it is still ordinary work.
    const weldable = planPipelineStage(
      'weld',
      zone({ metal: MAX_REPAIRABLE_METAL }),
      FULL_CAPABILITY,
    )
    expect(weldable.ok).toBe(true)
  })

  it('refuses every stage on a zone with no panel on it at all', () => {
    const absent = zone({ metal: 1, surface: 1, finish: 2, panelMissing: true })
    for (const stage of ['stripPrep', 'beat', 'weld', 'fillAndSand', 'prime', 'polish'] as const) {
      const plan = planPipelineStage(stage, absent, FULL_CAPABILITY)
      expect(plan.ok, stage).toBe(false)
      if (!plan.ok) expect(plan.reason, stage).toBe('needs-panel')
    }
  })

  it('clears both states outright when a sound panel goes on', () => {
    const fitted = planInstallPanel(
      zone({ metal: BEYOND_REPAIR_METAL, panelMissing: true }),
      'fine',
    )
    expect(fitted.panelMissing).toBe(false)
    expect((fitted as MetalZoneState).metal).toBeLessThanOrEqual(MAX_REPAIRABLE_METAL)
    expect(zoneNeedsPanel(fitted)).toBe(false)
    // And the zone is workable again the moment it is fitted.
    expect(planPipelineStage('stripPrep', fitted, FULL_CAPABILITY).ok).toBe(true)
  })
})

describe('the bill quotes the panel for both states, once', () => {
  const fitmentClass: PartFitmentClass = 'everyday'
  const panelPrice = zonePanelPart(CONTEXT.partsById, 'bonnet', fitmentClass)!.priceYen

  const billFor = (states: ZoneStates) =>
    panelsRepairBillYen(states, 'mint', fitmentClass, CONTEXT.partsById)

  it('charges the same one panel whether it is ruined in place or gone', () => {
    expect(billFor(zonesWith({ bonnet: zone({ metal: BEYOND_REPAIR_METAL }) }))).toBe(panelPrice)
    expect(billFor(zonesWith({ bonnet: zone({ panelMissing: true }) }))).toBe(panelPrice)
    // Ruined AND gone is still one panel, not two.
    expect(
      billFor(zonesWith({ bonnet: zone({ metal: BEYOND_REPAIR_METAL, panelMissing: true }) })),
    ).toBe(panelPrice)
  })

  it('never also charges filler for a zone getting a fresh panel', () => {
    // The replacement arrives with its own sound surface, so the fill-and-sand
    // materials a merely-rough zone pays for are not owed on top of it.
    const ruined = zonesWith({
      bonnet: zone({ metal: BEYOND_REPAIR_METAL, surface: 2 }),
    })
    expect(billFor(ruined)).toBe(panelPrice)
  })

  it('leaves the Law 2 softening pass a way to walk the state back', () => {
    const states = zonesWith({
      bonnet: zone({ metal: BEYOND_REPAIR_METAL, panelMissing: true }),
    })
    expect(hasZoneImproveHeadroom(states, 'panels')).toBe(true)
    const improved = improveZoneCarrierOneStep(states, 'panels')
    expect(zoneNeedsPanel(improved.bonnet)).toBe(false)
    expect(billFor(improved)).toBe(0)
    expect(derivePanelsBand(improved)).not.toBe('scrap')
  })
})

describe('generation writes both states, off the history and the pattern', () => {
  it('never writes either one without a history behind the roll', () => {
    for (let seed = 0; seed < 400; seed++) {
      const states = rollZoneStates('entry', ECONOMY, createRng(seed))
      for (const zoneId of PANEL_ZONE_IDS) expect(zoneNeedsPanel(states[zoneId])).toBe(false)
    }
  })

  it('leaves the two kindest histories alone entirely, however the chance rolls', () => {
    // The gate is structural, not a small number: `tidy` and `used` cars are
    // the car that got old, and this state is the car that got hit.
    for (const grade of ['tidy', 'used'] as const) {
      for (let seed = 0; seed < 400; seed++) {
        const states = rollZoneStates('entry', ECONOMY, createRng(seed), PANEL_ZONE_IDS, grade)
        for (const zoneId of PANEL_ZONE_IDS)
          expect(zoneNeedsPanel(states[zoneId]), grade).toBe(false)
      }
    }
  })

  it('puts it on the zone the pattern implicates, and on no more than one', () => {
    let seen = 0
    for (let seed = 0; seed < 600; seed++) {
      const order = [
        'boot',
        'bonnet',
        'left-front',
        'left-rear',
        'right-front',
        'right-rear',
      ] as const
      const states = rollZoneStates('entry', ECONOMY, createRng(seed), order, 'project')
      const needing = PANEL_ZONE_IDS.filter((zoneId) => zoneNeedsPanel(states[zoneId]))
      expect(needing.length).toBeLessThanOrEqual(1)
      if (needing.length === 1) {
        expect(needing[0]).toBe(order[0])
        seen += 1
      }
    }
    expect(seen, 'a project car should reach the state sometimes').toBeGreaterThan(0)
  })

  it('never turns up on a customer car with a panel gone', () => {
    // `allowMissingSlots: false` is a customer's own car: it never arrives
    // missing an unrelated part, and a body panel is no different.
    for (let seed = 0; seed < 600; seed++) {
      const states = rollZoneStates(
        'entry',
        ECONOMY,
        createRng(seed),
        PANEL_ZONE_IDS,
        'project',
        false,
      )
      for (const zoneId of PANEL_ZONE_IDS) expect(states[zoneId].panelMissing).toBe(false)
    }
  })

  // 400 whole generated cars, which costs real time once coverage
  // instrumentation is in the way - hence the timeout rather than a smaller
  // sweep. The sample size is what makes the "sometimes" below meaningful.
  it('reaches a real generated lot, and the whole car reads scrap panels when it does', () => {
    const context = contextForcingGrade('project')
    const model: CarModel = CARS.find((car) => car.tier === 'entry')!
    let found = 0
    for (let seed = 0; seed < 400; seed++) {
      const car = generateAuctionCarInstance(
        model,
        `beyond-${seed}`,
        createRng(hashStringToSeed(`beyond-${model.id}-${seed}`)),
        context,
        GAME_YEAR,
      )
      const states = car.zoneState!
      if (!PANEL_ZONE_IDS.some((zoneId) => zoneNeedsPanel(states[zoneId]))) continue
      found += 1
      expect(derivePanelsBand(states)).toBe('scrap')
      expect(car.parts.panels.installed?.band).toBe('scrap')
    }
    expect(found, 'a yard of project cars should carry some ruined panels').toBeGreaterThan(0)
  }, 30_000)
})

describe('Law 2 sees the panel price and does not go quiet (definition of done 7)', () => {
  /**
   * `enforceMaxBillFraction` runs during generation and caps a car's bill
   * against its value, so putting a panel price into a generated bill could
   * have made it clip real damage away to stay under the ceiling. Measured
   * rather than assumed, and measured the only way that isolates it: the same
   * seeds and the same code, with the two chances at zero against the two
   * chances as shipped. Both draw the same rolls, so a car differs between the
   * two runs only where the escalation actually landed.
   *
   * Both tests here sweep the whole roster and generate thousands of cars, so
   * both carry an explicit timeout: under coverage instrumentation the work
   * runs well past Vitest's default, and the sample sizes are what the
   * measured bounds below stand on.
   */
  function contextWithChances(beyondRepair: number, panelMissing: number): SimContext {
    const economy: EconomyConfig = {
      ...ECONOMY,
      partsGeneration: {
        ...ECONOMY.partsGeneration,
        zoneStates: {
          ...ECONOMY.partsGeneration.zoneStates,
          zoneBeyondRepairChance: beyondRepair,
          zonePanelMissingChance: panelMissing,
        },
      },
    }
    return buildSimContext(
      CARS,
      PARTS,
      BUYERS,
      PARTS_TAXONOMY,
      undefined,
      undefined,
      undefined,
      undefined,
      economy,
    )
  }

  const OFF = contextWithChances(0, 0)
  const ON = contextWithChances(
    ECONOMY.partsGeneration.zoneStates.zoneBeyondRepairChance,
    ECONOMY.partsGeneration.zoneStates.zonePanelMissingChance,
  )

  const bandStepsOf = (context: SimContext, model: CarModel, seed: number): number => {
    const car = generateAuctionCarInstance(
      model,
      `law2-${model.id}-${seed}`,
      createRng(hashStringToSeed(`law2-${model.id}-${seed}`)),
      context,
      GAME_YEAR,
    )
    let steps = 0
    for (const state of Object.values(car.parts)) {
      if (state.installed) steps += bandIndex('mint') - bandIndex(state.installed.band)
    }
    return steps
  }

  it('leaves generated damage louder on average in every fitment class, never quieter', () => {
    const byClass: Record<string, { cars: number; off: number; on: number; quieter: number }> = {}
    for (const model of CARS) {
      const fitmentClass = fitmentClassForTier(model.tier)
      byClass[fitmentClass] ??= { cars: 0, off: 0, on: 0, quieter: 0 }
      for (let seed = 0; seed < 60; seed++) {
        const off = bandStepsOf(OFF, model, seed)
        const on = bandStepsOf(ON, model, seed)
        const row = byClass[fitmentClass]!
        row.cars += 1
        row.off += off
        row.on += on
        if (on < off) row.quieter += 1
      }
    }
    const report = Object.entries(byClass)
      .map(
        ([key, row]) =>
          `${key} ${(row.off / row.cars).toFixed(3)} -> ${(row.on / row.cars).toFixed(3)} (${row.quieter}/${row.cars} quieter)`,
      )
      .join('; ')
    for (const [fitmentClass, row] of Object.entries(byClass)) {
      expect(
        row.on / row.cars,
        `${fitmentClass}: generated damage got quieter overall - ${report}`,
      ).toBeGreaterThanOrEqual(row.off / row.cars)
      // A per-car clip is possible and rare rather than impossible: the Law 2
      // pass lifts EVERY part sharing the car's single worst band, so a car
      // that already had another part at `scrap` sees that part climb
      // alongside the panel being walked back. Measured at 1 car in 1560
      // (2 band steps of 75) across the whole roster; the guard sits an order
      // of magnitude above that, to catch the mechanism becoming common rather
      // than to pin today's count.
      expect(
        row.quieter / row.cars,
        `${fitmentClass}: the Law 2 pass is clipping real damage to absorb panel prices - ${report}`,
      ).toBeLessThan(0.01)
    }
  }, 30_000)

  it('keeps both states rare on every fitment class', () => {
    // Rare and dramatic, not routine: the car that got hit. The gradient across
    // classes is emergent (a flagship's culture rarely rolls a heavy history at
    // all), so this asserts the ceiling rather than a shape.
    const byClass: Record<string, { cars: number; needing: number }> = {}
    for (const model of CARS) {
      const fitmentClass = fitmentClassForTier(model.tier)
      byClass[fitmentClass] ??= { cars: 0, needing: 0 }
      for (let seed = 0; seed < 120; seed++) {
        const car = generateAuctionCarInstance(
          model,
          `rate-${model.id}-${seed}`,
          createRng(hashStringToSeed(`rate-${model.id}-${seed}`)),
          ON,
          GAME_YEAR,
        )
        byClass[fitmentClass]!.cars += 1
        const states = car.zoneState!
        if (PANEL_ZONE_IDS.some((zoneId) => zoneNeedsPanel(states[zoneId]))) {
          byClass[fitmentClass]!.needing += 1
        }
      }
    }
    const report = Object.entries(byClass)
      .map(([key, counted]) => `${key} ${(counted.needing / counted.cars).toFixed(4)}`)
      .join('; ')
    for (const [fitmentClass, counted] of Object.entries(byClass)) {
      expect(counted.needing / counted.cars, `${fitmentClass} is not rare: ${report}`).toBeLessThan(
        0.1,
      )
    }
  }, 30_000)
})

describe('the damage grades this hangs off', () => {
  it('has the two heaviest last, which is what the gate reads', () => {
    expect([...DAMAGE_GRADES].slice(-2)).toEqual(['rough', 'project'])
  })
})
