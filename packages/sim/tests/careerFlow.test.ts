import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { dayFlowFor, weeklyFlowFor } from '../src/careerFlow'
import { CareerScriptSchema } from '../src/careerScript'
import { replayCareerScript } from '../src/careerReplay'
import { buildSimContext } from '../src/context'
import smokeScriptRaw from '../src/careerScripts/smoke.script.json'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

const SMOKE_SCRIPT = CareerScriptSchema.parse(smokeScriptRaw)

describe('careerFlow reconciliation (Sprint 198 D2)', () => {
  it("the flow table's weekly rollup equals financeLedger for every week, to the yen", () => {
    const result = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    const series = result.dayLogs.map((log, i) =>
      dayFlowFor(result.snapshots[i]?.day ?? i + 1, log),
    )
    const rolledUp = weeklyFlowFor(series, CONTEXT.economy)
    const financeLedger = result.finalState.financeLedger ?? {}

    // Every week financeLedger reports must appear, with identical figures,
    // in the independently-built flow table - and vice versa, so the check
    // catches a week the flow table invented as readily as one it dropped.
    expect(Object.keys(rolledUp).sort()).toEqual(Object.keys(financeLedger).sort())
    for (const [week, ledgerWeek] of Object.entries(financeLedger)) {
      const flowWeek = rolledUp[week]
      expect(flowWeek, `week ${week} missing from the flow table`).toBeDefined()
      expect(flowWeek).toEqual({
        income: ledgerWeek.incomeYen,
        onCars: ledgerWeek.onCarsYen,
        stock: ledgerWeek.stockYen,
        running: ledgerWeek.runningYen,
        investment: ledgerWeek.investmentYen,
      })
    }
  })

  it('the smoke script actually exercises more than one bucket, so the reconciliation is not vacuous', () => {
    const result = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    const series = result.dayLogs.map((log, i) =>
      dayFlowFor(result.snapshots[i]?.day ?? i + 1, log),
    )
    const totals = series.reduce(
      (sum, row) => ({
        income: sum.income + row.income,
        onCars: sum.onCars + row.onCars,
        stock: sum.stock + row.stock,
        running: sum.running + row.running,
        investment: sum.investment + row.investment,
      }),
      { income: 0, onCars: 0, stock: 0, running: 0, investment: 0 },
    )
    const nonZeroBuckets = Object.values(totals).filter((v) => v !== 0).length
    expect(nonZeroBuckets).toBeGreaterThanOrEqual(3)
  })
})
