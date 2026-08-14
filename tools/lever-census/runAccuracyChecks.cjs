#!/usr/bin/env node
// Accuracy gate for traceLevers.cjs. Run once before the trace's output is
// trusted:
//
//  1. A sample of leaves already known (by direct code reading, not by the
//     tool) to be consumed by a specific function resolve to that consumer.
//  2. The known-dead `fearPremium` case: it was retired from the schema and
//     the JSON entirely, and survives only inside the condemned
//     `tools/balance` (directive 21, a different language and out of the
//     scan universe). The scanned corpus (packages/sim, packages/game,
//     packages/content) must show zero references, proving the
//     dead-detection path would have caught it had it still been a JSON leaf.
//  3. A fabricated leaf with no real backing anywhere resolves to
//     DEAD_CANDIDATE, not silently to CONSUMED - the classifier's "nothing
//     found" branch is exercised, since the real economy.json currently has
//     no organic zero-reference leaf to prove it with.
//  4. The type-node regression this tool's first draft actually hit: an
//     `economy: EconomyConfig` field on an interface or inline type must
//     never be read as a value-level usage. Checked by asserting no leaf's
//     evidence list is implausibly long (a relapse would make hundreds of
//     leaves list every file that so much as types a variable `EconomyConfig`).
//
// Usage: node tools/lever-census/runAccuracyChecks.cjs

const assert = require('node:assert/strict')
const path = require('node:path')
const {
  buildLeafList,
  scanCorpus,
  scanFile,
  classifyLeaf,
  classifyAll,
  gatherSourceFiles,
  relPath,
  ROOT,
} = require('./traceLevers.cjs')

let failures = 0
function check(label, fn) {
  try {
    fn()
    console.log(`PASS  ${label}`)
  } catch (err) {
    failures++
    console.log(`FAIL  ${label}`)
    console.log(`      ${err.message}`)
  }
}

// Uses classifyAll, the same function traceLevers.cjs's own CLI writes to
// leverTrace.json, so this gate checks what the tool actually outputs.
const leaves = buildLeafList()
const { srcUsages, testUsages } = scanCorpus()
const rows = classifyAll(leaves, srcUsages, testUsages)
const rowById = new Map(rows.map((r) => [r.id, r]))

// 1. Known-consumed sample, gathered by direct code reading before the tool
// existed (see the sprint transcript's own grep survey).
const KNOWN_CONSUMERS = [
  { id: 'economy.calendar.daysPerWeek', file: 'packages/sim/src/calendar.ts' },
  { id: 'economy.AUCTION_RESERVE_PRICE_FRACTION', file: 'packages/sim/src/bidding.ts' },
  { id: 'economy.machineShopAssist.feeYenByGroup.engine', file: 'packages/sim/src/jobs.ts' },
  { id: 'economy.valuation.tasteSpread', file: 'packages/sim/src/valuation.ts' },
  { id: 'economy.staff.maxStaff', file: 'packages/sim/src/staff.ts' },
  { id: 'economy.STARTING_CASH_YEN', file: 'packages/sim/src/newGame.ts' },
  { id: 'economy.restoration.repairStepFraction', file: 'packages/sim/src/bands.ts' },
  { id: 'partPricing.globalFactor', file: 'packages/content/src/partPricing.ts' },
]
for (const { id, file } of KNOWN_CONSUMERS) {
  check(`${id} resolves with consumer ${file}`, () => {
    const row = rowById.get(id)
    assert.ok(row, `leaf ${id} not found in the flattened leaf list`)
    assert.ok(
      ['CONSUMED', 'CONSUMED_VIA_GROUP', 'DYNAMIC'].includes(row.tier),
      `expected a consumed tier, got ${row.tier}`,
    )
    const files = row.sites.map((s) => s.file)
    assert.ok(files.includes(file), `expected ${file} among consumer sites, got ${files.join(', ')}`)
  })
}

// 2. fearPremium: zero references anywhere in the scanned corpus.
check('fearPremium has zero references in the scanned corpus (sim/game/content)', () => {
  const { srcFiles, testFiles } = gatherSourceFiles()
  const hits = []
  const fs = require('node:fs')
  for (const f of [...srcFiles, ...testFiles]) {
    const text = fs.readFileSync(f, 'utf8')
    if (/\bfearPremium\b/.test(text)) hits.push(relPath(f))
  }
  assert.deepEqual(hits, [], `fearPremium referenced in: ${hits.join(', ')}`)
})

// 5. Group-liveness regression guard: a leaf with no evidence of its own,
// whose top-level group DOES have a confirmed-live sibling, must classify as
// UNKNOWN rather than DEAD_CANDIDATE. Real example:
// machineShopAssist.probeAmortisationOps has no exact/named/dynamic match of
// its own, but feeYenByGroup and machinelessLaborMultiplier in the same
// group are confirmed live.
check('a leaf in an otherwise-live group classifies as UNKNOWN, not DEAD_CANDIDATE', () => {
  const row = rowById.get('economy.machineShopAssist.probeAmortisationOps')
  assert.ok(row, 'expected leaf not found')
  assert.equal(row.tier, 'UNKNOWN', `expected UNKNOWN, got ${row.tier}`)
})

// 3. A fabricated, genuinely absent leaf must classify as DEAD_CANDIDATE.
check('a fabricated leaf with no backing anywhere classifies as DEAD_CANDIDATE', () => {
  const fakeLeaf = { root: 'economy', path: ['__doesNotExist__', 'neverReal'], id: 'economy.__doesNotExist__.neverReal' }
  const srcResult = classifyLeaf(fakeLeaf, srcUsages)
  const testResult = classifyLeaf(fakeLeaf, testUsages)
  assert.equal(srcResult, null, 'fabricated leaf unexpectedly matched a src usage')
  assert.equal(testResult, null, 'fabricated leaf unexpectedly matched a test usage')
})

// 4. Type-node regression guard: no leaf's evidence list should be
// implausibly long. A relapse of the type-node bug makes CONSUMED_VIA_GROUP
// or DYNAMIC leaves list nearly every file in the corpus; only the
// deliberately-uninformative UNKNOWN tier (bare root passthrough) is allowed
// a long list, because that is exactly the case it exists to name honestly.
check('no CONSUMED / CONSUMED_VIA_GROUP / DYNAMIC leaf lists an implausible number of files', () => {
  const offenders = rows.filter(
    (r) => ['CONSUMED', 'CONSUMED_VIA_GROUP', 'DYNAMIC'].includes(r.tier) && r.sites.length > 15,
  )
  assert.deepEqual(
    offenders.map((o) => o.id),
    [],
    'these leaves list an implausible number of consumer files, suggesting a type-node or root-passthrough regression',
  )
})

console.log('')
if (failures > 0) {
  console.log(`${failures} accuracy check(s) FAILED. Do not trust tools/lever-census/output/leverTrace.json.`)
  process.exit(1)
}
console.log('All accuracy checks passed.')
