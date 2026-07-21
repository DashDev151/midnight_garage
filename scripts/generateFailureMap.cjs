#!/usr/bin/env node
// Draws the real diagnosis map straight from the shipped content JSON, so the
// design document can never drift from the game. Reads the failure-mode
// registry, the symptom/cause/test content, and the diagnostic-test minutes
// registry, then emits a registry table plus one diagram per symptom into two
// outputs: failure-map.generated.md (fenced mermaid, for the Markdown
// Preview Mermaid Support extension) and failure-map.html (a standalone
// review page that renders mermaid from a CDN, for anyone without that
// extension).
//
// Routed symptoms (those with an unlockedBy test chain) get a knowledge-state
// diagram: a breadth-first walk over the remaining-cause sets, so the graph
// shows the diagnosis JOURNEY a player actually walks, not just which test
// points at which failure mode. Unrouted symptoms keep a simple ladder:
// symptom -> each test -> its two outcome groups -> the failure modes in
// each group. Terminal nodes are classed by severity band either way.
//
// Regenerate after any change to failureModes.json, symptoms.json, or
// diagnosticTests.json:
//   node scripts/generateFailureMap.cjs

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'packages/content/data')
const MD_OUT_PATH = path.join(ROOT, 'docs/design/failure-map.generated.md')
const HTML_OUT_PATH = path.join(ROOT, 'docs/design/failure-map.html')

const failureModes = readJson('failureModes.json')
const symptoms = readJson('symptoms.json')
const diagnosticTests = readJson('diagnosticTests.json')

function readJson(fileName) {
  const raw = fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8')
  return JSON.parse(raw)
}

const failureModeById = new Map(failureModes.map((mode) => [mode.id, mode]))
const minutesByTestId = new Map(diagnosticTests.map((test) => [test.id, test.minutes]))

// Reverse index for the registry table: every symptom that references a
// failure mode, with the weight it carries there.
const referencesByFailureModeId = new Map(failureModes.map((mode) => [mode.id, []]))
for (const symptom of symptoms) {
  for (const cause of symptom.causes) {
    const references = referencesByFailureModeId.get(cause.failureModeId)
    if (!references) {
      throw new Error(
        `symptom "${symptom.id}" references unknown failureModeId "${cause.failureModeId}"`,
      )
    }
    references.push({ symptomId: symptom.id, weight: cause.weight })
  }
}

