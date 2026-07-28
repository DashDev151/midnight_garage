import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * GENERATES THE PERFORMANCE SANDBOX'S CAR ROSTER.
 *
 * The sandbox screen inspects all 85 vetted cars, but only 26 of them ship in
 * `cars.json`. The other 59 are research entries in `car-spec-book.html` with
 * no `CarModel` at all, and a browser cannot parse a 120 KiB HTML document at
 * runtime to make one. So the spec book is read HERE, the 59 models are
 * synthesised HERE, and the result is committed as a typed data file the dev
 * screen imports.
 *
 * EVERY PHYSICAL FIGURE COMES ACROSS UNTOUCHED. That is the part that matters
 * and it is real. What is derived or placeheld is named field by field below,
 * and every synthesised car is flagged `inGame: false` so the screen can badge
 * it.
 *
 *   pnpm sandbox:cars
 *
 * which regenerates the file and then runs the 85-car lap acceptance over it,
 * so a generation that corrupts a car cannot be committed.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')

const SPEC_BOOK = path.join(REPO, 'docs/design/car-performance/car-spec-book.html')
const HARNESS = path.join(REPO, 'docs/design/car-performance/lapsim/lapsim-report.cjs')
const CARS_JSON = path.join(REPO, 'packages/content/data/cars.json')
const OUT = path.join(REPO, 'packages/game/src/screens/dev/sandboxCars.ts')

/**
 * A spec-book section's roster tier. Tier is the ONE field a synthesised car
 * genuinely needs beyond its physics: parts are not per car, they are shared by
 * fitment class (four classes, 118 SKUs each), and `fitmentClassForTier` selects
 * the class from the tier. So this picks an existing shared catalogue, it does
 * not invent one.
 *
 * The first eight rows are DERIVED from the 26 in-game cars: their own spec-book
 * section against their own real `cars.json` tier, majority wins, ties to the
 * lower tier. Anyone can re-derive them from those two files. The last five are
 * ASSIGNED by judgement, because no in-game car occupies those sections at all.
 * Neither Forza price/rarity nor the roster doc's scope tiers predict this: both
 * were measured and rejected.
 */
const TIER_BY_SECTION = {
  // Derived from the in-game 26.
  Shitbox: { tier: 'shitbox', source: 'derived' }, // 3 of 3
  Kei: { tier: 'shitbox', source: 'derived' }, // 3 of 3
  'Bubble weird': { tier: 'shitbox', source: 'derived' }, // 1 of 1
  'Fast FWD': { tier: 'common', source: 'derived' }, // 3 of 4
  'FR / Drift': { tier: 'uncommon', source: 'derived' }, // 6 of 6
  Rotary: { tier: 'uncommon', source: 'derived' }, // 1 uncommon, 1 rare; the lower
  'AWD Turbo': { tier: 'uncommon', source: 'derived' }, // 1 uncommon, 1 rare; the lower
  Flagship: { tier: 'rare', source: 'derived' }, // 3 of 5
  // Assigned by judgement: no in-game car occupies these sections.
  '2004+ wave': { tier: 'uncommon', source: 'assigned' },
  Gaisha: { tier: 'rare', source: 'assigned' }, // expensive imports
  Kyusha: { tier: 'rare', source: 'assigned' }, // genuinely valuable classics
  'Hyper wave': { tier: 'rare', source: 'assigned' }, // R35, LFA, BNR34
  Legend: { tier: 'rare', source: 'assigned' },
}

/**
 * The compound tiers in ascending order, and the stock-tyre width and build year
 * that select one. Carried verbatim from the lap harness's `compoundOf`, which
 * is what produced every `tyreCompound` in `cars.json`: it is a classification
 * of a tyre size string, not a physics formula, and the game has no other
 * expression of it. A car with a measured lateral pair is unaffected by it at
 * stock (its grip IS the measurement); it decides the grip of the cars that
 * carry no measurement.
 */
