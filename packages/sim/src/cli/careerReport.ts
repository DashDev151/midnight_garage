/**
 * The career flow meter's report CLI (`pnpm career:report`). Compiled
 * separately (tsconfig.cli.json) to plain CommonJS and run via `node`, same
 * build-and-run shape as `exportCareers.ts` - reaches into content's source
 * via a relative path rather than the package specifier for the same reason
 * that file documents (plain Node cannot resolve
 * `@midnight-garage/content`'s live-source package export).
 *
 * Reads every `*.script.json` fixture under `src/careerScripts/`, replays
 * it deterministically (`replayCareerScript`), and writes one markdown page
 * per script to a gitignored output directory - generated on demand, never
 * committed, since a committed report goes stale and lies.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
} from '../../../content/src/data'
import { buildSimContext } from '../context'
import { CareerScriptSchema } from '../careerScript'
import { replayCareerScript } from '../careerReplay'
import { renderCareerReportPage } from '../careerReport'

// `pnpm --filter @midnight-garage/sim career:report` runs with cwd set to
// packages/sim (pnpm's per-package script convention), the same stable
// anchor `exportCareers.ts`'s own `OUTPUT_DIR` comment explains.
const SCRIPTS_DIR = join(process.cwd(), 'src/careerScripts')
const OUTPUT_DIR = join(process.cwd(), '../../tools/career-report/output')

function main(): void {
  const context = buildSimContext(
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

  const scriptFiles = readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.script.json'))
  if (scriptFiles.length === 0) {
    console.log(`No *.script.json fixtures found under ${SCRIPTS_DIR}`)
    return
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const fileName of scriptFiles) {
    const raw = JSON.parse(readFileSync(join(SCRIPTS_DIR, fileName), 'utf-8'))
    const script = CareerScriptSchema.parse(raw)
    const result = replayCareerScript(script, context)
    const page = renderCareerReportPage(result, context.economy)
    const outPath = join(OUTPUT_DIR, `${script.name}.md`)
    writeFileSync(outPath, page, 'utf-8')
    const failedCheckpoints = result.checkpoints.filter((c) => !c.passed).length
    console.log(
      `${script.name}: ${script.days.length} day(s), final cash ¥${result.finalState.cashYen.toLocaleString('en-US')}, ` +
        `${result.checkpoints.length} checkpoint(s) (${failedCheckpoints} failed) -> ${outPath}`,
    )
  }
}

main()
