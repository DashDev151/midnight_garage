import { describe, expect, it } from 'vitest'
import workbenchJson from '../data/workbench.json'
import { CarPartIdSchema, ComponentIdSchema, WorkbenchContentSchema } from '../src'
import type { BenchId, RecipeStep, RepairJobKind } from '../src'
import { PARTS_TAXONOMY, WORKBENCH } from '../src/data'

const JOB_KINDS: readonly RepairJobKind[] = ['service', 'rebuild', 'restore']
const TOOL_TIERS = ['tier1', 'tier2', 'shop'] as const
type ToolTier = (typeof TOOL_TIERS)[number]

/** Every recipe step across every part and job kind, flattened with the
 * addressing (`partId.jobKind[index]`) the requiresMachine and copy checks
 * below report against. */
function everyStep(): {
  partId: string
  jobKind: RepairJobKind
  index: number
  step: RecipeStep
}[] {
  const out: { partId: string; jobKind: RepairJobKind; index: number; step: RecipeStep }[] = []
  for (const [partId, recipes] of Object.entries(WORKBENCH.recipes)) {
    for (const jobKind of JOB_KINDS) {
      recipes[jobKind].forEach((step, index) => {
        out.push({ partId, jobKind, index, step })
      })
    }
  }
  return out
}

/** A step's bench is its own `bench` override when present, else the taxonomy
 * group's bench - the same resolution `workbench.ts`'s own doc comment
 * describes and defers to this file. */
function resolveBenchId(carPartId: string, step: RecipeStep): BenchId {
  if (step.bench) return step.bench
  const taxonomyEntry = PARTS_TAXONOMY.find((entry) => entry.id === carPartId)
  if (!taxonomyEntry) throw new Error(`no taxonomy entry for part id "${carPartId}"`)
  return WORKBENCH.benchByGroup[taxonomyEntry.group]
}

/** Which tier a tool id sits at on a given bench, searching all five zones -
 * a step names only the tool, never the zone, so resolution has to search. */
function findToolTier(benchId: BenchId, toolId: string): ToolTier | undefined {
  const bench = WORKBENCH.benches.find((b) => b.id === benchId)
  if (!bench) return undefined
  for (const zoneTools of Object.values(bench.zones)) {
    for (const tier of TOOL_TIERS) {
      if (zoneTools[tier].some((tool) => tool.id === toolId)) return tier
    }
  }
  return undefined
}

describe('workbench.json', () => {
  it('parses under WorkbenchContentSchema', () => {
    const result = WorkbenchContentSchema.safeParse(workbenchJson)
    if (!result.success) throw new Error(result.error.message)
  })

  it('benchByGroup covers all six ComponentIds', () => {
    expect(Object.keys(WORKBENCH.benchByGroup).sort()).toEqual(
      [...ComponentIdSchema.options].sort(),
    )
  })

  /**
   * `recipes` deliberately does not cover all 28 `CarPartId`s - only the
   * bench-repaired ones. Excluded: `clutch`, `brakePadsDiscs`, `tyres` (true
   * consumables, `repairable: false`), `bodywork` and `paint` (the two body
   * slots the body pipeline stages rather than the workbench).
   */
  it('recipes cover exactly the 23 bench-repaired part ids', () => {
    const EXCLUDED_FROM_RECIPES = new Set([
      'clutch',
      'brakePadsDiscs',
      'tyres',
      'bodywork',
      'paint',
    ])
    const expectedRecipePartIds = CarPartIdSchema.options
      .filter((id) => !EXCLUDED_FROM_RECIPES.has(id))
      .sort()
    expect(expectedRecipePartIds.length).toBe(23)
    expect(Object.keys(WORKBENCH.recipes).sort()).toEqual(expectedRecipePartIds)
  })

  /**
   * The invariant `workbench.ts`'s own `WorkbenchContentSchema` doc comment
   * defers here: every step's tool must actually exist on the bench it
   * resolves to, at some tier.
   */
  it("every recipe step's tool id exists on its resolved bench", () => {
    const offenses = everyStep()
      .map(({ partId, jobKind, index, step }) => {
        const benchId = resolveBenchId(partId, step)
        const tier = findToolTier(benchId, step.tool)
        return tier
          ? null
          : `${partId}.${jobKind}[${index}]: tool "${step.tool}" not found on bench "${benchId}"`
      })
      .filter((offense): offense is string => offense !== null)
    expect(offenses, offenses.join('\n')).toEqual([])
  })

  /**
   * The second invariant the schema defers here: a step that cannot be
   * slogged (`requiresMachine`) always names a tier2 or shop tool - tier1 is
   * the hand-tool tier, and a hand tool is never the thing a machine gates.
   */
  it('every requiresMachine step names a tier2 or shop tool, never tier1', () => {
    const offenses = everyStep()
      .filter(({ step }) => step.requiresMachine)
      .map(({ partId, jobKind, index, step }) => {
        const benchId = resolveBenchId(partId, step)
        const tier = findToolTier(benchId, step.tool)
        return tier === 'tier1'
          ? `${partId}.${jobKind}[${index}]: requiresMachine tool "${step.tool}" is tier1`
          : null
      })
      .filter((offense): offense is string => offense !== null)
    expect(offenses, offenses.join('\n')).toEqual([])
  })

  /**
   * The four welding steps the sprint doc names by exact location, pinned
   * literally so a fifth `requiresMachine` step (or a moved one) fails loudly.
   */
  it('has exactly four requiresMachine steps, at the four named welding locations', () => {
    const locations = everyStep()
      .filter(({ step }) => step.requiresMachine)
      .map(({ partId, jobKind, index }) => `${partId}.${jobKind}[${index}]`)
      .sort()
    expect(locations).toEqual(
      ['chassis.rebuild[1]', 'chassis.restore[0]', 'exhaust.rebuild[0]', 'rims.restore[0]'].sort(),
    )
  })

  it('no recipe step copy contains a U+2014 (em dash)', () => {
    const EM_DASH = String.fromCharCode(0x2014)
    const offenses = everyStep()
      .filter(({ step }) => step.copy.includes(EM_DASH))
      .map(({ partId, jobKind, index }) => `${partId}.${jobKind}[${index}]`)
    expect(offenses, offenses.join('\n')).toEqual([])
  })
})