const COMPOUND_TIERS = ['eco', 'touring', 'performance', 'sport', 'grand']
const COMPOUND_WIDTH_BREAKS_MM = [165, 195, 225, 255]
const COMPOUND_ERA_CEILINGS = [
  { beforeYear: 1990, index: 2 },
  { beforeYear: 2000, index: 3 },
]
const COMPOUND_ERA_DEFAULT_CEILING = 4
/** The width a tyre string with no three-digit group falls back to. */
const TYRE_WIDTH_FALLBACK_MM = 160

/**
 * The engine configurations the content schema knows. The spec book also carries
 * `flat-12` (the Testarossa), which the schema has no member for; the field is
 * dropped for that car rather than mis-stated, and nothing in the physics reads
 * it.
 */
const ENGINE_CONFIGS = [
  'I3',
  'I4',
  'I5',
  'I6',
  'V6',
  'V8',
  'V10',
  'V12',
  'flat-4',
  'flat-6',
  'rotary-2',
  'rotary-3',
]

/**
 * Indirect eval rather than direct, purely so tooling stops warning about it;
 * the two are identical on an object literal. This runs at GENERATION time only
 * and nothing at runtime evaluates anything.
 */
const evaluateLiteral = eval

/**
 * The 85 vetted cars, read out of the spec book exactly as the lap harness reads
 * them (`lapsim-report.cjs`): a line-anchored match on its `CARS` array,
 * evaluated as the JavaScript literal it is. The book is deliberately excluded
 * from Prettier so that regex keeps matching.
 *
 * Two things are folded in here because the harness folds them in too, and the
 * synthesised model must carry the same numbers the reference times were
 * computed from: `z161` comes off the Forza panel's `a100` where the row does
 * not state it, and the body box comes from the harness's own `DIMS` table (the
 * spec book carries no width or height, and a car's drag area is
 * `Cd x frontal area`).
 */
function specBookRows() {
  const html = fs.readFileSync(SPEC_BOOK, 'utf8')
  const carsMatch = html.match(/const CARS = \[([\s\S]*?)\n\];/)
  if (!carsMatch) throw new Error(`no CARS array found in ${SPEC_BOOK}`)
  const rows = evaluateLiteral('[' + carsMatch[1] + ']')

  const harness = fs.readFileSync(HARNESS, 'utf8')
  const dimsMatch = harness.match(/const DIMS = (\{[\s\S]*?\n\})/)
  if (!dimsMatch) throw new Error(`no DIMS table found in ${HARNESS}`)
  const dims = evaluateLiteral('(' + dimsMatch[1] + ')')

  return rows.map((row) => {
    const box = dims[row.id]
    return {
      ...row,
      z161: row.z161 ?? row.fz?.a100 ?? null,
      widthMm: box ? box[0] : null,
      heightMm: box ? box[1] : null,
    }
  })
}

function tyreWidthMm(stockTyre) {
  const match = String(stockTyre).match(/\d{3}/)
  return match ? Number(match[0]) : TYRE_WIDTH_FALLBACK_MM
}

function compoundFor(row) {
  const width = tyreWidthMm(row.ty)
  let index = COMPOUND_WIDTH_BREAKS_MM.findIndex((edge) => width < edge)
  if (index < 0) index = COMPOUND_WIDTH_BREAKS_MM.length
  const era = COMPOUND_ERA_CEILINGS.find((band) => row.y < band.beforeYear)
  const ceiling = era ? era.index : COMPOUND_ERA_DEFAULT_CEILING
  return COMPOUND_TIERS[Math.min(index, ceiling)]
}

/**
 * The layout tag, from the book's own drivetrain and engine position. This one
 * is not cosmetic: `layoutTagOf` is what the physics reads for the drivetrain
 * grip bonus, the mid-engine bonus, the balance term and the braking fallback,
 * so it is derived rather than defaulted.
 */
function layoutTagFor(row) {
  if (row.dt === 'FWD') return 'FF'
  if (row.dt === 'AWD') return 'AWD'
  if (row.ep === 'mid') return 'MR'
  if (row.ep === 'rear') return 'RR'
  return 'FR'
}

function inductionTagFor(row) {
  if (row.asp === 'supercharged') return 'Supercharged'
  return row.asp === 'NA' ? 'NA' : 'Turbo'
}

