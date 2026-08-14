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
import { renderCareerReportPage } from '../src/careerReport'
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

describe('renderCareerReportPage (Sprint 198 E1)', () => {
  it('renders one page with a row per day, not just endpoints', () => {
    const script = CareerScriptSchema.parse(smokeScriptRaw)
    const result = replayCareerScript(script, CONTEXT)
    const page = renderCareerReportPage(result, CONTEXT.economy)

    expect(page).toContain('# Career report: smoke')
    expect(page).toContain('## Cash curve')
    expect(page).toContain('## Labour utilisation')
    expect(page).toContain('## Weekly cost sheet')
    expect(page).toContain('## Checkpoints')
    // Every script day gets its own cash-curve row (curves, not endpoints).
    for (const scriptDay of script.days) {
      expect(page).toContain(`| ${scriptDay.day} | `)
    }
  })
})
