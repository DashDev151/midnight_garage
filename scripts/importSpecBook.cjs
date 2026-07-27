/*
 * Copies every measured and superseded figure from the car spec book into
 * `packages/content/data/cars.json`, and prints a field-by-field diff of what
 * moved.
 *
 * The spec book (`docs/design/car-performance/car-spec-book.html`) is the
 * vetted upstream: its `CARS` array is where a figure is argued about and
 * ruled on. Content is a copy of it, never a second opinion, so every value
 * here is copied programmatically and none is retyped, rounded or recomputed.
 * `packages/content/tests/carSpecBookGuard.test.ts` fails if the two drift.
 *
 * Usage: node scripts/importSpecBook.cjs
 * Then:  npx prettier --write packages/content/data/cars.json
 */
const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.join(__dirname, '..')
const SPEC_BOOK = path.join(REPO_ROOT, 'docs', 'design', 'car-performance', 'car-spec-book.html')
const CARS_JSON = path.join(REPO_ROOT, 'packages', 'content', 'data', 'cars.json')

/** Spec `spec` key order, matching the Zod schema's declaration order. */
const SPEC_KEY_ORDER = [
  'chassisCode',
  'engineCode',
  'yearFrom',
  'curbWeightKg',
  'stockPowerPs',
  'quotedPowerPs',
  'powerRpm',
  'peakTorqueNm',
  'torqueRpm',
  'redlineRpm',
  'displacementCc',
  'engineConfig',
  'aspiration',
  'weightDistributionFront',
  'wheelbaseMm',
  'comHeightMm',
  'dragCd',
  'widthMm',
  'heightMm',
  'stockTyre',
  'tyreCompound',
  'downforceCoeff',
  'activeYaw',
  'zeroToHundredS',
  'topSpeedKmh',
  'lateralG97',
  'lateralG193',
  'braking97To0M',
  'braking161To0M',
  'zeroTo97S',
  'zeroTo161S',
  'measuredFrom',
  'dataConfidence',
  'estimatedFields',
]

/** Reads the spec book's `CARS` array exactly as the lap harness does. */
function readSpecBook() {
  const html = fs.readFileSync(SPEC_BOOK, 'utf8')
  const body = html.match(/const CARS = \[([\s\S]*?)\n\];/)
  if (!body) throw new Error('spec book: no CARS array found')
  const cars = eval('[' + body[1] + ']')
  // The book stores 0-97 km/h as z97 and 0-161 km/h inside the verbatim `fz`
  // panel record as a100 (0-100 mph). Lift the second so both halves of the
  // acceleration pair read off the same object whatever the record's shape.
  cars.forEach((car) => {
    if (car.z161 == null && car.fz && car.fz.a100 != null) car.z161 = car.fz.a100
  })
  return cars
}

/** Both halves of a pair, or neither: a lateral reading alone cannot separate
 * mechanical grip from downforce, and there is no one-reading path for it. */
function pair(target, firstKey, firstValue, secondKey, secondValue) {
  if (firstValue != null && secondValue != null) {
    target[firstKey] = firstValue
    target[secondKey] = secondValue
  } else {
    delete target[firstKey]
    delete target[secondKey]
  }
}

/** Braking and acceleration carry the slower reading whenever the book has one,
 * because the model has a one-measurement path that spends it: a car too slow
 * to reach the higher test speed publishes only the lower figure, and throwing
 * it away costs that car real accuracy. The faster reading is only ever carried
 * beside the slower one. */
function slowerLedPair(target, firstKey, firstValue, secondKey, secondValue) {
  if (firstValue != null) target[firstKey] = firstValue
  else delete target[firstKey]
  if (firstValue != null && secondValue != null) target[secondKey] = secondValue
  else delete target[secondKey]
}

function provenanceOf(book) {
  if (book.gOvr != null) return 'forza-panel-override'
  return book.src === 'forza' ? 'forza-panel' : 'modelled'
}

/** Rebuilds a spec in schema key order, refusing any key the order omits. */
function inSchemaOrder(spec) {
  for (const key of Object.keys(spec)) {
    if (!SPEC_KEY_ORDER.includes(key)) throw new Error(`spec key outside the known order: ${key}`)
  }
  const ordered = {}
  for (const key of SPEC_KEY_ORDER) {
    if (Object.prototype.hasOwnProperty.call(spec, key)) ordered[key] = spec[key]
  }
  return ordered
}

function main() {
  const book = readSpecBook()
  const cars = JSON.parse(fs.readFileSync(CARS_JSON, 'utf8'))
  const changes = []

  for (const car of cars) {
    const entry = book.find((b) => b.id === car.id)
    if (!entry) throw new Error(`${car.id} is not in the spec book`)
    const before = { ...car.spec }
    const spec = { ...car.spec }

    spec.yearFrom = entry.y
    spec.curbWeightKg = entry.kg
    spec.stockPowerPs = entry.ps
    spec.weightDistributionFront = entry.fr
    spec.dragCd = entry.cd
    if (entry.top != null) spec.topSpeedKmh = entry.top
    else delete spec.topSpeedKmh
    pair(spec, 'lateralG97', entry.g97, 'lateralG193', entry.g193)
    slowerLedPair(spec, 'braking97To0M', entry.b97, 'braking161To0M', entry.b161)
    slowerLedPair(spec, 'zeroTo97S', entry.z97, 'zeroTo161S', entry.z161)
    spec.measuredFrom = provenanceOf(entry)

    for (const key of SPEC_KEY_ORDER) {
      if (before[key] !== spec[key]) {
        changes.push({ id: car.id, field: key, from: before[key], to: spec[key] })
      }
    }
    car.spec = inSchemaOrder(spec)
  }

  fs.writeFileSync(CARS_JSON, JSON.stringify(cars, null, 2) + '\n', 'utf8')

  console.log('| car | field | from | to |')
  console.log('|---|---|---|---|')
  for (const change of changes) {
    const from = change.from === undefined ? 'absent' : String(change.from)
    console.log(`| ${change.id} | ${change.field} | ${from} | ${String(change.to)} |`)
  }
  console.log(`\n${changes.length} field changes across ${cars.length} cars`)
}

main()