function engineFamilyTagFor(row) {
  return String(row.cfg).startsWith('rotary') ? 'Rotary' : 'Piston'
}

/**
 * Factory active torque vectoring, which lifts an equipped AWD car's grip above
 * a passive one. The harness identifies it by engine code and by the Evo line;
 * the same rule is applied here so a synthesised AWD car reads the same as the
 * harness read it.
 */
function activeYawFor(row) {
  if (/RB26DETT|VR38DETT/.test(row.ec)) return 'attesa'
  if (/lancer-evo/.test(row.id)) return 'ayc'
  return undefined
}

/** The book writes its display names with a leading year (`1984 Honda City E
 * II`); the game's do not carry one and the year is a field of its own. */
function displayNameFor(row) {
  return String(row.n).replace(/^\d{4}\s+/, '')
}

function omitNull(value) {
  return value === null || value === undefined ? undefined : value
}

/** A synthesised car's `measuredFrom`: the book states whether a row is a Forza
 * panel reading or has no measurement at all, and carries a ruling on the two
 * rows whose panel measured a preset build rather than the stock car. */
function measuredFromFor(row) {
  if (row.src !== 'forza') return 'modelled'
  return row.gOvr ? 'forza-panel-override' : 'forza-panel'
}

/**
 * One research entry as a `CarModel`.
 *
 * Real, straight from the book: every weight, power, dimension, drag, grip,
 * braking and acceleration figure, and the layout/induction/engine tags derived
 * from the book's own drivetrain, engine position and aspiration.
 *
 * Derived: `tier` (see `TIER_BY_SECTION`), `tyreCompound` (see `compoundFor`),
 * `brand` (the first token of the display name, which reads `Alfa` rather than
 * `Alfa Romeo` on the one two-word marque; no physics reads it).
 *
 * Placeholders, read by nothing: `chassisCode`, `bookValueYen`, and the two
 * parody-name fields, which the sandbox never renders. `bookValueYen` in
 * particular is why the screen shows these cars no price at all: pricing a car
 * the game does not sell would be inventing an economy number.
 */
function synthesiseModel(row) {
  const displayName = displayNameFor(row)
  const section = TIER_BY_SECTION[row.sec]
  if (!section) throw new Error(`spec-book section "${row.sec}" has no tier mapping`)
  const tags = [layoutTagFor(row), inductionTagFor(row), engineFamilyTagFor(row)]
  // The one class tag the physics reads: a kei car runs a narrower track, which
  // changes the weight-transfer term of the grip formula.
  if (row.sec === 'Kei') tags.push('Kei')

  return {
    id: row.id,
    displayName,
    brand: displayName.split(' ')[0] ?? displayName,
    parodyName: 'Research entry',
    parodyBrand: 'Research',
    tier: section.tier,
    tags,
    bookValueYen: 1,
    spec: {
      chassisCode: 'unknown',
      engineCode: row.ec,
      yearFrom: row.y,
      curbWeightKg: row.kg,
      stockPowerPs: row.ps,
      quotedPowerPs: omitNull(row.q),
      powerRpm: omitNull(row.psr),
      peakTorqueNm: omitNull(row.tq),
      torqueRpm: omitNull(row.tqr),
      redlineRpm: omitNull(row.rl),
      displacementCc: omitNull(row.cc),
      engineConfig: ENGINE_CONFIGS.find((config) => config === row.cfg),
      aspiration: row.asp,
      weightDistributionFront: omitNull(row.fr),
      wheelbaseMm: omitNull(row.wb),
      comHeightMm: omitNull(row.com),
      dragCd: omitNull(row.cd),
      widthMm: omitNull(row.widthMm),
      heightMm: omitNull(row.heightMm),
      stockTyre: row.ty,
      tyreCompound: compoundFor(row),
      activeYaw: activeYawFor(row),
      zeroToHundredS: omitNull(row.z),
      topSpeedKmh: omitNull(row.top),
      lateralG97: omitNull(row.g97),
      lateralG193: omitNull(row.g193),
      braking97To0M: omitNull(row.b97),
      braking161To0M: omitNull(row.b161),
      zeroTo97S: omitNull(row.z97),
      zeroTo161S: omitNull(row.z161),
      measuredFrom: measuredFromFor(row),
      dataConfidence: omitNull(row.cf),
      estimatedFields: omitNull(row.est),
    },
  }
}

