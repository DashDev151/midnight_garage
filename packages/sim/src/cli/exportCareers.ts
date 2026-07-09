/**
 * Balance-harness data export (Sprint 03 decision 1). Compiled separately
 * (tsconfig.cli.json) to plain CommonJS and run via `node`, not
 * Vite/Vitest — the harness needs a real Node process to write files, and
 * plain Node can't execute TypeScript or resolve `@midnight-garage/content`'s
 * live-source package export at runtime the way Vite's dev/test transform
 * does. This file therefore reaches into content's source via a relative
 * path instead of the normal package specifier — a deliberate, scoped
 * exception for this one build-and-run CLI entry point; every other sim
 * file keeps the clean `@midnight-garage/content` import.
 *
 * Emits CSV, not Parquet — the sim/analysis boundary is the contract, not
 * the file format. `tools/balance/data/careers.manifest.json` carries an
 * explicit schema alongside the CSV so the Python side parses strictly
 * (declared dtypes), not by inference — that's the one real thing raw CSV
 * loses versus Parquet.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUYERS,
  CARS,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
  SERVICE_JOB_TEMPLATES,
} from '../../../content/src/data'
import { balancedPlayerStrategy } from '../bots/balancedPlayer'
import { cautiousRestorerStrategy } from '../bots/cautiousRestorer'
import { flipperStrategy } from '../bots/flipper'
import { passiveGrinderStrategy } from '../bots/passiveGrinder'
import { randomStrategy } from '../bots/randomStrategy'
import { serviceGrinderStrategy } from '../bots/serviceGrinder'
import { runCareer, sampleFieldSizes, type BotStrategy } from '../bots/runCareer'
import { buildSimContext } from '../context'

const CAREERS_PER_STRATEGY = 1000
const DAYS_PER_CAREER = 100
/** Field size is strategy-independent (catalog generation never reads
 * DayActions) — a much smaller, separate seed range is enough for a stable
 * average without re-deriving it once per strategy. */
const FIELD_SIZE_SAMPLE_SEEDS = 200
const SIM_VERSION = '0.0.1'
// `__dirname` here is inside the compiled output tree (dist/packages/sim/...),
// whose nesting depth depends on tsc's rootDir/outDir mirroring, not the
// source tree — fragile to key relative paths off. `pnpm balance:run`
// always runs with cwd set to packages/sim (pnpm's per-package script
// convention), so cwd + a fixed, shallow relative path is the stable
// anchor instead.
const OUTPUT_DIR = join(process.cwd(), '../../tools/balance/data')

const STRATEGIES: ReadonlyArray<{ name: string; strategy: BotStrategy }> = [
  { name: 'flipper', strategy: flipperStrategy },
  { name: 'cautious-restorer', strategy: cautiousRestorerStrategy },
  { name: 'balanced-player', strategy: balancedPlayerStrategy },
  { name: 'random', strategy: randomStrategy },
  { name: 'passive-grinder', strategy: passiveGrinderStrategy },
  { name: 'service-grinder', strategy: serviceGrinderStrategy },
]

const COLUMNS = [
  { name: 'strategy', type: 'string' },
  { name: 'seed', type: 'int64' },
  { name: 'day', type: 'int64' },
  { name: 'cashYen', type: 'int64' },
  { name: 'carsOwned', type: 'int64' },
  { name: 'netWorthEstimateYen', type: 'int64' },
  { name: 'reputationTier', type: 'string' },
] as const

/** win price as a fraction of [reserve, buyout], bucketed — the Sprint 10
 * decision 4f calibration target, checked against real bot play. */
const AUCTION_WINS_COLUMNS = [
  { name: 'strategy', type: 'string' },
  { name: 'seed', type: 'int64' },
  { name: 'day', type: 'int64' },
  { name: 'tier', type: 'string' },
  { name: 'fraction', type: 'float64' },
  { name: 'bucket', type: 'string' },
] as const

/** Rival field size the auction screen would have shown for each newly
 * appeared lot — strategy-independent, so one seed range covers every run. */
const FIELD_SIZES_COLUMNS = [
  { name: 'seed', type: 'int64' },
  { name: 'fieldSize', type: 'int64' },
] as const

function writeCsv(
  filename: string,
  columns: ReadonlyArray<{ name: string; type: string }>,
  rows: string[],
): void {
  const header = columns.map((c) => c.name).join(',')
  writeFileSync(join(OUTPUT_DIR, filename), [header, ...rows].join('\n') + '\n', 'utf-8')
}

function writeManifest(filename: string, manifest: Record<string, unknown>): void {
  writeFileSync(join(OUTPUT_DIR, filename), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
}

function main(): void {
  const context = buildSimContext(
    CARS,
    PARTS,
    BUYERS,
    HIDDEN_ISSUES,
    SERVICE_JOB_TEMPLATES,
    FACILITIES,
  )
  const rows: string[] = []
  const auctionWinRows: string[] = []

  for (const { name, strategy } of STRATEGIES) {
    for (let seed = 1; seed <= CAREERS_PER_STRATEGY; seed++) {
      const { snapshots, auctionWins } = runCareer(strategy, seed, DAYS_PER_CAREER, context)
      for (const snapshot of snapshots) {
        rows.push(
          [
            name,
            seed,
            snapshot.day,
            snapshot.cashYen,
            snapshot.carsOwned,
            snapshot.netWorthEstimateYen,
            snapshot.reputationTier,
          ].join(','),
        )
      }
      for (const win of auctionWins) {
        auctionWinRows.push(
          [name, seed, win.day, win.tier, win.fraction.toFixed(4), win.bucket].join(','),
        )
      }
    }
  }

  const fieldSizeRows: string[] = []
  for (let seed = 1; seed <= FIELD_SIZE_SAMPLE_SEEDS; seed++) {
    for (const fieldSize of sampleFieldSizes(seed, DAYS_PER_CAREER, context)) {
      fieldSizeRows.push([seed, fieldSize].join(','))
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })

  writeCsv('careers.csv', COLUMNS, rows)
  writeManifest('careers.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    careersPerStrategy: CAREERS_PER_STRATEGY,
    daysPerCareer: DAYS_PER_CAREER,
    strategies: STRATEGIES.map((s) => s.name),
    columns: COLUMNS,
  })

  writeCsv('auctionWins.csv', AUCTION_WINS_COLUMNS, auctionWinRows)
  writeManifest('auctionWins.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    columns: AUCTION_WINS_COLUMNS,
  })

  writeCsv('auctionFieldSizes.csv', FIELD_SIZES_COLUMNS, fieldSizeRows)
  writeManifest('auctionFieldSizes.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    sampleSeeds: FIELD_SIZE_SAMPLE_SEEDS,
    daysPerCareer: DAYS_PER_CAREER,
    columns: FIELD_SIZES_COLUMNS,
  })

  const strategyList = STRATEGIES.map((s) => s.name).join(', ')
  console.log(
    `Wrote ${rows.length} rows (${STRATEGIES.length} strategies [${strategyList}] x ${CAREERS_PER_STRATEGY} careers x ${DAYS_PER_CAREER} days) to ${OUTPUT_DIR}`,
  )
  console.log(
    `Wrote ${auctionWinRows.length} auction-win rows and ${fieldSizeRows.length} field-size rows to ${OUTPUT_DIR}`,
  )
}

main()
