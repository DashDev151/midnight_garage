import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SIM_SRC_ROOT = join(REPO_ROOT, 'packages', 'sim', 'src')
const GAME_SRC_ROOT = join(REPO_ROOT, 'packages', 'game', 'src')

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'tests'])

/** A test is allowed - and often required - to write a rule out longhand: that
 * is how a surviving copy is asserted against its original. Game tests sit
 * beside the code they cover rather than in a `tests/` directory, so they are
 * skipped by filename as well as by folder. */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

function isSourceFile(filePath: string): boolean {
  if (TEST_FILE.test(filePath)) return false
  return filePath.endsWith('.ts') || filePath.endsWith('.vue')
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, out)
    } else if (isSourceFile(fullPath)) {
      out.push(fullPath)
    }
  }
  return out
}

/** Every marker of one rule, which a file has to hold ALL of before it counts
 * as re-deriving that rule. A string marker is a plain substring; a regex
 * marker is for the rules whose shape matters (an arithmetic expression, a
 * comparison) and whose identifiers alone appear innocently elsewhere. */
type FormulaMarker = string | RegExp

interface DuplicateFormulaRule {
  /** What the rule decides, in the failure message. */
  rule: string
  /** The module that owns it, and any file allowed to hold an asserted copy
   * (a copy with a test proving it equals the original). */
  allowedFiles: readonly string[]
  markers: readonly FormulaMarker[]
  roots: readonly string[]
}

const SIM_AND_GAME = [SIM_SRC_ROOT, GAME_SRC_ROOT] as const

/**
 * Directive 16, enforced against the failure mode this repository actually
 * suffers: a rule written out a second time somewhere that has to agree with
 * the first, with nothing asserting that it does. Every rule below is one
 * exported function today; a file that re-derives it from the same raw
 * ingredients is a copy waiting to drift, and this test names it before it can.
 *
 * The scan covers `packages/sim/src` and `packages/game/src`, `.ts` and `.vue`
 * alike - the previews live in the game layer, which is where every copy that
 * had already drifted was found.
 *
 * A rule earns a second allowed file only when a test proves the copy equals
 * its original: `valueLedger.ts` reproduces the value formula term by term so
 * it can show a player where each yen went, and `valueLedger.test.ts` holds its
 * sum to `marketValueYen` per roster model.
 */