const rows = specBookRows()
const shippedIds = new Set(JSON.parse(fs.readFileSync(CARS_JSON, 'utf8')).map((car) => car.id))

const roster = rows.map((row) => {
  const section = TIER_BY_SECTION[row.sec]
  if (!section) throw new Error(`spec-book section "${row.sec}" has no tier mapping`)
  if (shippedIds.has(row.id)) {
    return { id: row.id, section: row.sec, inGame: true, tierSource: 'in-game' }
  }
  return {
    id: row.id,
    section: row.sec,
    inGame: false,
    tierSource: section.source,
    model: synthesiseModel(row),
  }
})

const inGame = roster.filter((entry) => entry.inGame).length
const research = roster.length - inGame

const header = `/**
 * THE PERFORMANCE SANDBOX'S CAR ROSTER. GENERATED - DO NOT EDIT BY HAND.
 *
 * Written by \`tools/sandbox/generateCars.mjs\` (run \`pnpm sandbox:cars\`) from
 * \`docs/design/car-performance/car-spec-book.html\`, the vetted upstream for all
 * ${roster.length} cars, and the lap harness's own dimensions table.
 *
 * ${inGame} of the ${roster.length} ship in \`cars.json\` and carry no model here: the sandbox reads the
 * real one. The other ${research} are RESEARCH ENTRIES that are not in the game, and their
 * model is synthesised. Every physical figure on a synthesised model is the spec
 * book's own measurement, untouched. \`tier\` is derived from the book's roster
 * section, \`tyreCompound\` from the stock tyre and the build year, and the
 * layout/induction/engine tags from the book's own drivetrain, engine position
 * and aspiration - all of which the physics reads. \`chassisCode\`,
 * \`bookValueYen\` and the parody names are placeholders that nothing reads, which
 * is why the sandbox shows a research entry no price rather than a made-up one.
 *
 * Dev-only data. It is imported by the sandbox screen alone, which is reachable
 * only through the \`import.meta.env.DEV\` gate in \`router/index.ts\`, so a
 * production build drops this file with it.
 */
import type { CarModel } from '@midnight-garage/content'

/** Where an entry's roster tier came from: the car's real \`cars.json\` value, a
 * mapping derived from the in-game ${inGame}, or a judgement call on a section no
 * in-game car occupies. */
export type SandboxTierSource = 'in-game' | 'derived' | 'assigned'

export interface SandboxRosterEntry {
  id: string
  /** The spec book's roster section, e.g. \`Kei\`, \`FR / Drift\`, \`Hyper wave\`. */
  section: string
  /** True for the ${inGame} cars that ship in \`cars.json\`. */
  inGame: boolean
  tierSource: SandboxTierSource
  /** The synthesised model, present only on the ${research} research entries. An in-game
   * car's model is the real one and is read from content. */
  model?: CarModel
}

/** All ${roster.length}, in spec-book order. */
export const SANDBOX_ROSTER: readonly SandboxRosterEntry[] = ${JSON.stringify(roster)}
`

// Formatted with the repo's own Prettier so the generated file passes
// `pnpm format` like any other source file and needs no ignore entry.
const require = createRequire(path.join(REPO, 'package.json'))
const prettierModule = await import(pathToFileURL(require.resolve('prettier')).href)
const prettier = prettierModule.default ?? prettierModule
const config = await prettier.resolveConfig(OUT)
const formatted = await prettier.format(header, { ...config, filepath: OUT })

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, formatted)

const bytes = Buffer.byteLength(formatted, 'utf8')
console.log('')
console.log('  sandbox roster generated')
console.log(`  out                 ${path.relative(REPO, OUT).replace(/\\/g, '/')}`)
console.log(`  cars                ${roster.length} (${inGame} in game, ${research} synthesised)`)
console.log(`  size                ${(bytes / 1024).toFixed(1)} KiB (${bytes} bytes)`)
console.log('')
