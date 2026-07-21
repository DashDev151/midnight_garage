#!/usr/bin/env node
// Draws the real diagnosis map straight from the shipped content JSON, so the
// design document can never drift from the game. Reads the failure-mode
// registry, the symptom/cause/test content, and the diagnostic-test minutes
// registry, then emits a registry table plus one mermaid flowchart per
// symptom (symptom -> its tests -> each test's two outcome groups -> the
// failure modes in each group).
//
// Regenerate after any change to failureModes.json, symptoms.json, or
// diagnosticTests.json:
//   node scripts/generateFailureMap.cjs

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'packages/content/data')
const OUT_PATH = path.join(ROOT, 'docs/design/failure-map.generated.md')

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

function testUnlockLabel(test) {
  if (!test.unlockedBy) return ''
  const groupSuffix = test.unlockedBy.group === undefined ? '' : ` group ${test.unlockedBy.group}`
  return `<br/>unlocked by ${test.unlockedBy.testId}${groupSuffix}`
}

function buildSymptomFlowchart(symptom) {
  const lines = ['```mermaid', 'flowchart TD']
  const symId = mermaidId('SYM', symptom.id)
  lines.push(`  ${symId}["${symptom.id}<br/>${escapeLabel(symptom.cardLine)}"]`)

  const declaredFailureModes = new Set()

  for (const test of symptom.tests) {
    const testId = mermaidId('T', test.testId)
    const minutes = minutesByTestId.get(test.testId)
    const label = `${test.testId}<br/>${minutes}m${testUnlockLabel(test)}`
    lines.push(`  ${testId}["${label}"]`)

    if (!test.unlockedBy) {
      lines.push(`  ${symId} --> ${testId}`)
    } else if (test.unlockedBy.group === undefined) {
      const parentId = mermaidId('T', test.unlockedBy.testId)
      lines.push(`  ${parentId} -.-> ${testId}`)
    } else {
      const parentGroupId = mermaidId('T', test.unlockedBy.testId) + `_G${test.unlockedBy.group}`
      lines.push(`  ${parentGroupId} -.-> ${testId}`)
    }

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
          lines.push(`  ${fmId}["${failureModeId}<br/>(${failureMode.setBand})"]`)
          declaredFailureModes.add(fmId)
        }
        lines.push(`  ${groupId} -->|"w=${weight}"| ${fmId}`)
      }
    })
  }

  lines.push('```')
  return lines.join('\n')
}

function escapeLabel(text) {
  return text.replace(/"/g, "'")
}

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
  for (const symptom of symptoms) {
    parts.push(`### ${symptom.id}`)
    parts.push('')
    parts.push(symptom.cardLine)
    parts.push('')
    parts.push(buildSymptomFlowchart(symptom))
    parts.push('')
  }
  return parts.join('\n')
}

fs.writeFileSync(OUT_PATH, buildDocument().trimEnd() + '\n', 'utf8')
console.log(`wrote ${path.relative(ROOT, OUT_PATH)}`)
console.log(`registry: ${failureModes.length} failure modes`)
console.log(`symptoms: ${symptoms.length}`)