function mermaidId(prefix, rawId) {
  return `${prefix}_${rawId.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function buildRegistryTable() {
  const header = '| id | part | band | referenced by (weight) |\n|---|---|---|---|'
  const rows = failureModes.map((mode) => {
    const references = referencesByFailureModeId
      .get(mode.id)
      .map((ref) => `${ref.symptomId} (${ref.weight})`)
      .join(', ')
    return `| ${mode.id} | ${mode.carPartId} | ${mode.setBand} | ${references} |`
  })
  return [header, ...rows].join('\n')
}

// Title-cases a kebab-case id the way the diagnosis-journey walk labels
// nodes: spaces for hyphens, first letter capitalised, the rest lower.
function title(slug) {
  const spaced = slug.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

// The one-line "what you actually saw" gist per test outcome, keyed by
// testId and partition group (0 or 1). Copied from the diagnosis-journey
// prototype (build_map.py); a test id with no entry here falls back to a
// plain positive/negative label.
const GIST_TABLE = [
  ['trace-the-wet', 0, 'comes in up top'],
  ['trace-the-wet', 1, 'pools down low'],
  ['coolant-check', 0, 'sweet and green'],
  ['coolant-check', 1, 'plain water'],
  ['scuttle-drain-poke', 0, 'leaf water gushes'],
  ['scuttle-drain-poke', 1, 'drain runs clear'],
  ['undercarriage-look', 0, 'seam is rotten'],
  ['undercarriage-look', 1, 'seam solid'],
  ['carpet-lift', 0, 'soaked, knew that'],
  ['carpet-lift', 1, 'soaked, knew that'],
  ['hose-the-roof', 0, 'A-pillar runs wet'],
  ['hose-the-roof', 1, 'pillars dry'],
  ['cold-start-watch', 0, 'blue puff, clears'],
  ['cold-start-watch', 1, 'white and sweet'],
  ['compression-test', 0, 'even and healthy'],
  ['compression-test', 1, 'down on two'],
  ['breather-check', 0, 'full of mayo'],
  ['breather-check', 1, 'clean and clear'],
  ['overrun-smoke-watch', 0, 'big puff on overrun'],
  ['overrun-smoke-watch', 1, 'clean on lift-off'],
  ['pull-a-plug', 0, 'oily crust'],
  ['pull-a-plug', 1, 'steam-washed'],
  ['gearbox-oil-check', 0, 'low, thin, dark'],
  ['gearbox-oil-check', 1, 'full and clean'],
  ['magnet-check', 0, 'furred with metal'],
  ['magnet-check', 1, 'magnet clean'],
  ['clutch-drag-check', 0, 'creeps at the line'],
  ['clutch-drag-check', 1, 'clears clean'],
  ['try-it-warm', 0, 'still graunches'],
  ['try-it-warm', 1, 'fine when warm'],
  ['linkage-check', 0, 'linkage tight'],
  ['linkage-check', 1, 'linkage tight'],
]
const GIST = new Map(GIST_TABLE.map(([testId, group, text]) => [`${testId}:${group}`, text]))

function gist(testId, group) {
  const found = GIST.get(`${testId}:${group}`)
  if (found !== undefined) return found
  return group === 0 ? 'positive' : 'negative'
}

// Severity band -> mermaid classDef name for a terminal failure-mode node.
const BAND_CLASS = { scrap: 'grenade', fine: 'gem', poor: 'mid', worn: 'mild' }

function bandClass(setBand) {
  const cls = BAND_CLASS[setBand]
  if (!cls) throw new Error(`unhandled setBand "${setBand}": no mermaid class mapped for it`)
  return cls
}

const CLASS_DEF_LINES = {
  state: '  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4',
  grenade: '  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0',
  gem: '  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb',
  mid: '  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1',
  mild: '  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5',
  waste: '  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4',
}

function classDefLines(names) {
  return names.map((name) => CLASS_DEF_LINES[name])
}

// Resolves a symptom's cause references against the failure-mode registry,
// the same join `resolveSymptomCauses` (packages/content/src/symptom.ts)
// does at content-load time, so the diagram works from the identical
// carPartId/setBand the game itself rolls against.
function causesOf(symptom) {
  return symptom.causes.map((cause) => {
    const failureMode = failureModeById.get(cause.failureModeId)
    if (!failureMode) {
      throw new Error(
        `symptom "${symptom.id}" references unknown failureModeId "${cause.failureModeId}"`,
      )
    }
    return {
      id: cause.failureModeId,
      carPartId: failureMode.carPartId,
      setBand: failureMode.setBand,
      weight: cause.weight,
    }
  })
}

/**
 * The knowledge-state diagram for a routed symptom: a breadth-first walk
 * over the sets of causes still live, starting from "every cause still
 * live" and narrowing with each test outcome, exactly as a player narrows
 * it during a real diagnosis. A state is a set of remaining cause ids; an
 * edge is a test outcome that shrinks the set. Availability at a state uses
 * a REPRESENTATIVE run-set (the tests already run on the path that first
 * reached that state) rather than tracking every path separately, since the
 * board only needs one legal route to each state to be drawn faithfully.
 * A test that cannot shrink the remaining set from a given state (both
 * outcome groups leave it unchanged or empty) is recorded as a dead end:
 * legal to run, but wasted time from there.
 */
function buildRoutedDiagram(symptom) {
  const causes = causesOf(symptom)
  const causeById = new Map(causes.map((cause) => [cause.id, cause]))
  const testById = new Map(symptom.tests.map((test) => [test.testId, test]))

  const fullKey = causes
    .map((cause) => cause.id)
    .sort()
    .join('|')

  const seen = new Map([[fullKey, new Set()]])
  const order = [fullKey]
  const edges = []
  const waste = new Map()

  let i = 0
  while (i < order.length) {
    const remKey = order[i]
    const run = seen.get(remKey)
    i += 1
    const rem = remKey.split('|')
    if (rem.length <= 1) continue

    const avail = []
    for (const test of symptom.tests) {
      const unlock = test.unlockedBy
      if (run.has(test.testId)) continue
      if (unlock && !run.has(unlock.testId)) continue
      if (unlock && unlock.group !== undefined) {
        const parentGroupZero = new Set(testById.get(unlock.testId).partition[0])
        const parentGroup = rem.some((cause) => parentGroupZero.has(cause)) ? 0 : 1
        if (parentGroup !== unlock.group) continue
      }
      avail.push(test)
    }

    for (const test of avail) {
      const testId = test.testId
      let narrowed = false
      for (const group of [0, 1]) {
        const groupSet = new Set(test.partition[group])
        const newRem = rem.filter((cause) => groupSet.has(cause))
        if (newRem.length === 0 || newRem.length === rem.length) continue
        narrowed = true
        const newKey = [...newRem].sort().join('|')
        edges.push({ fromKey: remKey, toKey: newKey, testId, group })
        if (!seen.has(newKey)) {
          const newRun = new Set(run)
          newRun.add(testId)
          seen.set(newKey, newRun)
          order.push(newKey)
        }
      }
      if (!narrowed) {
        if (!waste.has(remKey)) waste.set(remKey, [])
        waste.get(remKey).push(testId)
      }
    }
  }

  const ids = new Map()
  function nodeId(key) {
    if (!ids.has(key)) ids.set(key, `S${ids.size}`)
    return ids.get(key)
  }

  function stateLabel(remKey) {
    if (remKey === fullKey) return 'THE DOUBT<br/>every cause still live'
    return remKey
      .split('|')
      .sort()
      .map((causeId) => title(causeId))
      .join('<br/>')
  }

  const lines = [
    "%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%",
    'flowchart TD',
  ]

  for (const remKey of order) {
    const rem = remKey.split('|')
    if (rem.length === 1) {
      const cause = causeById.get(rem[0])
      const label = `${title(cause.id)}<br/>${cause.carPartId} ${cause.setBand.toUpperCase()} · odds ${cause.weight}`
      lines.push(`  ${nodeId(remKey)}["${label}"]:::${bandClass(cause.setBand)}`)
    } else {
      lines.push(`  ${nodeId(remKey)}["${stateLabel(remKey)}"]:::state`)
    }
  }

  for (const edge of edges) {
    const label = `${title(edge.testId)}<br/>${gist(edge.testId, edge.group)} · ${minutesByTestId.get(edge.testId)}m`
    lines.push(`  ${nodeId(edge.fromKey)} -->|"${label}"| ${nodeId(edge.toKey)}`)
  }

  let wasteCount = 0
  for (const [remKey, testIds] of waste) {
    const wasteId = `W${wasteCount}`
    wasteCount += 1
    const label = testIds
      .map((testId) => `${title(testId)} ${minutesByTestId.get(testId)}m`)
      .join('<br/>')
    lines.push(`  ${wasteId}("tells you nothing here:<br/>${label}"):::waste`)
    lines.push(`  ${nodeId(remKey)} -.-> ${wasteId}`)
  }

  lines.push(...classDefLines(['state', 'grenade', 'gem', 'mid', 'mild', 'waste']))
  return lines.join('\n')
}

/**
 * The simple ladder for an unrouted (flat) symptom: symptom -> each test ->
 * its two outcome groups -> the failure modes in each group. Every test is
 * offered from the start (no unlockedBy chain), so there is no journey to
 * walk; the ladder just lays out what each test can tell you.
 */
function buildFlatDiagram(symptom) {
  const lines = ['flowchart TD']
  const symId = mermaidId('SYM', symptom.id)
  lines.push(`  ${symId}["${symptom.id}<br/>${escapeLabel(symptom.cardLine)}"]`)

  const declaredFailureModes = new Set()

  for (const test of symptom.tests) {
    const testId = mermaidId('T', test.testId)
    const minutes = minutesByTestId.get(test.testId)
    lines.push(`  ${testId}["${test.testId}<br/>${minutes}m"]`)
    lines.push(`  ${symId} --> ${testId}`)

    test.partition.forEach((group, groupIndex) => {
      const groupId = `${testId}_G${groupIndex}`
      const groupLabel = groupIndex === 0 ? 'Outcome A' : 'Outcome B'
      lines.push(`  ${testId} --> ${groupId}(("${groupLabel}"))`)

      for (const failureModeId of group) {
        const failureMode = failureModeById.get(failureModeId)
        if (!failureMode) {
          throw new Error(
            `symptom "${symptom.id}" test "${test.testId}" partitions unknown failureModeId "${failureModeId}"`,
          )
        }
        const weight = symptom.causes.find((cause) => cause.failureModeId === failureModeId)?.weight
        const fmId = mermaidId('FM', failureModeId)
        if (!declaredFailureModes.has(fmId)) {
          lines.push(
            `  ${fmId}["${failureModeId}<br/>(${failureMode.setBand})"]:::${bandClass(failureMode.setBand)}`,
          )
          declaredFailureModes.add(fmId)
        }
        lines.push(`  ${groupId} -->|"w=${weight}"| ${fmId}`)
      }
    })
  }

  lines.push(...classDefLines(['grenade', 'gem', 'mid', 'mild']))
  return lines.join('\n')
}

function escapeLabel(text) {
  return text.replace(/"/g, "'")
}

// Escapes the raw mermaid source for embedding in <pre class="mermaid"> so
// the browser keeps literal "<br/>" as text for mermaid to read, instead of
// parsing it into a real <br> element (which would swallow the line break
// before mermaid ever sees it).
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Rough node count for the "did this diagram get out of hand" check: every
// node-declaration line (state/failure-mode boxes via `["`, waste and
// outcome-circle nodes via `("`) counts once; edge lines match neither.
function countNodes(diagramText) {
  return diagramText.split('\n').filter((line) => line.includes('["') || line.includes('("')).length
}

const diagrams = symptoms.map((symptom) => {
  const isRouted = symptom.tests.some((test) => test.unlockedBy)
  const text = isRouted ? buildRoutedDiagram(symptom) : buildFlatDiagram(symptom)
  return { symptom, isRouted, text, nodeCount: countNodes(text) }
})

function buildDocument() {
  const parts = []
  parts.push('# The Failure Map (generated)')
  parts.push('')
  parts.push(
    'This file is generated from the shipped content JSON: `packages/content/data/failureModes.json`, ' +
      '`symptoms.json`, and `diagnosticTests.json`. It can never drift from the game because it is not ' +
      'hand-edited - regenerate it after any change to those files:',
  )
  parts.push('')
  parts.push('```')
  parts.push('node scripts/generateFailureMap.cjs')
  parts.push('```')
  parts.push('')
  parts.push(
    "VS Code's built-in Markdown preview does not render mermaid: install the Markdown Preview " +
      'Mermaid Support extension, or open `failure-map.html` (generated alongside this file) in a browser instead.',
  )
  parts.push('')
  parts.push(
    'The design intent (ontology, laws, review notes) lives in `failure-map.md`; this file is the proof the shipped content matches it.',
  )
  parts.push('')
  parts.push('## Registry')
  parts.push('')
  parts.push(`${failureModes.length} failure modes, referenced across ${symptoms.length} symptoms.`)
  parts.push('')
  parts.push(buildRegistryTable())
  parts.push('')
  parts.push('## Symptoms')
  parts.push('')
  for (const { symptom, text } of diagrams) {
    parts.push(`### ${symptom.id}`)
    parts.push('')
    parts.push(symptom.cardLine)
    parts.push('')
    parts.push('```mermaid')
    parts.push(text)
    parts.push('```')
    parts.push('')
  }
  return parts.join('\n')
}

function buildHtmlDocument() {
  const sections = diagrams
    .map(({ symptom, text }) => {
      const heading = escapeHtml(`${symptom.id}: ${symptom.cardLine}`)
      return `<h2>${heading}</h2>\n<pre class="mermaid">\n${escapeHtml(text)}\n</pre>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Failure Map (review)</title>
<!--
  Review tool only: never shipped with the game, and requires an internet
  connection to load the mermaid renderer from the jsdelivr CDN below.
  Regenerate with: node scripts/generateFailureMap.cjs
-->
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: true, theme: 'dark' })
</script>
<style>
  body {
    background: #0a0c10;
    color: #cfd6e4;
    font-family: ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace;
    margin: 0;
    padding: 1.5rem;
    line-height: 1.5;
  }
  h1 { font-size: 1.2rem; }
  h2 { font-size: 1rem; color: #5ee0f7; margin-top: 2.5rem; }
  pre.mermaid {
    background: #0d0f14;
    border: 1px solid #252c3b;
    border-radius: 6px;
    padding: 1rem;
    overflow-x: auto;
  }
</style>
</head>
<body>
<h1>The Failure Map (review)</h1>
<p>Generated by <code>node scripts/generateFailureMap.cjs</code>. Not shipped with the game.</p>
${sections}
</body>
</html>
`
}

fs.writeFileSync(MD_OUT_PATH, buildDocument().trimEnd() + '\n', 'utf8')
fs.writeFileSync(HTML_OUT_PATH, buildHtmlDocument(), 'utf8')

console.log(`wrote ${path.relative(ROOT, MD_OUT_PATH)}`)
console.log(`wrote ${path.relative(ROOT, HTML_OUT_PATH)}`)
console.log(`registry: ${failureModes.length} failure modes`)
const routedCount = diagrams.filter((d) => d.isRouted).length
console.log(
  `symptoms: ${symptoms.length} (${routedCount} routed, ${symptoms.length - routedCount} flat)`,
)
for (const { symptom, isRouted, nodeCount } of diagrams) {
  const flag = nodeCount > 40 ? '  <- exceeds ~40 nodes' : ''
  console.log(`  ${symptom.id}: ${isRouted ? 'routed' : 'flat'}, ${nodeCount} nodes${flag}`)
}
