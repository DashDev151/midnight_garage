/*
 * GENERATES `packages/content/data/cars.json` FROM THE ROSTER CSV.
 *
 * `docs/design/midnight-garage-roster.csv` is the single source of truth for
 * every per-car value the game has (CLAUDE.md, directive 24). This script emits
 * one `CarModel` for every row marked `builtInContent: yes`, in the order
 * `CarModelSchema` declares its fields, and PARSES ITS OWN OUTPUT with that
 * schema before writing: a row that cannot make a legal car fails here rather
 * than at runtime.
 *
 * Run it after editing the CSV:
 *
 *   node scripts/generateCars.cjs            writes the file
 *   node scripts/generateCars.cjs --print    writes to stdout and touches nothing
 *
 * Output is formatted with the repo's own Prettier config, so a run is
 * byte-stable and `pnpm format` has nothing to say about it.
 * `packages/content/tests/carsGeneratedFromRoster.test.ts` fails if the two
 * ever drift.
 */
const fs = require('fs')
const path = require('path')
const { registerHooks } = require('node:module')

/**
 * `@midnight-garage/content` is published as raw TypeScript with extensionless
 * relative imports, which Node resolves for a bundler but not for itself. This
 * appends the extension on the second attempt so the generator can validate
 * against the REAL `CarModelSchema` rather than a copy of it.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (!specifier.startsWith('.')) throw error
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})

const REPO_ROOT = path.join(__dirname, '..')
const ROSTER_CSV = path.join(REPO_ROOT, 'docs', 'design', 'midnight-garage-roster.csv')
const CARS_JSON = path.join(REPO_ROOT, 'packages', 'content', 'data', 'cars.json')

/** RFC 4180 fields: quoted values may hold commas, newlines and "" escapes. */
function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1)
}

function readRoster() {
  const rows = parseCsv(fs.readFileSync(ROSTER_CSV, 'utf8'))
  const header = rows[0]
  return rows.slice(1).map((cells) => {
    if (cells.length !== header.length) {
      throw new Error(
        `roster CSV: row ${cells[0]} has ${cells.length} cells, expected ${header.length}`,
      )
    }
    const get = (column) => {
      const index = header.indexOf(column)
      if (index < 0) throw new Error(`roster CSV: no column named ${column}`)
      return cells[index]
    }
    return get
  })
}

/**
 * The CSV's `culture` column is written for a human reading a spreadsheet
 * ("Honest transport"); `CarCultureSchema` is the kebab form of the same
 * vocabulary, and normalising keeps that vocabulary in exactly one place.
 */
function cultureIdFor(label) {
  return label.trim().toLowerCase().replace(/ /g, '-')
}

/** A required number: a blank cell is an authoring error, not a zero. */
function num(get, column) {
  const cell = get(column)
  if (cell === '') throw new Error(`${get('uid')}: ${column} is blank`)
  const value = Number(cell)
  if (!Number.isFinite(value)) throw new Error(`${get('uid')}: ${column} is not a number (${cell})`)
  return value
}

/** An optional number: a blank cell means the field is absent, not zero. */
function optionalNum(get, column) {
  const cell = get(column)
  if (cell === '') return undefined
  const value = Number(cell)
  if (!Number.isFinite(value)) throw new Error(`${get('uid')}: ${column} is not a number (${cell})`)
  return value
}

function optionalText(get, column) {
  const cell = get(column)
  return cell === '' ? undefined : cell
}

/** A space-separated list column, absent when the cell is blank. */
function optionalList(get, column) {
  const cell = get(column)
  return cell === '' ? undefined : cell.split(' ')
}

/**
 * Factory active torque vectoring, identified by engine code exactly as the lap
 * harness identifies it (`tools/sandbox/generateCars.mjs`, `activeYawFor`). It
 * is derived rather than authored because the roster already carries the field
 * it is read off, and a second column holding the same fact could disagree with
 * the first.
 */
function activeYawFor(get) {
  const engineCode = get('engineCode')
  if (/RB26DETT|VR38DETT/.test(engineCode)) return 'attesa'
  if (/^(4G63|4B11)/.test(engineCode) && /Lancer Evo/i.test(get('variantLabel'))) return 'ayc'
  return undefined
}

