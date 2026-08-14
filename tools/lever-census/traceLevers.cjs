#!/usr/bin/env node
// Static trace of every leaf in economy.json and partPricing.json against
// packages/sim, packages/game and packages/content. For each leaf it records
// whether a real property-access chain in the source resolves to that exact
// path, to an ancestor object passed around whole, to a dynamically indexed
// object, or to nothing found at all.
//
// This is a syntactic walk (TypeScript's own parser, no type checker, no
// cross-file call graph): it tracks, per file, which local identifiers alias
// the economy config or the part-pricing sheet (by name convention and by
// following `const x = economy.group` / destructuring), then records every
// property-access chain rooted at one of those aliases. A chain that ends
// mid-object (passed to a function, spread, stringified) is recorded as a
// whole-value use of that ancestor path, not as proof every leaf beneath it
// is individually read. A chain broken by a non-literal index
// (`sheet.baseCostYen[basisId]`) is recorded as a dynamic use of the base
// path. Anything the walk cannot resolve is left unmatched rather than
// guessed at - the leaf then reports UNKNOWN or DEAD-CANDIDATE, never a
// confident "dead", because a false dead verdict is the one failure mode
// that could get a live lever deleted.
//
// Known limitation, stated rather than hidden: alias tracking is per FILE,
// not per lexical scope, so two same-named locals in different functions of
// one file share an alias entry. This can only make a genuinely dead leaf
// look consumed (the safe direction), never the reverse.
//
// Usage:
//   node tools/lever-census/traceLevers.cjs
// Writes tools/lever-census/output/leverTrace.json (regenerable, gitignored)
// and prints a per-group summary to stdout.

const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const ROOT = path.join(__dirname, '..', '..')

const ECONOMY_JSON_PATH = path.join(ROOT, 'packages/content/data/economy.json')
const PART_PRICING_JSON_PATH = path.join(ROOT, 'packages/content/data/partPricing.json')

const SCAN_ROOTS = [
  'packages/sim/src',
  'packages/sim/tests',
  'packages/game/src',
  'packages/content/src',
  'packages/content/tests',
]

// Provenance/governance files, not consumers: the approval gate hashes the
// whole object, which would otherwise make every single leaf look "used"
// here. Excluded from the scan entirely; economyApprovalGate.test.ts's own
// header comment remains the changelog of what moved and why.
const EXCLUDED_FILES = new Set([
  path.join(ROOT, 'packages/content/tests/economyApprovalGate.test.ts'),
])

const ECONOMY_SEED_NAMES = ['economy', 'ECONOMY']
const PART_PRICING_SEED_NAMES = ['partPricing', 'partPricingJson', 'PART_PRICING_SHEET']
// 'sheet' is a plausible parameter name collision (dyno sheet, machine-shop
// sheet, cost sheet all use it too), so it is only seeded as a partPricing
// alias inside the two files that actually type a parameter `sheet:
// PartPricingSheet`.
const SHEET_ALIAS_FILES = new Set(['partPricing.ts', 'part.ts'])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

/** Flattens a JSON value into leaf descriptors. Arrays are walked
 * element-by-element (an index is a path segment) so every scalar in the
 * content files ends up as one leaf. */
function flattenLeaves(value, rootName, pathSoFar, out) {
  if (value === null || typeof value !== 'object') {
    out.push({ root: rootName, path: pathSoFar.slice(), id: `${rootName}.${pathSoFar.join('.')}` })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => flattenLeaves(item, rootName, [...pathSoFar, String(i)], out))
    return
  }
  for (const key of Object.keys(value)) {
    flattenLeaves(value[key], rootName, [...pathSoFar, key], out)
  }
}

function buildLeafList() {
  const economy = readJson(ECONOMY_JSON_PATH)
  const partPricing = readJson(PART_PRICING_JSON_PATH)
  const leaves = []
  for (const key of Object.keys(economy)) {
    flattenLeaves(economy[key], 'economy', [key], leaves)
  }
  for (const key of Object.keys(partPricing)) {
    flattenLeaves(partPricing[key], 'partPricing', [key], leaves)
  }
  return leaves
}

