/*
 * GENERATES `packages/sim/tests/harnessReferenceTimes.json`.
 *
 * The acceptance fixture is the calibration harness's own computed time for
 * every shipped car on every shipped course. The harness writes those times to
 * `docs/design/car-performance/lapsim/lapsim-data.json` for all 85 cars it
 * knows; this selects the shipped subset, so adding a car to `cars.json` no
 * longer means hand-copying four numbers.
 *
 *   node scripts/generateHarnessReferenceTimes.cjs
 *
 * It computes nothing. Every figure it writes is the harness's own, unrounded
 * and unaltered, which is what keeps the fixture a check against a known answer
 * rather than a pin of the game's own output.
 *
 * A shipped car the harness has never run has no entry here and cannot get one
 * from this script: it needs a spec-book entry and a harness run first.
 * `harnessAcceptance.test.ts` names those cars explicitly.
 */
const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.join(__dirname, '..')
const LAPSIM_DATA = path.join(
  REPO_ROOT,
  'docs',
  'design',
  'car-performance',
  'lapsim',
  'lapsim-data.json',
)
const CARS_JSON = path.join(REPO_ROOT, 'packages', 'content', 'data', 'cars.json')
const FIXTURE = path.join(REPO_ROOT, 'packages', 'sim', 'tests', 'harnessReferenceTimes.json')

const harness = JSON.parse(fs.readFileSync(LAPSIM_DATA, 'utf8'))
const cars = JSON.parse(fs.readFileSync(CARS_JSON, 'utf8'))
const timesById = new Map(harness.cars.map((car) => [car.id, car.t]))

const reference = {}
const unrun = []
for (const car of cars) {
  const times = timesById.get(car.id)
  if (!times) {
    unrun.push(car.id)
    continue
  }
  reference[car.id] = times
}

fs.writeFileSync(FIXTURE, `${JSON.stringify(reference, null, 2)}\n`, 'utf8')

console.log('')
console.log('  harness reference times generated')
console.log(`  cars                ${Object.keys(reference).length} of ${cars.length} shipped`)
console.log(`  never run           ${unrun.length === 0 ? 'none' : unrun.join(', ')}`)
console.log(`  out                 ${path.relative(REPO_ROOT, FIXTURE).replace(/\\/g, '/')}`)
console.log('')