/** One roster row as a `CarModel`, in `CarModelSchema`'s own field order. */
function modelFor(get) {
  const id = get('id')
  const spec = {
    chassisCode: get('chassisCode'),
    engineCode: get('engineCode'),
    culture: cultureIdFor(get('culture')),
    yearFrom: num(get, 'yearFrom'),
    yearTo: num(get, 'yearTo'),
    curbWeightKg: num(get, 'curbWeightKg'),
    stockPowerPs: num(get, 'stockPowerPs'),
    quotedPowerPs: optionalNum(get, 'quotedPowerPs'),
    powerRpm: optionalNum(get, 'powerRpm'),
    peakTorqueNm: optionalNum(get, 'peakTorqueNm'),
    torqueRpm: optionalNum(get, 'torqueRpm'),
    redlineRpm: optionalNum(get, 'redlineRpm'),
    displacementCc: optionalNum(get, 'displacementCc'),
    engineConfig: optionalText(get, 'engineConfig'),
    aspiration: get('aspiration'),
    reliabilityBase: num(get, 'reliabilityBase'),
    styleBase: num(get, 'styleBase'),
    styleCeiling: num(get, 'styleCeiling'),
    aeroCeiling: num(get, 'aeroCeiling'),
    factoryColours: get('factoryColours').split('|'),
    weightDistributionFront: optionalNum(get, 'weightDistributionFront'),
    wheelbaseMm: optionalNum(get, 'wheelbaseMm'),
    comHeightMm: optionalNum(get, 'comHeightMm'),
    dragCd: optionalNum(get, 'dragCd'),
    widthMm: optionalNum(get, 'widthMm'),
    heightMm: optionalNum(get, 'heightMm'),
    stockTyre: optionalText(get, 'stockTyre'),
    tyreCompound: optionalText(get, 'tyreCompound'),
    activeYaw: activeYawFor(get),
    topSpeedKmh: optionalNum(get, 'topSpeedKmh'),
    lateralG97: optionalNum(get, 'lateralG97'),
    lateralG193: optionalNum(get, 'lateralG193'),
    braking97To0M: optionalNum(get, 'braking97To0M'),
    braking161To0M: optionalNum(get, 'braking161To0M'),
    zeroTo97S: optionalNum(get, 'zeroTo97S'),
    zeroTo161S: optionalNum(get, 'zeroTo161S'),
    measuredFrom: optionalText(get, 'measuredFrom'),
    dataConfidence: optionalText(get, 'dataConfidence'),
    estimatedFields: optionalList(get, 'estimatedFields'),
  }
  for (const key of Object.keys(spec)) {
    if (spec[key] === undefined) delete spec[key]
  }
  return {
    id,
    uid: get('uid'),
    displayName: get('displayName'),
    brand: get('brand'),
    parodyName: get('parodyName'),
    parodyBrand: get('parodyBrand'),
    spec,
    tier: get('tier'),
    rarity: get('rarity'),
    origin: get('origin'),
    tags: get('tags').split(' '),
    bookValueYen: num(get, 'bookValueYen'),
  }
}

async function main() {
  const roster = readRoster()
  const built = roster.filter((get) => get('builtInContent') === 'yes')
  const models = built.map(modelFor)

  // Validated by the schema that already exists, so a bad row fails loudly here
  // rather than quietly at runtime.
  const { CarModelsSchema } = require('../packages/content/src/carModel.ts')
  CarModelsSchema.parse(models)

  const prettier = require('prettier')
  const config = await prettier.resolveConfig(CARS_JSON)
  const formatted = await prettier.format(JSON.stringify(models), {
    ...config,
    filepath: CARS_JSON,
  })

  if (process.argv.includes('--print')) {
    process.stdout.write(formatted)
    return
  }
  fs.writeFileSync(CARS_JSON, formatted, 'utf8')

  console.log('')
  console.log('  cars.json generated from the roster CSV')
  console.log(`  cars                ${models.length} of ${roster.length} roster rows`)
  console.log(`  out                 ${path.relative(REPO_ROOT, CARS_JSON).replace(/\\/g, '/')}`)
  console.log('')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