function walkFiles(dirAbs, out) {
  if (!fs.existsSync(dirAbs)) return
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'archive') continue
    const full = path.join(dirAbs, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, out)
    } else if (/\.(ts|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
}

function gatherSourceFiles() {
  const all = []
  for (const rel of SCAN_ROOTS) walkFiles(path.join(ROOT, rel), all)
  const files = all.filter((f) => !EXCLUDED_FILES.has(f))
  const isTest = (f) => /\.test\.(ts|vue)$/.test(f)
  return {
    srcFiles: files.filter((f) => !isTest(f)),
    testFiles: files.filter(isTest),
  }
}

/** Replaces everything outside `<script>...</script>` blocks with spaces
 * (newlines kept), so line/column numbers in the parsed result still match
 * the original .vue file. Returns null for a .vue file with no script block. */
function extractVueScript(text) {
  const ranges = []
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(text))) {
    const innerStart = m.index + m[0].indexOf(m[1])
    const innerEnd = innerStart + m[1].length
    ranges.push([innerStart, innerEnd])
  }
  if (ranges.length === 0) return null
  const chars = text.split('')
  for (let i = 0; i < chars.length; i++) {
    const kept = ranges.some(([s, e]) => i >= s && i < e)
    if (!kept && chars[i] !== '\n') chars[i] = ' '
  }
  return chars.join('')
}

function isChainBase(node) {
  const p = node.parent
  if (!p) return false
  if (ts.isPropertyAccessExpression(p) && p.expression === node) return true
  if (ts.isElementAccessExpression(p) && p.expression === node) return true
  return false
}

function isPropertyKeyPosition(node) {
  const p = node.parent
  if (!p) return false
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true
  return false
}

function isDeclarationNamePosition(node) {
  const p = node.parent
  if (!p) return false
  if (ts.isBindingElement(p) && (p.name === node || p.propertyName === node)) return true
  if (ts.isVariableDeclaration(p) && p.name === node) return true
  if (ts.isParameter(p) && p.name === node) return true
  if (ts.isPropertyAssignment(p) && p.name === node) return true
  if (ts.isShorthandPropertyAssignment(p) && p.name === node) return true
  return false
}

function unwrap(node) {
  let n = node
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isNonNullExpression(n) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n))
  ) {
    n = ts.isParenthesizedExpression(n) ? n.expression : n.expression
  }
  return n
}

/** Result shape: { root: 'economy'|'partPricing', segments: string[], dynamic: boolean } */
function extendPath(base, segment) {
  return { root: base.root, segments: [...base.segments, segment], dynamic: base.dynamic }
}

function markDynamic(base) {
  return { root: base.root, segments: base.segments, dynamic: true }
}

function resolveExprPath(nodeIn, aliasMap) {
  const node = unwrap(nodeIn)
  if (ts.isIdentifier(node)) {
    return aliasMap.get(node.text) ?? null
  }
  if (ts.isPropertyAccessExpression(node)) {
    const base = resolveExprPath(node.expression, aliasMap)
    if (base) return extendPath(base, node.name.text)
    if (node.name.text === 'economy') return { root: 'economy', segments: [], dynamic: false }
    return null
  }
  if (ts.isElementAccessExpression(node)) {
    const base = resolveExprPath(node.expression, aliasMap)
    if (!base) return null
    const arg = node.argumentExpression
    if (arg && ts.isStringLiteralLike(arg)) return extendPath(base, arg.text)
    if (arg && ts.isNumericLiteral(arg)) return extendPath(base, arg.text)
    return markDynamic(base)
  }
  return null
}

function pathKey(root, segments) {
  return `${root}.${segments.join('.')}`
}

function getIdentifierText(node) {
  return node && ts.isIdentifier(node) ? node.text : null
}

/** Parses one file and returns the usages it found: an array of
 * { root, path: string, dynamic, line, file }. */
