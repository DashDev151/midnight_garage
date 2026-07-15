/**
 * Balance-harness data export (Sprint 03 decision 1). Compiled separately
 * (tsconfig.cli.json) to plain CommonJS and run via `node`, not
 * Vite/Vitest - the harness needs a real Node process to write files, and
 * plain Node can't execute TypeScript or resolve `@midnight-garage/content`'s
 * live-source package export at runtime the way Vite's dev/test transform
 * does. This file therefore reaches into content's source via a relative
 * path instead of the normal package specifier - a deliberate, scoped
 * exception for this one build-and-run CLI entry point; every other sim
 * file keeps the clean `@midnight-garage/content` import.
 *
 * Emits CSV, not Parquet - the sim/analysis boundary is the contract, not
 * the file format. `tools/balance/data/careers.manifest.json` carries an
 * explicit schema alongside the CSV so the Python side parses strictly
 * (declared dtypes), not by inference - that's the one real thing raw CSV
 * loses versus Parquet.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
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
import { balancedPlayerStrategy } from '../bots/balancedPlayer'
import { cautiousRestorerStrategy } from '../bots/cautiousRestorer'
import { competentPolicyStrategy } from '../bots/competentPolicy'
import { flipperStrategy } from '../bots/flipper'
import { handymanStrategy } from '../bots/handyman'
import { investorStrategy } from '../bots/investor'
import { passiveGrinderStrategy } from '../bots/passiveGrinder'
import { randomStrategy } from '../bots/randomStrategy'
import { serviceGrinderStrategy } from '../bots/serviceGrinder'
import { runCareer, type BotStrategy } from '../bots/runCareer'
import { computeRosterCoherence } from '../coherence'
import { buildSimContext } from '../context'

const CAREERS_PER_STRATEGY = 1000
const DAYS_PER_CAREER = 100
const SIM_VERSION = '0.0.1'
// `__dirname` here is inside the compiled output tree (dist/packages/sim/...),
// whose nesting depth depends on tsc's rootDir/outDir mirroring, not the
// source tree - fragile to key relative paths off. `pnpm balance:run`
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
  { name: 'handyman', strategy: handymanStrategy },
  { name: 'investor', strategy: investorStrategy },
  { name: 'competent-policy', strategy: competentPolicyStrategy },
]

const COLUMNS = [
  { name: 'strategy', type: 'string' },
  { name: 'seed', type: 'int64' },
  { name: 'day', type: 'int64' },
  { name: 'cashYen', type: 'int64' },
  { name: 'carsOwned', type: 'int64' },
  { name: 'netWorthEstimateYen', type: 'int64' },
  { name: 'reputationTier', type: 'string' },
  { name: 'reputationPoints', type: 'int64' },
  { name: 'equipmentOwnedCount', type: 'int64' },
  { name: 'specialtyTopGroup', type: 'string' },
  { name: 'specialtyTopPoints', type: 'int64' },
] as const

/** win price as a fraction of [reserve, buyout], bucketed - the Sprint 10
 * decision 4f calibration target, checked against real bot play.
 * `bidEvents`/`daysOpen` (Sprint 30 decision 3) are the daily
 * bidder-interest process's own telemetry: how contested a lot was and how
 * long it stayed on the board before resolving. */
const AUCTION_WINS_COLUMNS = [
  { name: 'strategy', type: 'string' },
  { name: 'seed', type: 'int64' },
  { name: 'day', type: 'int64' },
  { name: 'tier', type: 'string' },
  { name: 'fraction', type: 'float64' },
  { name: 'bucket', type: 'string' },
  { name: 'bidEvents', type: 'int64' },
  { name: 'daysOpen', type: 'int64' },
] as const

/** One successful auction acquisition, by channel - external review 2026-07
 * finding 2's buyout-vs-bid telemetry. */
const ACQUISITIONS_COLUMNS = [
  { name: 'strategy', type: 'string' },
  { name: 'seed', type: 'int64' },
  { name: 'day', type: 'int64' },
  { name: 'tier', type: 'string' },
  { name: 'channel', type: 'string' },
] as const

/** One offer a for-sale car drew (Sprint 31 decision 3) - `carEpisodeId` is a
 * synthetic per-career counter (see `runCareer.ts`'s `OfferSample` doc
 * comment), not the real game car id: the report section groups by it to
 * reconstruct one car's day-by-day offer history (median days-to-sell,
 * "beat the first offer by 10% within 5 days"). */
const OFFERS_COLUMNS = [
  { name: 'strategy', type: 'string' },
  { name: 'seed', type: 'int64' },
  { name: 'carEpisodeId', type: 'int64' },
  { name: 'day', type: 'int64' },
  { name: 'tier', type: 'string' },
  { name: 'offerYen', type: 'int64' },
  { name: 'valueYen', type: 'int64' },
  { name: 'accepted', type: 'bool' },
] as const

/** Sprint 55 (economy-bible.md law 4): one row per roster model, the
 * closed-form coherence facts `computeRosterCoherence` derives by calling
 * the real Law 1/Law 2 sim functions directly - no seeded careers needed,
 * so this exports once, not per-seed. */
