import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'
import { readRoster } from './rosterCsv'

/**
 * `docs/design/midnight-garage-roster.csv` is the single source of truth for
 * every per-car value the game has, and `packages/content/data/cars.json` is
 * GENERATED from it by `scripts/generateCars.cjs`. This guard runs that
 * generator in `--print` mode, which touches no file, and compares its output
 * to the shipped one in both directions: a value edited into `cars.json` by
 * hand fails here, and so does a CSV edit that was never regenerated.
 *
 * It replaces `carSpecBookGuard.test.ts`, which pinned `cars.json` to
 * `docs/design/car-performance/car-spec-book.html` and told the reader to
 * re-run an importer that had been throwing for months. The book keeps its real
 * job - it is the evidence archive, and its `fz` records are the verbatim Forza
 * panel captures behind every measured figure - but it is no longer a place a
 * human types a number, and no tool reads its adopted-figure columns.
 *
 * ONE CAR IS EXEMPT, by name, below.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..')
const GENERATOR = join(REPO_ROOT, 'scripts', 'generateCars.cjs')
const CARS_JSON = join(REPO_ROOT, 'packages', 'content', 'data', 'cars.json')

interface Model {
  id: string
  spec: Record<string, unknown>
  [key: string]: unknown
}

const SHIPPED_TEXT = readFileSync(CARS_JSON, 'utf8')
const GENERATED_TEXT = execFileSync(process.execPath, [GENERATOR, '--print'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
const GENERATED = JSON.parse(GENERATED_TEXT) as Model[]
const SHIPPED = cars as unknown as Model[]

describe('cars.json is generated from the roster CSV', () => {
  it('is byte-identical to a fresh generator run', () => {
    expect(
      GENERATED_TEXT === SHIPPED_TEXT,
      'cars.json is not what the generator produces. Re-run ' +
        '`node scripts/generateCars.cjs` rather than editing it by hand.',
    ).toBe(true)
  })

  it('ships one car for every roster row marked as built, and no other', () => {
    const built = readRoster()
      .filter((row) => row.get('builtInContent') === 'yes')
      .map((row) => row.get('id'))
      .sort()
    expect(SHIPPED.map((car) => car.id).sort()).toEqual(built)
    expect(new Set(SHIPPED.map((car) => car.id)).size).toBe(SHIPPED.length)
  })

  it('carries every field the roster authors, on every car, in both directions', () => {
    const mismatches: string[] = []
    for (const id of new Set([...GENERATED, ...SHIPPED].map((car) => car.id))) {
      const generated = GENERATED.find((car) => car.id === id)
      const shipped = SHIPPED.find((car) => car.id === id)
      if (!generated) {
        mismatches.push(`${id}: in cars.json but not in the roster's built rows`)
        continue
      }
      if (!shipped) {
        mismatches.push(`${id}: the roster builds it but cars.json does not ship it`)
        continue
      }
      for (const key of new Set([...Object.keys(generated), ...Object.keys(shipped)])) {
        if (key === 'spec') continue
        if (JSON.stringify(generated[key]) !== JSON.stringify(shipped[key])) {
          mismatches.push(
            `${id}.${key}: cars.json ${JSON.stringify(shipped[key])}, ` +
              `roster ${JSON.stringify(generated[key])}`,
          )
        }
      }
      for (const key of new Set([...Object.keys(generated.spec), ...Object.keys(shipped.spec)])) {
        if (JSON.stringify(generated.spec[key]) !== JSON.stringify(shipped.spec[key])) {
          mismatches.push(
            `${id}.spec.${key}: cars.json ${JSON.stringify(shipped.spec[key])}, ` +
              `roster ${JSON.stringify(generated.spec[key])}`,
          )
        }
      }
    }
    expect(
      mismatches,
      'cars.json and the roster CSV disagree. The CSV is the source: edit it and ' +
        're-run `node scripts/generateCars.cjs` rather than editing cars.json by hand.',
    ).toEqual([])
  })
})