function scanFile(fileAbs, relFile) {
  const raw = fs.readFileSync(fileAbs, 'utf8')
  const text = fileAbs.endsWith('.vue') ? extractVueScript(raw) : raw
  if (text === null) return []

  const scriptKind = fileAbs.endsWith('.vue') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(fileAbs, text, ts.ScriptTarget.Latest, true, scriptKind)

  const aliasMap = new Map()
  for (const name of ECONOMY_SEED_NAMES) aliasMap.set(name, { root: 'economy', segments: [], dynamic: false })
  for (const name of PART_PRICING_SEED_NAMES)
    aliasMap.set(name, { root: 'partPricing', segments: [], dynamic: false })
  const basename = path.basename(fileAbs)
  if (SHEET_ALIAS_FILES.has(basename)) {
    aliasMap.set('sheet', { root: 'partPricing', segments: [], dynamic: false })
  }

  const usages = []
  function record(resolved, node) {
    if (!resolved) return
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    usages.push({
      root: resolved.root,
      path: resolved.segments.join('.'),
      dynamic: resolved.dynamic,
      line: line + 1,
      file: relFile,
    })
  }

  function registerAliasesFromDeclaration(declNode) {
    if (!declNode.initializer) return
    const resolved = resolveExprPath(declNode.initializer, aliasMap)
    if (!resolved) return
    if (ts.isIdentifier(declNode.name)) {
      aliasMap.set(declNode.name.text, resolved)
      return
    }
    if (ts.isObjectBindingPattern(declNode.name)) {
      for (const element of declNode.name.elements) {
        if (element.dotDotDotToken) continue
        const propName = element.propertyName
          ? element.propertyName.getText(sourceFile).replace(/['"]/g, '')
          : getIdentifierText(element.name)
        const localName = getIdentifierText(element.name)
        if (propName && localName) {
          aliasMap.set(localName, extendPath(resolved, propName))
        }
      }
    }
  }

  function visit(node) {
    // Type space never contains a value-level read: an `economy: EconomyConfig`
    // field on an interface or inline object type is a shape, not a usage, and
    // walking it would otherwise make every consumer of the *type* look like a
    // consumer of every leaf.
    if (ts.isTypeNode(node)) return
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return
    if (ts.isVariableDeclaration(node)) {
      registerAliasesFromDeclaration(node)
      ts.forEachChild(node, visit)
      return
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      if (!isChainBase(node)) {
        const resolved = resolveExprPath(node, aliasMap)
        record(resolved, node)
      }
      visit(node.expression)
      if (ts.isElementAccessExpression(node) && node.argumentExpression) {
        visit(node.argumentExpression)
      }
      return
    }
    if (ts.isIdentifier(node)) {
      if (!isChainBase(node) && !isPropertyKeyPosition(node) && !isDeclarationNamePosition(node)) {
        const resolved = aliasMap.get(node.text)
        record(resolved, node)
      }
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return usages
}

function relPath(fileAbs) {
  return path.relative(ROOT, fileAbs).split(path.sep).join('/')
}

function scanCorpus() {
  const { srcFiles, testFiles } = gatherSourceFiles()
  const srcUsages = []
  const testUsages = []
  for (const f of srcFiles) srcUsages.push(...scanFile(f, relPath(f)))
  for (const f of testFiles) testUsages.push(...scanFile(f, relPath(f)))
  return { srcUsages, testUsages, srcFileCount: srcFiles.length, testFileCount: testFiles.length }
}

/**
 * Longest-prefix classification of one leaf against a usage list, strongest
 * evidence first. Deliberately does NOT treat the bare root (`economy` or
 * `partPricing` passed whole to some function, unresolved further) as
 * evidence for a specific leaf: that pattern is universal in this codebase
 * (`context.economy` is threaded through nearly every module) and matches
 * every leaf equally, including ones that do not exist - proven by this
 * tool's own accuracy check, which fabricates a leaf with no real backing
 * and confirms it does NOT match here. Root passthrough is folded into
 * group-level liveness instead, by `classifyAll` below.
 *
 *  1. CONSUMED - a chain resolves to this exact leaf (or reads past it), HIGH.
 *  2. CONSUMED_VIA_GROUP - a NAMED ancestor object (not the bare root) is
 *     handed to a function or spread whole, MEDIUM. Informative: it names the
 *     subgroup, even though the exact field inside it is not pinned down.
 *  3. DYNAMIC - a bracket access with a non-literal key reaches this leaf's
 *     branch, LOW-MEDIUM: some key under here is read, this one plausibly is.
 *  4. no match -> null. The caller decides between UNKNOWN (this leaf's own
 *     group has other confirmed-live leaves) and DEAD_CANDIDATE (it does not).
 */
function classifyLeaf(leaf, usages) {
  const leafKey = leaf.path.join('.')
  const sameRoot = usages.filter((u) => u.root === leaf.root)

  const exactOrDescendant = sameRoot.filter((u) => {
    if (u.dynamic) return false
    if (u.path === leafKey) return true
    return u.path.startsWith(`${leafKey}.`)
  })
  if (exactOrDescendant.length > 0) {
    return { tier: 'CONSUMED', confidence: 'HIGH', sites: dedupeSites(exactOrDescendant) }
  }

  const namedAncestor = sameRoot.filter((u) => {
    if (u.dynamic) return false
    if (u.path === '') return false // the bare root is not informative, see the doc comment above
    return leafKey.startsWith(`${u.path}.`)
  })
  if (namedAncestor.length > 0) {
    return { tier: 'CONSUMED_VIA_GROUP', confidence: 'MEDIUM', sites: dedupeSites(namedAncestor) }
  }

  const dynamicAncestor = sameRoot.filter((u) => {
    if (!u.dynamic) return false
    if (u.path === '') return false // dynamic indexing straight off the bare root carries the same non-evidence problem
    return leafKey === u.path || leafKey.startsWith(`${u.path}.`)
  })
  if (dynamicAncestor.length > 0) {
    return { tier: 'DYNAMIC', confidence: 'LOW', sites: dedupeSites(dynamicAncestor) }
  }

  return null
}

function dedupeSites(usages) {
  const byFile = new Map()
  for (const u of usages) {
    if (!byFile.has(u.file)) byFile.set(u.file, { file: u.file, line: u.line, count: 0 })
    byFile.get(u.file).count++
  }
  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file))
}

function groupKeyOf(leaf) {
  return `${leaf.root}.${leaf.path[0]}`
}

/**
 * Classifies every leaf in two passes, per sprint199.md's B1 ("classify by
 * GROUP first"): pass one resolves each leaf against the src corpus with no
 * root-passthrough fallback; pass two uses that to decide, for every leaf
 * still unresolved, between UNKNOWN (its own top-level group has at least
 * one other leaf with real evidence, so the group is live even though this
 * exact field was not individually pinned down) and DEAD_CANDIDATE (nothing
 * in the group resolved at all - the strongest static signal this tool can
 * produce, still checked against the test corpus before it is reported).
 */
function classifyAll(leaves, srcUsages, testUsages) {
  const srcResults = leaves.map((leaf) => ({ leaf, result: classifyLeaf(leaf, srcUsages) }))

  const liveGroups = new Map() // groupKey -> representative evidence sites
  for (const { leaf, result } of srcResults) {
    if (!result) continue
    const key = groupKeyOf(leaf)
    if (!liveGroups.has(key)) liveGroups.set(key, [])
    liveGroups.get(key).push(...result.sites)
  }

  return srcResults.map(({ leaf, result }) => {
    if (result) return { ...leaf, ...result, scannedIn: 'src' }

    const key = groupKeyOf(leaf)
    if (liveGroups.has(key)) {
      const groupSites = dedupeSites(
        liveGroups.get(key).map((s) => ({ file: s.file, line: s.line })),
      ).slice(0, 5)
      return {
        ...leaf,
        tier: 'UNKNOWN',
        confidence: 'LOW',
        sites: groupSites,
        scannedIn: 'src-group-live',
      }
    }

    const testResult = classifyLeaf(leaf, testUsages)
    if (testResult) {
      return {
        ...leaf,
        tier: 'DEAD_CANDIDATE',
        confidence: 'TEST_ONLY',
        sites: testResult.sites,
        scannedIn: 'test-only',
      }
    }
    return { ...leaf, tier: 'DEAD_CANDIDATE', confidence: 'NONE', sites: [], scannedIn: 'none' }
  })
}

function groupSummary(rows) {
  const byGroup = new Map()
  for (const row of rows) {
    const groupKey = `${row.root}.${row.path[0]}`
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, { group: groupKey, total: 0, tiers: {} })
    const g = byGroup.get(groupKey)
    g.total++
    g.tiers[row.tier] = (g.tiers[row.tier] ?? 0) + 1
  }
  return [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group))
}