const COHERENCE_COLUMNS = [
  { name: 'modelId', type: 'string' },
  { name: 'fitmentClass', type: 'string' },
  { name: 'cleanValueYen', type: 'int64' },
  { name: 'worstBillYen', type: 'int64' },
  { name: 'billToCleanRatio', type: 'float64' },
  { name: 'flipMarginYen', type: 'int64' },
  { name: 'flipMarginFraction', type: 'float64' },
  { name: 'sensibleFlipMarginYen', type: 'int64' },
  { name: 'sensibleFlipMarginFraction', type: 'float64' },
  { name: 'consumablesCostYen', type: 'int64' },
  { name: 'consumablesShare', type: 'float64' },
  { name: 'repairCostYen', type: 'int64' },
  { name: 'repairLaborSlots', type: 'int64' },
  { name: 'repairGainYen', type: 'int64' },
  { name: 'rentDuringRepairYen', type: 'int64' },
  { name: 'wageMarginYen', type: 'int64' },
  { name: 'wageRatio', type: 'float64' },
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
    PARTS_TAXONOMY,
    SERVICE_JOB_TYPES,
    FACILITIES,
    SERVICE_JOB_CUSTOMER_NAMES,
    TOOL_LINES,
    ECONOMY,
  )
  const rows: string[] = []
  const auctionWinRows: string[] = []
  const acquisitionRows: string[] = []
  const offerRows: string[] = []

  for (const { name, strategy } of STRATEGIES) {
    for (let seed = 1; seed <= CAREERS_PER_STRATEGY; seed++) {
      const { snapshots, auctionWins, acquisitions, offers } = runCareer(
        strategy,
        seed,
        DAYS_PER_CAREER,
        context,
      )
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
            snapshot.reputationPoints,
            snapshot.equipmentOwnedCount,
            snapshot.specialtyTopGroup,
            snapshot.specialtyTopPoints,
          ].join(','),
        )
      }
      for (const win of auctionWins) {
        auctionWinRows.push(
          [
            name,
            seed,
            win.day,
            win.tier,
            win.fraction.toFixed(4),
            win.bucket,
            win.bidEvents,
            win.daysOpen,
          ].join(','),
        )
      }
      for (const acquisition of acquisitions) {
        acquisitionRows.push(
          [name, seed, acquisition.day, acquisition.tier, acquisition.channel].join(','),
        )
      }
      for (const offer of offers) {
        offerRows.push(
          [
            name,
            seed,
            offer.carEpisodeId,
            offer.day,
            offer.tier,
            offer.offerYen,
            offer.valueYen,
            offer.accepted,
          ].join(','),
        )
      }
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
    // Sprint 23: so the Python check validates against the values that
    // actually ran this export, not a second, drift-prone copy in Python.
    startingCashYen: ECONOMY.STARTING_CASH_YEN,
    weeklyRentYen: ECONOMY.WEEKLY_RENT_YEN,
  })

  writeCsv('auctionWins.csv', AUCTION_WINS_COLUMNS, auctionWinRows)
  writeManifest('auctionWins.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    columns: AUCTION_WINS_COLUMNS,
  })

  writeCsv('acquisitions.csv', ACQUISITIONS_COLUMNS, acquisitionRows)
  writeManifest('acquisitions.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    columns: ACQUISITIONS_COLUMNS,
  })

  writeCsv('offers.csv', OFFERS_COLUMNS, offerRows)
  writeManifest('offers.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    columns: OFFERS_COLUMNS,
  })

  const coherenceRows = computeRosterCoherence(CARS, context).map((row) =>
    [
      row.modelId,
      row.fitmentClass,
      row.cleanValueYen,
      row.worstBillYen,
      row.billToCleanRatio.toFixed(6),
      row.flipMarginYen,
      row.flipMarginFraction.toFixed(6),
      row.sensibleFlipMarginYen,
      row.sensibleFlipMarginFraction.toFixed(6),
      row.consumablesCostYen,
      row.consumablesShare.toFixed(6),
      row.repairCostYen,
      row.repairLaborSlots,
      row.repairGainYen,
      row.rentDuringRepairYen,
      row.wageMarginYen,
      row.wageRatio.toFixed(6),
    ].join(','),
  )
  writeCsv('coherence.csv', COHERENCE_COLUMNS, coherenceRows)
  writeManifest('coherence.manifest.json', {
    simVersion: SIM_VERSION,
    generatedFrom: 'packages/sim/src/cli/exportCareers.ts',
    columns: COHERENCE_COLUMNS,
    // Sprint 55: the two content thresholds the Python coherence checks
    // gate against, sourced from the same economy.json this export actually
    // ran with (Sprint 23's own "validate against the real run" precedent).
    maxBillFraction: ECONOMY.partsGeneration.maxBillFraction,
    maxConsumablesShareOfBookValue: ECONOMY.coherence.maxConsumablesShareOfBookValue,
    payoutMarginMin: ECONOMY.serviceJobs.marginMin,
    payoutRequiredCoverage: 1.15,
  })

  const strategyList = STRATEGIES.map((s) => s.name).join(', ')
  console.log(
    `Wrote ${rows.length} rows (${STRATEGIES.length} strategies [${strategyList}] x ${CAREERS_PER_STRATEGY} careers x ${DAYS_PER_CAREER} days) to ${OUTPUT_DIR}`,
  )
  console.log(
    `Wrote ${auctionWinRows.length} auction-win rows, ${acquisitionRows.length} acquisition rows, and ${offerRows.length} offer rows to ${OUTPUT_DIR}`,
  )
  console.log(`Wrote ${coherenceRows.length} coherence rows to ${OUTPUT_DIR}`)
}

main()