const RULES: readonly DuplicateFormulaRule[] = [
  {
    // `bookValueYen` alone is legitimate anywhere (scrap fractions, grading
    // ratios) - the ban is on the COMBINATION with `mileageFactor(`, since
    // together they are the one clean-value formula `marketValue.ts` owns:
    // `cleanValue = bookValueYen * mileageFactor(mileageKm, economy)`.
    rule: "a car's clean value (`cleanValueYen`, marketValue.ts)",
    allowedFiles: ['marketValue.ts'],
    markers: ['bookValueYen', 'mileageFactor('],
    roots: SIM_AND_GAME,
  },
  {
    // The whole-shell scrap payout, as opposed to `bands.scrapValueFraction`'s
    // other two uses (one part's scrap value, and the value formula's backstop
    // floor against clean value) - so the marker is the product itself.
    rule: 'the scrap payout for a whole shell (`scrapShellPriceYen`, selling.ts)',
    allowedFiles: ['selling.ts'],
    markers: [/bookValueYen\s*\*\s*[\w.]*bands\.scrapValueFraction/],
    roots: SIM_AND_GAME,
  },
  {
    // The cart total has to round the way the charge rounds, which it can only
    // do by pricing each part through the same function `resolveBuyPart` does.
    rule: "one part's express price (`expressPriceYen`, parts.ts)",
    allowedFiles: ['parts.ts', 'constants.ts'],
    markers: ['PARTS_EXPRESS_SURCHARGE_FRACTION'],
    roots: SIM_AND_GAME,
  },
  {
    // Reading a build's coherence factor is `coherenceFactorFor` over that
    // build's own support verdict. Both halves have honest solo uses (the dyno
    // shows a verdict, the curve is content-shaped), so the ban is the pair.
    rule: "a build's own coherence factor (`coherenceFactorForCar`, derivedStats.ts)",
    allowedFiles: ['derivedStats.ts'],
    markers: ['coherenceFactorFor(', 'supportVerdict('],
    roots: SIM_AND_GAME,
  },
  {
    // Whether a machining operation costs authenticity is a fact about the
    // part's grade, and an unresolvable SKU is not a stock part. Reaching for
    // an operation's raw rating is what lets a call site decide that for
    // itself; reading the charge off an offer row (`offer.authenticityCost`) is
    // a display of the answer and is fine anywhere.
    rule: "a machining operation's authenticity charge (`machiningAuthenticityCostOf`, machining.ts)",
    allowedFiles: ['machining.ts'],
    markers: ['operation.authenticityCost'],
    roots: SIM_AND_GAME,
  },
  {
    // Law 5's premium term: what the aftermarket premium credits at this car's
    // foundation factor, and what a failing foundation therefore withholds.
    // The panel quotes the second and the price sums the first, so they come
    // out of one expression.
    rule: 'the credited aftermarket premium (`premiumCredit`/`foundationWithheldYen`, marketValue.ts)',
    allowedFiles: ['marketValue.ts', 'valueLedger.ts'],
    markers: ['foundationFactor(', 'aftermarketReturn'],
    roots: SIM_AND_GAME,
  },
  {
    // Whether a symptom is down to one answer.
    rule: 'whether a symptom is resolved (`symptomResolved`, diagnosis.ts)',
    allowedFiles: ['diagnosis.ts'],
    markers: [/remainingCauseIds\.length\s*(<=|<|>=|>|===|!==)/],
    roots: SIM_AND_GAME,
  },
  {
    // Whether the player has run a diagnostic test on a symptom - the visible
    // behaviour, which is a different question from whether it resolved.
    rule: 'whether a symptom has been tested (`symptomTested`, diagnosis.ts)',
    allowedFiles: ['diagnosis.ts'],
    markers: [/runTestIds\.length/],
    roots: SIM_AND_GAME,
  },
  {
    // Which garage rooms render derelict is read off the same tool state the
    // work itself gates on, in one place, rather than per screen.
    rule: 'whether the machine shop is open (`machineShopOpen`, garageCapability.ts)',
    allowedFiles: ['garageCapability.ts'],
    markers: ['toolTiers.engine', 'minEngineToolTier'],
    roots: SIM_AND_GAME,
  },
]

function markerLine(lines: readonly string[], marker: FormulaMarker): number {
  const index =
    typeof marker === 'string'
      ? lines.findIndex((line) => line.includes(marker))
      : lines.findIndex((line) => marker.test(line))
  return index + 1
}

function holdsMarker(contents: string, marker: FormulaMarker): boolean {
  return typeof marker === 'string' ? contents.includes(marker) : marker.test(contents)
}

function offendersFor(rule: DuplicateFormulaRule): string[] {
  const offenders: string[] = []
  for (const root of rule.roots) {
    for (const filePath of collectFiles(root)) {
      const base = filePath.split(/[\\/]/).pop() ?? filePath
      if (rule.allowedFiles.includes(base)) continue
      const contents = readFileSync(filePath, 'utf8')
      if (!rule.markers.every((marker) => holdsMarker(contents, marker))) continue
      const lines = contents.split('\n')
      const where = rule.markers
        .map((marker) => `${String(marker)}:${markerLine(lines, marker)}`)
        .join(', ')
      offenders.push(`${relative(REPO_ROOT, filePath)} (${where})`)
    }
  }
  return offenders
}

describe('the duplicate-formula ban (directive 16)', () => {
  for (const rule of RULES) {
    it(`only ${rule.allowedFiles.join(' and ')} decides ${rule.rule}`, () => {
      expect(offendersFor(rule)).toEqual([])
    })
  }
})