function main() {
  const leaves = buildLeafList()
  const { srcUsages, testUsages, srcFileCount, testFileCount } = scanCorpus()
  const rows = classifyAll(leaves, srcUsages, testUsages)

  const counts = { CONSUMED: 0, CONSUMED_VIA_GROUP: 0, DYNAMIC: 0, UNKNOWN: 0, DEAD_CANDIDATE: 0 }
  for (const r of rows) counts[r.tier] = (counts[r.tier] ?? 0) + 1

  const outDir = path.join(__dirname, 'output')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'leverTrace.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedBy: 'tools/lever-census/traceLevers.cjs',
        leafCount: leaves.length,
        srcFileCount,
        testFileCount,
        counts,
        rows,
      },
      null,
      2,
    ),
  )

  console.log(`Scanned ${srcFileCount} src files, ${testFileCount} test files.`)
  console.log(`Leaves: ${leaves.length}`)
  console.log(
    `CONSUMED: ${counts.CONSUMED}  CONSUMED_VIA_GROUP: ${counts.CONSUMED_VIA_GROUP}  DYNAMIC: ${counts.DYNAMIC}  UNKNOWN: ${counts.UNKNOWN}  DEAD_CANDIDATE: ${counts.DEAD_CANDIDATE}`,
  )
  console.log('')
  console.log('Per-group breakdown (group: total [tier:count, ...]):')
  for (const g of groupSummary(rows)) {
    const tierStr = Object.entries(g.tiers)
      .map(([t, c]) => `${t}:${c}`)
      .join(', ')
    console.log(`  ${g.group} (${g.total}): ${tierStr}`)
  }
  console.log('')
  console.log(`Full table written to ${relPath(outPath)}`)
}

module.exports = {
  buildLeafList,
  scanCorpus,
  scanFile,
  classifyLeaf,
  classifyAll,
  gatherSourceFiles,
  relPath,
  ROOT,
}

if (require.main === module) {
  main()
}
