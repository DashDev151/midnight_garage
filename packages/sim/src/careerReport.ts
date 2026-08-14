import { CASH_BUCKETS } from '@midnight-garage/content'
import type { EconomyConfig } from '@midnight-garage/content'
import { dayFlowFor, weeklyFlowFor } from './careerFlow'
import type { CareerReplayResult } from './careerReplay'

/** `¥1,234,567` - the report's one number formatter, so every yen figure on
 * the page reads the same way. Plain `toLocaleString`, not a game-layer
 * formatter: sim never depends on the game package (the boundary law runs
 * the other way), and a markdown report has no locale/currency-symbol
 * settings of its own to respect. */
function yen(amountYen: number): string {
  return `¥${amountYen.toLocaleString('en-US')}`
}

function pct(used: number, available: number): string {
  if (available <= 0) return '0%'
  return `${Math.round((used / available) * 100)}%`
}

const BUCKET_LABELS: Record<(typeof CASH_BUCKETS)[number], string> = {
  income: 'Income',
  onCars: 'On cars',
  stock: 'Stock',
  running: 'Running',
  investment: 'Investment',
}

/**
 * Renders one script's replay result as a single markdown page: the cash
 * curve, labour utilisation and reputation per day (curves, not endpoints,
 * per the sprint's own design), the weekly faucet-and-sink table by cash
 * bucket, and the checkpoint disclosure. Pure and synchronous - the CLI
 * (`cli/careerReport.ts`) owns every file write, this only builds the
 * string.
 */
export function renderCareerReportPage(result: CareerReplayResult, economy: EconomyConfig): string {
  const { script, snapshots, dayLogs, checkpoints, finalState } = result
  const flowSeries = dayLogs.map((log, i) => dayFlowFor(snapshots[i]?.day ?? i + 1, log))
  const weeklyFlow = weeklyFlowFor(flowSeries, economy)

  const lines: string[] = []
  lines.push(`# Career report: ${script.name}`)
  lines.push('')
  lines.push(script.description)
  lines.push('')
  lines.push(
    `${script.synthetic ? 'SYNTHETIC fixture' : 'Recorded session'} - seed ${script.seed} - ` +
      `${script.days.length} day(s) - final cash ${yen(finalState.cashYen)} - ` +
      `${finalState.ownedCars.length} car(s) owned - reputation ${finalState.reputationTier} ` +
      `(${finalState.reputationPoints} pts)`,
  )
  lines.push('')

  lines.push('## Cash curve')
  lines.push('')
  lines.push('| Day | Cash | Net worth | Cars owned | Reputation |')
  lines.push('|---:|---:|---:|---:|---|')
  for (const snapshot of snapshots) {
    lines.push(
      `| ${snapshot.day} | ${yen(snapshot.cashYen)} | ${yen(snapshot.netWorthEstimateYen)} | ` +
        `${snapshot.carsOwned} | ${snapshot.reputationTier} (${snapshot.reputationPoints}) |`,
    )
  }
  lines.push('')

  lines.push('## Labour utilisation')
  lines.push('')
  lines.push('| Day | Used | Available | Utilisation |')
  lines.push('|---:|---:|---:|---:|')
  for (const snapshot of snapshots) {
    lines.push(
      `| ${snapshot.day} | ${snapshot.labourSlotsUsed} | ${snapshot.labourSlotsAvailable} | ` +
        `${pct(snapshot.labourSlotsUsed, snapshot.labourSlotsAvailable)} |`,
    )
  }
  lines.push('')

  lines.push('## Weekly cost sheet')
  lines.push('')
  lines.push('| Week | Income | On cars | Stock | Running | Investment | Net |')
  lines.push('|---:|---:|---:|---:|---:|---:|---:|')
  for (const [weekKey, week] of Object.entries(weeklyFlow).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    const net = week.income - (week.onCars + week.stock + week.running + week.investment)
    lines.push(
      `| ${weekKey} | ${yen(week.income)} | ${yen(week.onCars)} | ${yen(week.stock)} | ` +
        `${yen(week.running)} | ${yen(week.investment)} | ${yen(net)} |`,
    )
  }
  if (Object.keys(weeklyFlow).length === 0) {
    lines.push('| (no cash movement this career) | | | | | | |')
  }
  lines.push('')
  lines.push(
    `Buckets: ${CASH_BUCKETS.map((b) => BUCKET_LABELS[b]).join(', ')} - the same five lines the ` +
      "in-game cost sheet reports, classified by content's own `cashMovementFor` and nothing else.",
  )
  lines.push('')

  lines.push('## Checkpoints')
  lines.push('')
  if (checkpoints.length === 0) {
    lines.push('(none declared by this script)')
  } else {
    lines.push('| Day | Kind | Expected | Actual | Passed |')
    lines.push('|---:|---|---|---|---|')
    for (const outcome of checkpoints) {
      const isCashCheckpoint = 'amountYen' in outcome.checkpoint
      const expected =
        'expected' in outcome.checkpoint
          ? outcome.checkpoint.expected
          : 'amountYen' in outcome.checkpoint
            ? yen(outcome.checkpoint.amountYen)
            : 'count' in outcome.checkpoint
              ? String(outcome.checkpoint.count)
              : 'tier' in outcome.checkpoint
                ? outcome.checkpoint.tier
                : String(outcome.checkpoint.slots)
      // `actual` is a bare number string off the replay result - yen-format
      // it here too so a cash checkpoint's expected/actual columns read the
      // same way, without making the underlying figure itself formatted
      // text (other callers may want the raw number).
      const actual = isCashCheckpoint ? yen(Number(outcome.actual)) : outcome.actual
      lines.push(
        `| ${outcome.day} | ${outcome.checkpoint.kind} | ${expected} | ${actual} | ` +
          `${outcome.passed ? 'yes' : 'NO'} |`,
      )
    }
  }
  lines.push('')

  return lines.join('\n')
}
